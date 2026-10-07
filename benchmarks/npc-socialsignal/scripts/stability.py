#!/usr/bin/env python3
"""E1R2 stability analysis over indexed runner outputs.

Only registered prediction files are consumed. Every comparison denominator is
the planned scenario/signal set (or the explicit authored paraphrase subset),
so missing rows, invalid answers, and failures remain instability.

  python scripts/stability.py --models A,B --split dev
"""
import argparse
import datetime
import json
import os
import statistics
import sys
from collections import Counter

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from body import load_questions  # noqa: E402
from inputs import map_choice_back, rows_for, read_jsonl  # noqa: E402
import score  # noqa: E402

CONDITIONS = ("perm_rotated", "perm_reversed", "paraphrase", "long", "max_len_8192")
PARAPHRASE_PATH = os.path.join(HERE, "samples", "paraphrase-dev.jsonl")
PARAPHRASE_SPLIT = "dev"
PROBE_NAMES = ("empty", "address_only", "oversized", "latin_only", "control_chars")


def stat(nums):
    if not nums:
        return None
    nums = sorted(nums)
    return {"n": len(nums), "median_ms": round(statistics.median(nums), 1),
            "p95_ms": round(nums[min(int(0.95 * len(nums)), len(nums) - 1)], 1),
            "max_ms": round(nums[-1], 1)}


def authored_paraphrases(path=PARAPHRASE_PATH):
    """Return the preregistered rewrite ids; duplicates or malformed rows fail."""
    entries = read_jsonl(path)
    ids = [e.get("sid") for e in entries]
    if any(not isinstance(sid, str) or not sid for sid in ids):
        raise ValueError("paraphrase preregistration has a missing/invalid sid")
    if len(ids) != len(set(ids)):
        raise ValueError("paraphrase preregistration has duplicate sids")
    return entries, ids


def map_prediction(record, spec):
    """Map an option key to its stable semantic label; invalid values stay invalid."""
    pred = record.get("predicted")
    return map_choice_back(pred, spec) if pred is not None else None


def validate_record_semantics(record, spec, key):
    """Reject corrupt option metadata while allowing an illegal answer to be counted."""
    canonical = list(spec["canonical_order"])
    if record.get("predict_error") or record.get("excluded_from_formal_scoring") or record.get("requires_relabel") or (record.get("input_report") or {}).get("requires_relabel"):
        return "failed"
    labels = record.get("semantic_labels")
    requested = record.get("requested_criteria_order")
    if labels is not None and (not isinstance(labels, list) or set(labels) != set(canonical)
                               or len(labels) != len(canonical)):
        raise ValueError(f"{key} semantic_labels do not match the template")
    if requested is not None and (not isinstance(requested, list) or set(requested) != set(canonical)
                                  or len(requested) != len(canonical)):
        raise ValueError(f"{key} requested_criteria_order is not a template permutation")
    if record.get("predicted") is not None and map_prediction(record, spec) is None:
        return "illegal"
    return "valid" if record.get("predicted") is not None else "failed"


def _missing_only(problem):
    return problem.startswith("MISSING prediction row for ")


def load_run(model, split, condition, index_path, planned_ids, qt):
    """Resolve through score's run-index/hash chain and load only planned rows.

    Returns (run, refusal). A condition with no registered entry is simply
    not_run; an indexed artifact with integrity defects is refused.
    """
    try:
        path, entry, problems = score.resolve_prediction_file(
            model, split, condition, index_path=index_path)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, json.JSONDecodeError) as exc:
        return None, [f"cannot read run index for {model}/{split}/{condition}: {exc}"]
    if path is None:
        if any("run index has no entry" in p for p in problems):
            return None, None
        return None, problems
    if problems:
        return None, problems
    try:
        by, load_problems = score.load_preds(path, model, split, condition, planned_ids)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, json.JSONDecodeError) as exc:
        return None, [f"cannot parse indexed predictions {score.display_path(path)}: {exc}"]
    structural = [p for p in load_problems if not _missing_only(p)]
    if structural:
        return None, structural
    indexed_records = entry.get("records")
    loaded_records = sum(len(signals) for signals in by.values())
    if indexed_records is not None and indexed_records != loaded_records:
        return None, [f"indexed record count mismatch for {score.display_path(path)}: "
                      f"index={indexed_records} loaded={loaded_records}"]

    illegal_answers = []
    for sid, signals in by.items():
        for signal, record in signals.items():
            key = f"{sid}/{signal}"
            try:
                state = validate_record_semantics(record, qt["signals"][signal], key)
            except ValueError as exc:
                return None, [str(exc)]
            if state == "failed" and not (record.get("predict_error") or record.get("excluded_from_formal_scoring") or record.get("requires_relabel") or (record.get("input_report") or {}).get("requires_relabel")):
                return None, [f"{key} has neither a prediction nor a recorded error"]
            if state == "illegal":
                illegal_answers.append(key)
    # Keep semantic illegal labels in the denominator, but refuse malformed
    # confidence/probability data and other scorer integrity defects.
    probs = score.check_probs(by)
    malformed = [p for p in probs if "illegal predicted label" not in p]
    if malformed:
        return None, malformed
    return {"path": score.display_path(path), "sha256": entry.get("sha256"),
            "index_entry": entry, "predictions": by, "illegal_keys": illegal_answers}, None


