#!/usr/bin/env python3
"""E1R2 input construction (F4 + shared row loading).

Single source of truth for what the model sees, so runner and scorer cannot drift
onto different final inputs:

  * `rows_for(split)` is the ONLY way either entry point loads scenarios; the final
    split always comes from the in-repo blind file (no answer keys anywhere in the
    repository copies)
  * boundary rendering distinguishes three cases that must never be conflated:
    stated / never_declared_by_design / outside_the_visible_window (truncated away)
  * budget enforcement deletes the OLDEST history lines until the body fits or the
    history is empty, then handles the boundary, and REFUSES rather than silently
    exceeding the budget while claiming the input was identical
  * items whose decisive evidence was deleted are marked requires_relabel and are
    refused by the formal scorer
"""
import json
import os

SECTIONS_ORDER = ["既往", "已知边界"]
NEVER_REMOVED = ["NPC", "此刻"]
BOUNDARY_STATED = "stated"
BOUNDARY_NEVER = "never_declared"
BOUNDARY_OUTSIDE = "outside_window"


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def read_jsonl(path):
    out = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                out.append(json.loads(line))
    return out


def rows_for(root, split):
    """dev/calibration: authored rows (gold present, working splits).
    final: the blind file only, so runner and scorer read literally the same rows."""
    if split == "final":
        return read_jsonl(os.path.join(root, "samples", "scenarios-final-blind.jsonl"))
    from body import load_split
    return load_split(root, split)


def find_repo_gold(rows):
    bad = []
    for r in rows:
        for forbidden in ("labels", "basis", "ambiguous_by_design", "hidden_truth"):
            if forbidden in r:
                bad.append((r.get("sid"), forbidden))
    return bad


def render_body(persona, boundary, history, turn, boundary_state=BOUNDARY_STATED):
    """boundary_state keeps absence from being rewritten into a claimed fact."""
    if boundary_state == BOUNDARY_STATED and boundary:
        b = boundary
    elif boundary_state == BOUNDARY_NEVER:
        b = "无（该 NPC 从未被告知相关规矩）"
    elif boundary_state == BOUNDARY_OUTSIDE:
        b = "（本条件下该条边界不在可见窗口内，未纳入本次输入）"
    else:
        b = "无（该 NPC 从未被告知相关规矩）"
    lines = [f"【NPC】{persona}", f"【已知边界】{b}", "【既往】"]
    lines += [f"- {h}" for h in history] if history else ["- 无"]
    lines.append(f"【此刻】{turn}")
    return "\n".join(lines)


def authored_boundary_state(row):
    return BOUNDARY_STATED if row.get("boundary") else BOUNDARY_NEVER


def build_body(row, paraphrase_table=None):
    sid = row["sid"]
    if paraphrase_table is not None:
        entry = paraphrase_table.get(sid)
        if entry is None:
            return None, {"skipped": "no_authored_paraphrase"}
        history = entry["history"] if isinstance(entry.get("history"), list) else (row.get("history") or [])
        return render_body(row["persona"], row.get("boundary"), history, entry["turn"],
                           authored_boundary_state(row)), {"used_paraphrase": True}
    return render_body(row["persona"], row.get("boundary"), row.get("history") or [], row["turn"],
                       authored_boundary_state(row)), {}


def count_tokens(tok, text):
    return len(tok(text, add_special_tokens=False)["input_ids"])


def decisive_lines_for(row, signal):
    """Per-signal traceable references. Kept as text substrings / line indices that a
    reviewer can check; the authoritative copy for the final split stays outside the
    repository, and none of this is ever passed to the model."""
    de = row.get("decisive_evidence") or {}
    v = de.get(signal) if isinstance(de, dict) else None
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def assemble_with_budget(counter, row, state_budget_tokens, signal, paraphrase_table=None,
                         extra_history_key="extra_history"):
    """Longest body that fits the state budget, with an auditable deletion order.

    `counter` maps text -> token count (the runner passes the worker's tokenizer, so
    budgets are measured by the checkpoint's own tokenizer rather than estimated).

    Never returns a body over budget: if the undeletable core (NPC + 此刻 + the fixed
    section frames) still exceeds the budget, it returns (None, {refused: ...}) so the
    caller records an explicit failure instead of comparing a silently truncated input
    against gold labels written for the full one.
    """
    history = list(row.get("history") or [])
    turn = row["turn"]
    if paraphrase_table is not None:
        entry = paraphrase_table.get(row["sid"])
        if entry is None:
            return None, {"skipped": "no_authored_paraphrase"}
        turn = entry["turn"]
        if isinstance(entry.get("history"), list):
            history = list(entry["history"])
    elif row.get(extra_history_key):
        history = history + list(row[extra_history_key])

    bstate = authored_boundary_state(row)
    removed, boundary_dropped = [], False
    body = render_body(row["persona"], row.get("boundary"), history, turn, bstate)
    tokens_before = counter(body)
    n = tokens_before

    # 1) oldest 既往 lines go first, and keep going until it fits or history is empty
    while n > state_budget_tokens and history:
        dropped = history.pop(0)
        removed.append({"line": dropped, "reason": "oldest_history_over_budget"})
        body = render_body(row["persona"], row.get("boundary"), history, turn, bstate)
        n = counter(body)

    # 2) still over: mark the boundary as outside the window (never as "never informed")
    if n > state_budget_tokens and bstate == BOUNDARY_STATED:
        boundary_dropped = True
        removed.append({"line": "已知边界: " + str(row.get("boundary")),
                        "reason": "boundary_outside_window"})
        body = render_body(row["persona"], row.get("boundary"), history, turn, BOUNDARY_OUTSIDE)
        n = counter(body)

    decisive = decisive_lines_for(row, signal)
    lost = [d for d in decisive if d and any(d in rm["line"] for rm in removed)] if decisive else []
    report = {"tokens_before_truncation": tokens_before, "tokens_after": n,
              "state_budget": state_budget_tokens,
              "removed_lines": removed, "history_remaining": len(history),
              "boundary_state": BOUNDARY_OUTSIDE if boundary_dropped else bstate,
              "boundary_kept": not boundary_dropped,
              "signal": signal, "decisive_evidence": decisive,
              "lost_decisive_evidence": lost,
              "requires_relabel": bool(lost) or boundary_dropped,
              "state_tokens": n}
    if n > state_budget_tokens:
        return None, dict(report, refused="core_over_budget", minimum_possible_tokens=n)
    return body, report


def ordered_criteria(spec, order):
    canon = list(spec["canonical_order"])
    if order == "rotated":
        seq = canon[1:] + canon[:1]
    elif order == "reversed":
        seq = list(reversed(canon))
    elif order == "canonical":
        seq = list(canon)
    else:
        raise ValueError(f"unknown option order {order}")
    return {k: spec["options"][k] for k in seq}, {"requested_order": seq, "semantic_labels": canon}


def map_choice_back(choice, spec):
    """Option keys are the semantic labels, so reordering cannot change meaning;
    anything outside the canonical set is illegal rather than coerced."""
    return choice if choice in set(spec["canonical_order"]) else None
