#!/usr/bin/env python3
"""Focused, no-weight regressions for the E1R2 stability report."""
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import score
import stability
from body import load_questions


def check(name, got, want, failures):
    ok = got == want
    print(f"{'ok' if ok else 'FAIL'} {name}: got={got!r} want={want!r}")
    if not ok:
        failures.append(name)


def rec(predicted=None, error=None, order=None):
    labels = ["威胁", "示好", "求助", "合作", "中性", "不确定"]
    value = {"predicted": predicted, "semantic_labels": labels,
             "requested_criteria_order": order or labels}
    if error:
        value["predict_error"] = error
    return value


def run_all():
    failures = []
    qt = load_questions(os.path.join(HERE, "question-templates.json"))
    social = qt["signals"]["social_act"]

    # The registered path and its hash must be the E1R3 artifact from run-index,
    # never the legacy filename guessed by the old implementation.
    path, entry, problems = score.resolve_prediction_file("A", "dev", "long")
    check("indexed path resolves", bool(path and path.endswith("A-dev-long.e1r3.jsonl")), True, failures)
    check("indexed hash matches file", score.sha256_file(path) == entry.get("sha256"), True, failures)
    check("indexed lookup clean", problems, [], failures)

    # Missing rows and two failures both stay in the exact two-item denominator.
    planned = [("s1", "social_act"), ("s2", "social_act")]
    primary = {"predictions": {"s1": {"social_act": rec(error="TIMEOUT")},
                                "s2": {"social_act": rec("合作")}}}
    condition = {"predictions": {"s1": {"social_act": rec(error="TIMEOUT")}}}
    cmp = stability.compare(primary, condition, planned, {"social_act": social})
    check("missing and both-failed denominator", cmp["planned_items"], 2, failures)
    check("both failures are unstable", cmp["both_failed_items"], 1, failures)
    check("missing item is unstable", cmp["missing_sides"], 1, failures)
    check("no false agreement from failures", cmp["answer_same_rate"], 0.0, failures)

    # Reordering keys does not alter semantic identity.
    canonical = list(social["canonical_order"])
    reversed_order = list(reversed(canonical))
    a = {"predictions": {"s1": {"social_act": rec("合作", order=canonical)}}}
    b = {"predictions": {"s1": {"social_act": rec("合作", order=reversed_order)}}}
    semantic = stability.compare(a, b, [("s1", "social_act")], {"social_act": social})
    check("permuted option semantic identity", semantic["answer_same_rate"], 1.0, failures)

    entries, para_ids = stability.authored_paraphrases()
    dev_ids = {r["sid"] for r in stability.rows_for(HERE, "dev")}
    check("paraphrase set is explicit subset", set(para_ids).issubset(dev_ids), True, failures)
    para_keys = stability._keys(para_ids, score.SIGNALS)
    coverage = stability.run_coverage(None, para_keys)
    check("partial paraphrase denominator stays preregistered", coverage["planned_items"],
          len(para_ids) * len(score.SIGNALS), failures)
    check("absent paraphrase rows remain missing", coverage["missing_items"],
          len(para_ids) * len(score.SIGNALS), failures)

    # The long v3 report keeps missing/failure/refusal and evidence-loss fields.
    long_rec = rec("合作")
    long_rec.update({"sid": "s1", "signal": "social_act", "input_report": {
        "state_tokens": 80, "head_tokens_measured": 20, "state_budget": 768,
        "removed_lines": [{"line": "旧线索", "reason": "oldest_history_over_budget"}],
        "lost_decisive_evidence": ["旧线索"], "requires_relabel": True,
        "boundary_kept": False, "refused": "core_over_budget"},
        "predict_error": "REFUSED_core_over_budget", "not_executed": True,
        "excluded_from_formal_scoring": True})
    fake = {"predictions": {"s1": {"social_act": long_rec}}}
    summary = stability.long_summary(fake, [("s1", "social_act"), ("s2", "social_act")])
    expected = {"planned_items", "coverage", "missing_items", "illegal_items", "failed_items",
                "refused_items", "excluded_from_formal_scoring", "items_with_removed_lines",
                "removed_line_count", "items_losing_decisive_evidence", "items_losing_boundary",
                "items_requiring_relabel", "token_median", "head_tokens_measured_median",
                "state_budget", "example_removed"}
    check("long report v3 fields", expected.issubset(summary), True, failures)
    check("long report planned denominator", summary["planned_items"], 2, failures)
    check("long report refusal count", summary["refused_items"], 1, failures)
    check("long report lost decisive evidence", summary["items_losing_decisive_evidence"], 1, failures)
    check("long report explicit refusal reason source", bool(long_rec["input_report"]["refused"]), True, failures)

    # Hash mismatch is refused by the same resolver that scoring uses.
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        fake_path = os.path.join(td, "predictions.jsonl")
        with open(fake_path, "w", encoding="utf-8") as fh:
            fh.write("{}\n")
        idx_path = os.path.join(td, "run-index.json")
        with open(idx_path, "w", encoding="utf-8") as fh:
            json.dump({"runs": {"A|dev|primary": {"model": "A", "split": "dev",
                      "condition": "primary", "path": fake_path,
                      "sha256": "0" * 64}}}, fh)
        _, _, bad_hash = score.resolve_prediction_file("A", "dev", "primary", idx_path)
        check("changed indexed bytes rejected", bool(bad_hash and "hash changed" in bad_hash[0]), True, failures)
        _, refused = stability.load_run("A", "dev", "primary", idx_path, {"s1"}, qt)
        check("stability refuses changed indexed bytes", bool(refused and "hash changed" in refused[0]), True, failures)

    print(f"stability regressions: {len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(run_all())