def run_coverage(run, planned_keys):
    if run is None:
        return {"planned_items": len(planned_keys), "returned_items": 0,
                "coverage": 0.0 if planned_keys else None, "missing_items": len(planned_keys),
                "illegal_items": 0, "failed_items": 0, "refused_items": 0,
                "excluded_from_formal_scoring": 0, "lost_decisive_evidence": 0,
                "lost_boundary": 0, "latency": None}
    by = run["predictions"]
    found = [(sid, sig, by[sid][sig]) for sid, sig in planned_keys
             if sid in by and sig in by[sid]]
    missing = len(planned_keys) - len(found)
    illegal = failed = refused = excluded = lost_evidence = lost_boundary = 0
    latencies = []
    for _, _, record in found:
        state = record.get("input_report") or {}
        illegal += int(f"{record['sid']}/{record['signal']}" in run.get("illegal_keys", ()))
        failed += int(bool(record.get("predict_error")))
        refused += int(bool(record.get("not_executed") or state.get("refused")))
        excluded += int(bool(record.get("excluded_from_formal_scoring") or record.get("requires_relabel")))
        lost_evidence += int(bool(state.get("lost_decisive_evidence")))
        lost_boundary += int(state.get("boundary_kept") is False or
                             state.get("boundary_state") == "outside_window")
        if isinstance(record.get("wall_ms_per_item"), (int, float)):
            latencies.append(record["wall_ms_per_item"])
    return {"planned_items": len(planned_keys), "returned_items": len(found),
            "coverage": round(len(found) / len(planned_keys), 4) if planned_keys else None,
            "missing_items": missing, "illegal_items": illegal, "failed_items": failed,
            "refused_items": refused, "excluded_from_formal_scoring": excluded,
            "lost_decisive_evidence": lost_evidence, "lost_boundary": lost_boundary,
            "latency": stat(latencies)}


def compare(primary, condition, planned_keys, spec_by_signal):
    """Compare all planned keys. Any missing, illegal, or failed side is unstable."""
    a = primary["predictions"] if primary else {}
    b = condition["predictions"] if condition else {}
    same = 0
    both_failed = missing_side = illegal_side = failed_side = 0
    flips = []
    for sid, signal in planned_keys:
        r0 = a.get(sid, {}).get(signal)
        r1 = b.get(sid, {}).get(signal)
        if r0 is None or r1 is None:
            missing_side += 1
            flips.append({"sid": sid, "signal": signal, "kind": "missing_prediction_row"})
            continue
        s = spec_by_signal[signal]
        p0 = map_prediction(r0, s)
        p1 = map_prediction(r1, s)
        state0 = validate_record_semantics(r0, s, f"{sid}/{signal}/primary")
        state1 = validate_record_semantics(r1, s, f"{sid}/{signal}/condition")
        if state0 == "illegal" or state1 == "illegal":
            illegal_side += int(state0 == "illegal") + int(state1 == "illegal")
            flips.append({"sid": sid, "signal": signal, "kind": "illegal_answer",
                          "primary": r0.get("predicted"), "condition": r1.get("predicted")})
            continue
        if state0 == "failed" or state1 == "failed":
            failed_side += int(state0 == "failed") + int(state1 == "failed")
            both_failed += int(state0 == "failed" and state1 == "failed")
            flips.append({"sid": sid, "signal": signal,
                          "kind": "both_failed" if state0 == state1 == "failed" else "failed_answer",
                          "primary_error": r0.get("predict_error"),
                          "condition_error": r1.get("predict_error")})
            continue
        if p0 == p1:
            same += 1
        else:
            flips.append({"sid": sid, "signal": signal, "kind": "answer_changed",
                          "primary": r0.get("predicted"), "condition": r1.get("predicted"),
                          "primary_conf": r0.get("answer_confidence"),
                          "condition_conf": r1.get("answer_confidence")})
    n = len(planned_keys)
    unstable = n - same
    return {"planned_items": n, "stable_items": same, "unstable_items": unstable,
            "answer_same_rate": round(same / n, 4) if n else None,
            "both_failed_items": both_failed, "failed_sides": failed_side,
            "missing_sides": missing_side, "illegal_sides": illegal_side,
            "flips": unstable, "flip_examples": flips[:10]}


