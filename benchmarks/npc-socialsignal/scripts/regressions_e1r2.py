#!/usr/bin/env python3
"""E1R2 synthetic regressions (F1-F4). No weights are loaded, no model runs.

Each check reproduces the counterexample the controller recorded in
review-return/control-audit-b2df7a9/counterexamples.json and asserts the fixed
behaviour. Fixtures live OUTSIDE the repository; the real freeze gate is never
created here.

  python scripts/regressions_e1r2.py            # also: score.py --regressions
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "scripts"))

import score as SCORE  # noqa: E402
from inputs import (BOUNDARY_NEVER, BOUNDARY_OUTSIDE, assemble_with_budget,  # noqa: E402
                    render_body)

FIX = os.path.join(tempfile.gettempdir(), "e1r2-fixtures")
FAILS = []


def chk(name, cond, detail=""):
    print(f"  {'ok ' if cond else 'FAIL'} {name}" + (f" :: {detail}" if detail and not cond else ""))
    if not cond:
        FAILS.append(name)


def char_token_counter(text):
    return max(1, len(text) // 2)


# ------------------------------------------------------------------ F4
def test_truncation():
    print("F4 truncation")
    row = {"sid": "T-TRUNC-1", "persona": "庙祝恒安，守庙四十年", "boundary": "后殿不给人进，说了二十年",
           "history": [f"{'第' + str(i) + '件旧事'}" + "x" * 80 for i in range(8)],
           "turn": "米我搁前堂门槛，你自己点数。",
           "decisive_evidence": {"boundary_violation": ["后殿不给人进"]}}
    body, rep = assemble_with_budget(char_token_counter, row, 100, "boundary_violation")
    chk("budget_respected_or_refused", rep.get("refused") or rep["tokens_after"] <= 100,
        f"tokens={rep.get('tokens_after')} budget=100")
    # the counterexample kept 4 history lines yet dropped the boundary first
    chk("boundary_only_dropped_after_history_exhausted",
        rep["boundary_kept"] or rep["history_remaining"] == 0,
        f"boundary_kept={rep['boundary_kept']} remaining={rep['history_remaining']} removed={len(rep['removed_lines'])}")
    chk("history_trimmed_before_boundary", rep["boundary_kept"] and rep["removed_lines"],
        f"removed={len(rep['removed_lines'])} remaining={rep['history_remaining']}")
    chk("truncated_boundary_is_not_never_informed",
        (BOUNDARY_NEVER not in (body or "")) and ("从未被告知" not in (body or "")),
        (body or "")[:120])
    chk("boundary_outside_window_marked", rep["boundary_state"] in (BOUNDARY_OUTSIDE, "stated"),
        rep["boundary_state"])
    chk("requires_relabel_on_decisive_loss",
        bool(rep["lost_decisive_evidence"]) == bool(rep["requires_relabel"]), rep)
    # undeletable core over budget must refuse, not silently overrun
    core = {"sid": "T-TRUNC-2", "persona": "P" * 4000, "boundary": "B" * 200, "history": [],
            "turn": "U" * 2000, "decisive_evidence": {}}
    body2, rep2 = assemble_with_budget(char_token_counter, core, 100, "social_act")
    chk("core_over_budget_refused", rep2.get("refused") == "core_over_budget" and body2 is None, rep2)
    # authored "never declared" still renders the honest phrase
    b3 = render_body("p", None, [], "t", BOUNDARY_NEVER)
    chk("authored_absence_still_marked", "从未被告知" in b3, b3)


# ------------------------------------------------------------------ F3
def test_timeout_kills_worker():
    print("F3 timeout")
    import run_bench_v3 as RB
    os.makedirs(FIX, exist_ok=True)
    stub = os.path.join(FIX, "hang_worker.py")
    with open(stub, "w", encoding="utf-8") as fh:
        fh.write(
            "import sys, json, time\n"
            "sys.stdout.write(json.dumps({'id': None, 'ready': True}) + '\\n'); sys.stdout.flush()\n"
            "for line in sys.stdin:\n"
            "    j = json.loads(line)\n"
            "    if j.get('count'):\n"
            "        sys.stdout.write(json.dumps({'id': j['id'], 'counts': [len(t) for t in j['count']]}) + '\\n'); sys.stdout.flush(); continue\n"
            "    time.sleep(30)\n"
            "    sys.stdout.write(json.dumps({'id': j['id'], 'results': []}) + '\\n'); sys.stdout.flush()\n")
    w = RB.Worker(sys.executable, stub, "unused", "unused", "cpu")
    old_proc = w.proc
    res, err, wall, kind = w.call({"states": [{"body": "x"}], "questions": {}, "max_len": 1024,
                                   "head_max_len": 256}, 0.5)
    chk("timeout_reported", err and err.startswith("TIMEOUT"), err)
    chk("kind_is_timeout", kind == "timeout", kind)
    chk("old_worker_reaped", old_proc.poll() is not None, f"returncode={old_proc.poll()}")
    chk("killed_and_restarted", w.killed_for_timeouts == 1 and w.restarts == 1,
        f"killed={w.killed_for_timeouts} restarts={w.restarts}")
    # the replacement must be usable and there must be no second live process
    counts, err2, _, kind2 = w.call({"count": ["abc"]}, 5.0)
    chk("replacement_worker_answers", kind2 == "ok" and counts == [3], f"{counts} {err2}")
    live = [p for p in (old_proc, w.proc) if p.poll() is None]
    chk("no_overlapping_live_workers", len(live) <= 1, f"live={len(live)}")
    w.shutdown()
    chk("shutdown_leaves_no_worker", w.proc.poll() is not None, f"rc={w.proc.poll()}")


# ------------------------------------------------------------------ F1
def test_gold_planned_exactness():
    print("F1 gold/planned exactness")
    qt = SCORE.load_json(os.path.join(HERE, "question-templates.json"))
    rows = [{"sid": "a"}, {"sid": "b"}]
    bad = SCORE.integrity_problems(rows, {"a": {"social_act": "合作", "trust_shift": "不变",
                                                "fear_shift": "不变", "deception": "无线索",
                                                "boundary_violation": "未越过"}}, qt)
    chk("missing_gold_fails", any("id sets differ" in p for p in bad), bad)
    chk("missing_gold_does_not_shrink", not any("planned=1" in p for p in bad), bad)
    dup = SCORE.integrity_problems([{"sid": "a"}, {"sid": "a"}],
                                   {"a": {s: "x" for s in SCORE.SIGNALS}}, qt)
    chk("duplicate_scenario_id_fails", any("duplicate scenario ids" in p for p in dup), dup)
    illegal = SCORE.integrity_problems([{"sid": "a"}],
                                       {"a": dict.fromkeys(SCORE.SIGNALS, "不存在的标签")}, qt)
    chk("illegal_gold_fails", any("illegal gold" in p for p in illegal), illegal)
    extra = SCORE.integrity_problems([{"sid": "a"}],
                                     {"a": {s: "威胁" for s in SCORE.SIGNALS}, "ghost": {s: "威胁" for s in SCORE.SIGNALS}}, qt)
    chk("extra_gold_fails", any("id sets differ" in p for p in extra), extra)


def _fixture_rows():
    return SCORE.rows_for(HERE, "dev")


def _write_predictions(path, rows, mutate=None):
    qt = SCORE.load_json(os.path.join(HERE, "question-templates.json"))["signals"]
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        for r in rows:
            for sig in SCORE.SIGNALS:
                n = len(qt[sig]["canonical_order"])
                rec = {"sid": r["sid"], "split": "dev", "condition": "primary", "model": "A",
                       "signal": sig, "gold": r["labels"][sig], "family": r["family"], "rel": r["rel"],
                       "tags": [], "option_order": "canonical", "predicted": r["labels"][sig],
                       "probs": {k: 1.0 / n for k in qt[sig]["canonical_order"]},
                       "answer_confidence": 1.0 / n}
                if mutate:
                    mutate(rec, r, sig)
                fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")


def _write_index(index_path, pred_path):
    sha = hashlib.sha256(open(pred_path, "rb").read()).hexdigest()
    json.dump({"schema": "e1r2-run-index-v1", "runs": {
        "A|dev|primary": {"model": "A", "split": "dev", "condition": "primary",
                          "path": pred_path.replace("\\", "/"), "sha256": sha, "records": 150,
                          "config": {"max_len": 1024, "head_max_len": 256, "device": "cpu",
                                     "batch_size": 8, "timeout_s": 120.0, "limit": 0}}}},
        open(index_path, "w", encoding="utf-8"), indent=1)
    return sha


def _run_cli(args):
    p = subprocess.run([sys.executable, os.path.join(HERE, "scripts", "score.py")] + args,
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def test_cli_integrity_exit():
    print("F1 CLI integrity exit and consumer chain")
    os.makedirs(FIX, exist_ok=True)
    rows = _fixture_rows()
    qt_path = os.path.join(HERE, "question-templates.json")

    # (a) no index entry at all -> refuse, do not fall back to pilot files
    empty_index = os.path.join(FIX, "index-empty.json")
    json.dump({"schema": "e1r2-run-index-v1", "runs": {}}, open(empty_index, "w", encoding="utf-8"))
    rc, out = _run_cli(["--models", "A", "--split", "dev", "--condition", "primary",
                        "--index", empty_index])
    chk("refuses_without_registered_run", rc == 4 and "no run index entry" in out.lower().replace(
        "run index has no entry", "no run index entry"), f"rc={rc}")
    chk("does_not_consume_pilot_silently", "pilot" in out.lower(), out[:200])

    # (b) valid registered run -> publishes scores, accuracy matches gold by construction
    good = os.path.join(FIX, "pred-good.jsonl")
    _write_predictions(good, rows)
    idx = os.path.join(FIX, "index-good.json")
    sha = _write_index(idx, good)
    scores_out = os.path.join(HERE, "results", "scores-dev-primary.e1r2.json")
    if os.path.exists(scores_out):
        os.remove(scores_out)
    rc, out = _run_cli(["--models", "A", "--split", "dev", "--condition", "primary", "--index", idx])
    chk("registered_run_scores_ok", rc == 0 and os.path.exists(scores_out), f"rc={rc} out={out[:200]}")
    if os.path.exists(scores_out):
        d = SCORE.load_json(scores_out)
        chk("consumed_hash_recorded", d["consumed_predictions"]["A"]["sha256"] == sha, sha[:12])
        chk("accuracy_one_when_labels_are_copied",
            all(v["accuracy_over_planned"] == 1.0 for v in d["models"]["A"].values()),
            {k: v["accuracy_over_planned"] for k, v in d["models"]["A"].items()})

    # (c) NaN probability + duplicate row -> non-zero, no scores, lock untouched
    bad = os.path.join(FIX, "pred-bad.jsonl")
    _write_predictions(bad, rows, mutate=lambda rec, r, sig: rec.update(
        {"probs": {k: (float("nan") if i == 0 else 0.0) for i, k in enumerate(
            SCORE.load_json(qt_path)["signals"][sig]["canonical_order"])}}))
    first = open(bad, encoding="utf-8").readline()
    with open(bad, "a", encoding="utf-8", newline="\n") as fh:
        fh.write(first)  # duplicate first row
    idx_bad = os.path.join(FIX, "index-bad.json")
    _write_index(idx_bad, bad)
    lock_path = os.path.join(HERE, "calibration", "temperature-lock.json")
    lock_before = hashlib.sha256(open(lock_path, "rb").read()).hexdigest() if os.path.exists(lock_path) else None
    if os.path.exists(scores_out):
        os.remove(scores_out)
    rc, out = _run_cli(["--models", "A", "--split", "dev", "--condition", "primary", "--index", idx_bad])
    chk("integrity_errors_exit_nonzero", rc == 4, f"rc={rc} out={out[:250]}")
    chk("no_scores_published_on_integrity_error", not os.path.exists(scores_out), scores_out)
    lock_after = hashlib.sha256(open(lock_path, "rb").read()).hexdigest() if os.path.exists(lock_path) else None
    chk("calibration_lock_untouched", lock_before == lock_after, f"{lock_before} -> {lock_after}")
    diag = os.path.join(HERE, "results", "integrity-errors-dev-primary.json")
    chk("diagnostics_file_written", os.path.exists(diag) and
        SCORE.load_json(diag)["scores_published"] is False)

    # (d) empty predictions for the whole model -> explicit all-failed report
    empt = os.path.join(FIX, "pred-empty.jsonl")
    open(empt, "w", encoding="utf-8").close()
    idx_e = os.path.join(FIX, "index-empty-preds.json")
    _write_index(idx_e, empt)
    rc, out = _run_cli(["--models", "A", "--split", "dev", "--condition", "primary", "--index", idx_e])
    chk("empty_predictions_refused_not_silent", rc == 4 and "MISSING prediction row" in out, f"rc={rc}")

    # (e) all rows failed but present -> zero accuracy, full planned denominator
    allfail = os.path.join(FIX, "pred-allfail.jsonl")
    _write_predictions(allfail, rows, mutate=lambda rec, r, sig: rec.update(
        {"predicted": None, "probs": None, "answer_confidence": None,
         "predict_error": "TIMEOUT>120.0s"}))
    idx_f = os.path.join(FIX, "index-allfail.json")
    _write_index(idx_f, allfail)
    rc, out = _run_cli(["--models", "A", "--split", "dev", "--condition", "primary", "--index", idx_f])
    if rc == 0 and os.path.exists(scores_out):
        d = SCORE.load_json(scores_out)
        chk("all_failed_accuracy_zero",
            all(v["accuracy_over_planned"] == 0.0 for v in d["models"]["A"].values()),
            {k: v["accuracy_over_planned"] for k, v in d["models"]["A"].items()})
        chk("all_failed_denominator_full",
            all(v["planned_items"] == len(rows) for v in d["models"]["A"].values()))
        chk("all_failed_run_success_zero",
            all(v["run_success_rate"] == 0.0 for v in d["models"]["A"].values()))
    else:
        chk("all_failed_report_produced", False, f"rc={rc} out={out[:200]}")

    # (f) requires_relabel items cannot be scored against the old gold
    relab = os.path.join(FIX, "pred-relabel.jsonl")
    _write_predictions(relab, rows, mutate=lambda rec, r, sig: rec.update(
        {"excluded_from_formal_scoring": True}) if r["sid"] == rows[0]["sid"] else rec.update({}))
    idx_r = os.path.join(FIX, "index-relabel.json")
    _write_index(idx_r, relab)
    rc, out = _run_cli(["--models", "A", "--split", "dev", "--condition", "primary", "--index", idx_r])
    chk("relabel_blocks_formal_scoring", rc == 4 and "requires_relabel" in out, f"rc={rc} {out[:200]}")
    rc2, _ = _run_cli(["--models", "A", "--split", "dev", "--condition", "primary", "--index", idx_r,
                       "--diagnostic-only"])
    chk("diagnostic_run_allowed_explicitly", rc2 == 0, f"rc={rc2}")


# ------------------------------------------------------------------ F2
def _live_hashes():
    def sh(rel):
        p = os.path.join(HERE, rel)
        return hashlib.sha256(open(p, "rb").read()).hexdigest() if os.path.exists(p) else None
    return {"samples_blind": sh(os.path.join("samples", "scenarios-final-blind.jsonl")),
            "question_templates": sh("question-templates.json"), "label_spec": sh("LABEL_SPEC.md"),
            "config_lock": sh("config.lock.json"),
            "calibration_lock": sh(os.path.join("calibration", "temperature-lock.json")),
            "external_gold": SCORE.load_json(os.path.join(HERE, "seal-record-v2.json"))["gold_final_sha256"]}


def _reviewer(i, covered, planned):
    return {"id": i, "independent": True, "no_gold_exposure_attested": True,
            "no_cross_reviewer_communication_attested": True,
            "answers_sha256": "a" * 64, "disclosure_sha256": "b" * 64,
            "covered_tokens": covered, "planned_tokens": planned}


def test_freeze_gate():
    print("F2 freeze gate strictness")
    rows = SCORE.rows_for(HERE, "final")
    planned = len(rows)
    os.makedirs(FIX, exist_ok=True)
    plan = {"max_len": 1024, "head_max_len": 256, "device": "cpu", "limit": 0}

    def gate(**over):
        g = {"schema": "e1r2-freeze-gate-v1", "status": "frozen", "split": "final",
             "blind_review": {"reviewers": [_reviewer("rev-a", planned, planned), _reviewer("rev-b", planned, planned)]},
             "adjudication": {"adjudicator": "ctr-x", "non_original_annotator": True,
                              "completed": True, "receipt_sha256": "c" * 64},
             "frozen_artifacts": _live_hashes(),
             "frozen_plan": {"models": ["A", "B"], "conditions": ["primary", "long"],
                             "max_len": 1024, "head_max_len": 256, "device": "cpu", "limit": 0,
                             "truncation_policy": "oldest_history_then_boundary_outside_window",
                             "scenario_count": planned}}
        g.update(over)
        return g

    def expect(gate_obj, want_empty, label):
        p = os.path.join(FIX, f"gate-{label}.json")
        json.dump(gate_obj, open(p, "w", encoding="utf-8"), indent=1)
        errs = SCORE.verify_freeze_gate(HERE, rows, "A", "primary", "final", plan, gate_path=p)
        if want_empty:
            chk(label + " accepted", errs == [], errs)
        else:
            chk(label + " refused", errs != [], "gate accepted a bad receipt")
        return errs

    expect(gate(), True, "valid_fixture")
    same = gate(blind_review={"reviewers": [_reviewer("same", planned, planned), _reviewer("same", planned, planned)]})
    e = expect(same, False, "duplicate_reviewer_ids")
    chk("names_duplication_caught", any("distinct" in x for x in e), e)

    e = expect(gate(adjudication={"adjudicator": None, "non_original_annotator": None,
                                 "completed": True, "receipt_sha256": "c" * 64}), False,
               "adjudicator_unstated")
    chk("missing_adjudicator_identity_caught", any("adjudicator identity" in x for x in e), e)
    chk("missing_not_annotator_attestation_caught",
        any("not the original annotator" in x for x in e), e)
    e = expect(gate(adjudication={"adjudicator": "rev-a", "non_original_annotator": True,
                                 "completed": True, "receipt_sha256": "c" * 64}), False,
               "adjudicator_is_reviewer")
    chk("adjudicator_cannot_be_reviewer", any("may not also be a reviewer" in x for x in e), e)
    e = expect(gate(blind_review={"reviewers": [_reviewer("rev-a", planned - 1, planned), _reviewer("rev-b", planned, planned)]}),
               False, "partial_coverage")
    chk("coverage_shortfall_caught", any("covered" in x for x in e), e)
    e = expect(gate(blind_review={"reviewers": [_reviewer("rev-a", planned, planned), {
        "id": "rev-b", "independent": "yes", "no_gold_exposure_attested": True,
        "no_cross_reviewer_communication_attested": True, "answers_sha256": "a" * 64,
        "disclosure_sha256": "b" * 64, "covered_tokens": planned, "planned_tokens": planned}]}),
        False, "truthy_string_instead_of_bool")
    chk("type_strictness_on_independence", any("exactly true" in x for x in e), e)
    e = expect(gate(frozen_artifacts=dict(_live_hashes(), question_templates="0" * 64)), False,
               "tampered_template_hash")
    chk("tampered_artifact_caught", any("no longer matches" in x for x in e), e)
    errs = SCORE.verify_freeze_gate(HERE, rows, "Z", "invented-pressure", "final", plan,
                                    gate_path=os.path.join(FIX, "gate-valid_fixture.json"))
    chk("unregistered_model_caught", any("not in the pre-registered model set" in x for x in errs), errs)
    chk("unregistered_condition_caught", any("not in the pre-registered condition set" in x for x in errs), errs)
    plan2 = dict(plan, limit=10)
    errs = SCORE.verify_freeze_gate(HERE, rows, "A", "primary", "final", plan2,
                                    gate_path=os.path.join(FIX, "gate-valid_fixture.json"))
    chk("limit_flag_cannot_bypass", any("limit" in x for x in errs), errs)
    p_missing = os.path.join(FIX, "gate-nope.json")
    if os.path.exists(p_missing):
        os.remove(p_missing)
    chk("absent_gate_refused", SCORE.verify_freeze_gate(HERE, rows, "A", "primary", "final", plan,
                                                        gate_path=p_missing) != [], "no gate -> must refuse")


def run_all():
    global FAILS
    FAILS = []
    test_truncation()
    test_timeout_kills_worker()
    test_gold_planned_exactness()
    test_cli_integrity_exit()
    test_freeze_gate()
    print(f"\nregressions: {len(FAILS)} failure(s)" + (f" -> {FAILS}" if FAILS else ""))
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(run_all())
