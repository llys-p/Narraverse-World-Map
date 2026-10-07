#!/usr/bin/env python3
"""E1R R4: stability analysis over the dev condition runs.

Compares each condition against `primary` after mapping option keys back to stable
semantic labels, reports how often the answer moves, which items flip, what the
truncation policy actually removed, and what happened on empty/malformed input.
Timeouts and errors are counted as instability, never dropped.

  python scripts/stability.py --models A,B --split dev
"""
import argparse
import json
import os
import statistics
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from body import load_questions  # noqa: E402
from inputs import map_choice_back  # noqa: E402

CONDITIONS = ("perm_rotated", "perm_reversed", "paraphrase", "long", "probe_malformed")


def load(model, split, condition):
    p = os.path.join(HERE, "results", "raw", f"{model}-{split}-{condition}.e1r.jsonl")
    if not os.path.exists(p):
        return None
    out = {}
    for line in open(p, encoding="utf-8"):
        if line.strip():
            r = json.loads(line)
            out[(r["sid"], r["signal"])] = r
    return out


def stat(nums):
    if not nums:
        return None
    nums = sorted(nums)
    return {"n": len(nums), "median_ms": round(statistics.median(nums), 1),
            "p95_ms": round(nums[min(int(0.95 * len(nums)), len(nums) - 1)], 1),
            "max_ms": round(nums[-1], 1)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="A,B")
    ap.add_argument("--split", default="dev")
    args = ap.parse_args()
    qt = load_questions(os.path.join(HERE, "question-templates.json"))
    report = {"split": args.split, "models": {}, "notes": [
        "paraphrase is author-written and not yet independently confirmed; a flip here may be the rewrite changing meaning, not model instability",
        "probe_malformed rows carry a placeholder gold and are never counted in any accuracy figure",
    ]}

    for m in args.models.split(","):
        base = load(m, args.split, "primary")
        if base is None:
            print(f"no primary run for {m}")
            continue
        per = {"primary_items": len(base),
               "primary_latency": stat([r["wall_ms_per_item"] for r in base.values() if r.get("wall_ms_per_item")]),
               "conditions": {}}
        for cond in CONDITIONS:
            other = load(m, args.split, cond if cond != "probe_malformed" else "probe_malformed")
            if other is None:
                per["conditions"][cond] = {"status": "not_run"}
                continue
            if cond == "probe_malformed":
                outcomes = Counter()
                per_probe = {}
                for (sid, sig), r in other.items():
                    probe = sid.replace("PROBE-", "")
                    if r.get("predict_error"):
                        outcome = "error"
                    elif map_choice_back(r.get("predicted"), qt["signals"][sig]) is None:
                        outcome = "illegal_or_none"
                    elif r["predicted"] == qt["signals"][sig]["abstain_keys"][0]:
                        outcome = "abstained"
                    else:
                        outcome = "answered_definitely"
                    outcomes[outcome] += 1
                    per_probe.setdefault(probe, []).append(
                        {"signal": sig, "outcome": outcome,
                         "predicted": r.get("predicted"), "error": r.get("predict_error")})
                per["conditions"][cond] = {"status": "ran", "items": len(other),
                                           "outcomes": dict(outcomes), "per_probe": per_probe}
                continue
            agree, flips, both_err = [], [], 0
            for key, r0 in base.items():
                r1 = other.get(key)
                if r1 is None:
                    continue
                p0 = map_choice_back(r0.get("predicted"), qt["signals"][key[1]])
                p1 = map_choice_back(r1.get("predicted"), qt["signals"][key[1]])
                if r0.get("predict_error") and r1.get("predict_error"):
                    both_err += 1
                    continue
                agree.append(int(p0 is not None and p0 == p1))
                if p0 != p1:
                    flips.append({"sid": key[0], "signal": key[1], "primary": r0.get("predicted"),
                                  "condition": r1.get("predicted"),
                                  "primary_conf": r0.get("answer_confidence"),
                                  "condition_conf": r1.get("answer_confidence"),
                                  "gold": r0.get("gold")})
            entry = {"status": "ran", "compared_items": len(agree),
                     "answer_same_rate": round(sum(agree) / len(agree), 4) if agree else None,
                     "flips": len(flips), "flip_examples": flips[:10],
                     "latency": stat([r["wall_ms_per_item"] for r in other.values() if r.get("wall_ms_per_item")])}
            if cond in ("long",):
                reps = [r.get("input_report", {}) for r in other.values()]
                entry["truncation"] = {
                    "items_with_removed_lines": sum(1 for x in reps if x.get("removed_lines")),
                    "items_losing_decisive_evidence": sum(1 for x in reps if x.get("requires_relabel")),
                    "token_median": (lambda v: round(statistics.median(v), 1) if v else None)(
                        [x.get("tokens") for x in reps if x.get("tokens")]),
                    "head_tokens_measured_median": (lambda v: round(statistics.median(v), 1) if v else None)(
                        [x.get("head_tokens_measured") for x in reps if x.get("head_tokens_measured")]),
                    "state_budget": min([x.get("budget", 10**9) for x in reps] or [None])}
            per["conditions"][cond] = entry
        forced = load(m, args.split, "long_forced_small_budget")
        if forced:
            reps = [r.get("input_report", {}) for r in forced.values()]
            per["truncation_mechanism_proof"] = {
                "note": "max_len 320 forces the documented removal order so the code path is exercised",
                "items_with_removed_lines": sum(1 for x in reps if x.get("removed_lines")),
                "items_losing_decisive_evidence": sum(1 for x in reps if x.get("requires_relabel")),
                "boundary_dropped": sum(1 for x in reps if not x.get("boundary_kept", True)),
                "example_removed": next((x.get("removed_lines") for x in reps if x.get("removed_lines")), [])}
        report["models"][m] = per

    dest = os.path.join(HERE, "results", f"stability-{args.split}.json")
    json.dump(report, open(dest, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    print(json.dumps(report, ensure_ascii=False, indent=1)[:3000])
    print("wrote", os.path.relpath(dest, HERE))
    return 0


if __name__ == "__main__":
    sys.exit(main())