def long_summary(run, planned_keys):
    """Aggregate v3 input reports while preserving the full planned denominator."""
    counts = run_coverage(run, planned_keys)
    reps = []
    if run:
        for sid, signal in planned_keys:
            rec = run["predictions"].get(sid, {}).get(signal)
            if rec is not None and isinstance(rec.get("input_report"), dict):
                reps.append(rec["input_report"])
    tokens = [r.get("state_tokens", r.get("tokens_after")) for r in reps
              if isinstance(r.get("state_tokens", r.get("tokens_after")), (int, float))]
    heads = [r.get("head_tokens_measured") for r in reps
             if isinstance(r.get("head_tokens_measured"), (int, float))]
    budgets = [r.get("state_budget") for r in reps if isinstance(r.get("state_budget"), (int, float))]
    removed = [line for r in reps for line in (r.get("removed_lines") or [])]
    return {"planned_items": counts["planned_items"], "coverage": counts["coverage"],
            "missing_items": counts["missing_items"], "illegal_items": counts["illegal_items"],
            "failed_items": counts["failed_items"], "refused_items": counts["refused_items"],
            "excluded_from_formal_scoring": counts["excluded_from_formal_scoring"],
            "items_with_removed_lines": sum(bool(r.get("removed_lines")) for r in reps),
            "removed_line_count": len(removed),
            "items_losing_decisive_evidence": counts["lost_decisive_evidence"],
            "items_losing_boundary": counts["lost_boundary"],
            "items_requiring_relabel": sum(bool(r.get("requires_relabel")) for r in reps),
            "token_median": round(statistics.median(tokens), 1) if tokens else None,
            "head_tokens_measured_median": round(statistics.median(heads), 1) if heads else None,
            "state_budget": min(budgets) if budgets else None,
            "example_removed": next((r.get("removed_lines") for r in reps if r.get("removed_lines")), [])}


def _keys(ids, signals):
    return [(sid, signal) for sid in ids for signal in signals]


