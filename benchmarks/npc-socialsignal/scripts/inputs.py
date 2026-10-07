#!/usr/bin/env python3
"""E1R input construction (R1 + R4).

Owns everything the model sees, so that "same input for every candidate" is one
code path instead of three accidental ones:

  * body assembly from UNLABELED rows only (final split has no gold in the repo)
  * real token counting against the checkpoint's own tokenizer
  * the documented truncation policy, executed and recorded line by line
  * option ordering by stable semantic id, with a reversible label map
  * paraphrase only from an authored, human-reviewable table (no character swaps)
"""
import json
import os

SECTIONS_ORDER = ["既往", "已知边界"]
NEVER_REMOVED = ["NPC", "此刻"]


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def rows_from_jsonl(path):
    out = []
    with open(path, encoding="utf-8") as fh:
        for n, line in enumerate(fh, 1):
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def find_repo_gold(rows):
    """R1 guard: the repository copy of the final split must carry no answer key."""
    bad = []
    for r in rows:
        for forbidden in ("labels", "basis", "ambiguous_by_design", "hidden_truth"):
            if forbidden in r:
                bad.append((r.get("sid"), forbidden))
    return bad


def render_body(persona, boundary, history, turn):
    lines = [f"【NPC】{persona}",
             f"【已知边界】{boundary if boundary else '无（该 NPC 从未被告知相关规矩）'}",
             "【既往】"]
    lines += [f"- {h}" for h in history] if history else ["- 无"]
    lines.append(f"【此刻】{turn}")
    return "\n".join(lines)


def build_body(row, paraphrase_table=None, sid=None):
    """Primary (short) body. Uses the paraphrase table when the condition asks for it."""
    sid = sid or row["sid"]
    if paraphrase_table is not None:
        if sid not in paraphrase_table:
            return None, {"skipped": "no_authored_paraphrase"}
        entry = paraphrase_table[sid]
        return render_body(row["persona"], row.get("boundary"),
                          entry["history"] if "history" in entry else (row.get("history") or []),
                          entry["turn"]), {"used_paraphrase": True}
    return render_body(row["persona"], row.get("boundary"), row.get("history") or [], row["turn"]), {}


def count_tokens(tok, text):
    return len(tok(text, add_special_tokens=False)["input_ids"])


def assemble_with_budget(tok, row, state_budget_tokens, paraphrase_table=None, extra_history_key="extra_history"):
    """Build the longest body that fits state_budget_tokens, then truncate per policy:
    drop the oldest 既往 lines first, then 已知边界. NPC identity and 此刻 are never dropped.

    Returns (body, report). report.removed_lines lists the exact dropped evidence, so a
    case whose decisive evidence was removed can be re-reviewed instead of scored
    against a gold label the model can no longer see.
    """
    history = list(row.get("history") or [])
    if extra_history_key in row:
        history = history + list(row[extra_history_key])
    if paraphrase_table is not None:
        entry = paraphrase_table.get(row["sid"])
        if entry is None:
            return None, {"skipped": "no_authored_paraphrase"}
        history = [entry["history"]] if "history" in entry else history
        turn = entry["turn"]
    else:
        turn = row["turn"]

    removed = []
    used_boundary = True
    body = render_body(row["persona"], row.get("boundary"), history, turn)
    n = count_tokens(tok, body)
    while n > state_budget_tokens and len(history) > len(removed):
        dropped = history.pop(0)
        removed.append(dropped)
        body = render_body(row["persona"], row.get("boundary"), history, turn)
        n = count_tokens(tok, body)
    if n > state_budget_tokens and used_boundary:
        used_boundary = False
        removed.append("已知边界: " + str(row.get("boundary")))
        body = render_body(row["persona"], None, history, turn)
        n = count_tokens(tok, body)
    decisive = set(row.get("decisive_evidence") or [])
    lost = [r for r in removed if any(d in r for d in decisive)]
    return body, {"tokens": n, "budget": state_budget_tokens, "removed_lines": removed,
                  "boundary_kept": used_boundary, "requires_relabel": bool(lost),
                  "lost_decisive_evidence": lost, "needs_tokens_no_truncation": None}


def ordered_criteria(spec, order):
    """order: canonical | rotated | reversed. Returns (criteria dict, label_map)."""
    canon = list(spec["canonical_order"])
    if order == "rotated":
        seq = canon[1:] + canon[:1]
    elif order == "reversed":
        seq = list(reversed(canon))
    elif order == "canonical":
        seq = list(canon)
    else:
        raise ValueError(f"unknown option order {order}")
    criteria = {k: spec["options"][k] for k in seq}
    return criteria, {"requested_order": seq, "semantic_labels": canon}


def map_choice_back(choice, spec):
    """Stable semantic id mapping: option keys ARE the semantic labels, so ordering
    cannot change what a choice means. Guarded so an out-of-set answer is illegal,
    not silently coerced."""
    canon = set(spec["canonical_order"])
    if choice not in canon:
        return None
    return choice