def build_report(models, split, index_path, rows, qt, para_entries, para_ids, para_sha):
    ids = [r["sid"] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("planned scenarios contain duplicate ids")
    planned_ids = set(ids)
    unknown_para = sorted(set(para_ids) - planned_ids) if split == PARAPHRASE_SPLIT else []
    if unknown_para:
        raise ValueError(f"paraphrase preregistration contains ids outside {split}: {unknown_para[:5]}")
    signals = list(score.SIGNALS)
    specs = {name: qt["signals"][name] for name in signals}
    full_keys = _keys(ids, signals)
    para_keys = _keys(para_ids if split == PARAPHRASE_SPLIT else [], signals)
    report = {"schema": "e1r2-stability-v3", "written_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
              "split": split, "models": {}, "integrity_problems": [],
              "preregistered_paraphrase": {"status": "registered" if split == PARAPHRASE_SPLIT else "not_applicable",
                                            "path": "samples/paraphrase-dev.jsonl" if split == PARAPHRASE_SPLIT else None,
                                            "sha256": para_sha if split == PARAPHRASE_SPLIT else None,
                                            "planned_scenarios": len(para_ids) if split == PARAPHRASE_SPLIT else 0,
                                            "planned_items": len(para_keys),
                                            "scenario_ids": para_ids if split == PARAPHRASE_SPLIT else []},
              "conditions": {}}
    for model in models:
        primary, problem = load_run(model, split, "primary", index_path, planned_ids, qt)
        if problem:
            report["integrity_problems"].extend(f"{model}/primary: {p}" for p in problem)
        model_out = {"primary": {"status": "ran" if primary else "refused" if problem else "not_run",
                                  "source": ({"path": primary["path"], "sha256": primary["sha256"]} if primary else None),
                                  **run_coverage(primary, full_keys)}}
        model_conditions = {}
        for condition in CONDITIONS:
            cids = para_ids if condition == "paraphrase" and split == PARAPHRASE_SPLIT else (
                [] if condition == "paraphrase" else ids)
            keys = para_keys if condition == "paraphrase" else full_keys
            if condition == "paraphrase" and split != PARAPHRASE_SPLIT:
                model_conditions[condition] = {"status": "not_run", "reason": "authored paraphrase subset is preregistered for dev only",
                                               **run_coverage(None, keys)}
                continue
            run, problem = load_run(model, split, condition, index_path, set(cids), qt) if cids else (None, None)
            if problem:
                report["integrity_problems"].extend(f"{model}/{condition}: {p}" for p in problem)
                model_conditions[condition] = {"status": "refused", "integrity_problems": problem,
                                               **run_coverage(None, keys)}
                continue
            if run is None:
                model_conditions[condition] = {"status": "not_run", **run_coverage(None, keys)}
                continue
            coverage = run_coverage(run, keys)
            compared = compare(primary, run, keys, specs) if primary else {
                "planned_items": len(keys), "stable_items": 0, "unstable_items": len(keys),
                "answer_same_rate": None, "both_failed_items": 0, "failed_sides": 0,
                "missing_sides": len(keys), "illegal_sides": 0, "flips": len(keys), "flip_examples": []}
            model_conditions[condition] = {"status": "ran", "source": {"path": run["path"], "sha256": run["sha256"]},
                                           **coverage, **compared}
            if condition == "long":
                model_conditions[condition]["input_report_v3"] = long_summary(run, keys)
        model_out["conditions"] = model_conditions

        probe, problem = load_run(model, split, "probe_malformed", index_path, {f"PROBE-{n}" for n in PROBE_NAMES}, qt)
        if problem:
            report["integrity_problems"].extend(f"{model}/probe_malformed: {p}" for p in problem)
        if probe:
            outcomes = Counter()
            for signals_by_id in probe["predictions"].values():
                for signal, rec in signals_by_id.items():
                    if rec.get("predict_error"):
                        outcome = "error"
                    elif validate_record_semantics(rec, specs[signal], f"probe/{signal}") == "illegal":
                        outcome = "illegal_or_none"
                    elif rec.get("predicted") == specs[signal].get("abstain_keys", [None])[0]:
                        outcome = "abstained"
                    else:
                        outcome = "answered_definitely"
                    outcomes[outcome] += 1
            model_out["probe_malformed"] = {"status": "ran", "planned_items": len(PROBE_NAMES) * len(signals),
                                             "returned_items": sum(outcomes.values()),
                                             "coverage": round(sum(outcomes.values()) / (len(PROBE_NAMES) * len(signals)), 4),
                                             "outcomes": dict(outcomes), "source": {"path": probe["path"], "sha256": probe["sha256"]}}
        elif problem:
            model_out["probe_malformed"] = {"status": "refused", "integrity_problems": problem}
        else:
            model_out["probe_malformed"] = {"status": "not_run", "planned_items": len(PROBE_NAMES) * len(signals),
                                             "returned_items": 0, "coverage": 0.0}
        report["models"][model] = model_out
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="A,B")
    ap.add_argument("--split", default="dev")
    ap.add_argument("--index", default=None, help="run index path (default results/raw/run-index.json)")
    ap.add_argument("--out", default=None, help="write a new report here (never writes a final-split report)")
    args = ap.parse_args()
    if args.split == "final":
        print("REFUSED: stability reports are not written for the final split")
        return 5
    qt = load_questions(os.path.join(HERE, "question-templates.json"))
    try:
        rows = rows_for(HERE, args.split)
        entries, para_ids = authored_paraphrases()
        para_sha = score.sha256_file(PARAPHRASE_PATH)
        report = build_report(args.models.split(","), args.split, args.index, rows, qt,
                              entries, para_ids, para_sha)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, json.JSONDecodeError) as exc:
        print(f"REFUSED: {exc}")
        return 4
    if report["integrity_problems"]:
        print(f"REFUSED: {len(report['integrity_problems'])} integrity problem(s); no report written")
        for problem in report["integrity_problems"][:12]:
            print("  -", problem)
        return 4
    dest = args.out or os.path.join(HERE, "results", f"stability-{args.split}-v3.json")
    if os.path.exists(dest):
        print(f"REFUSED: report already exists; choose an explicit --out path: {score.display_path(dest)}")
        return 4
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    with open(dest, "x", encoding="utf-8", newline="\n") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(json.dumps(report, ensure_ascii=False, indent=1)[:3000])
    print("wrote", score.display_path(dest))
    return 0


if __name__ == "__main__":
    sys.exit(main())
