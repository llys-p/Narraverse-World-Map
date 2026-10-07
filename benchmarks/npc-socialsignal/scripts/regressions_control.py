"""Controller counterexamples. Synthetic only; all outputs stay in temporary copies."""
import json
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

import score
import run_bench_v3 as runner
import stability

ROOT = pathlib.Path(__file__).resolve().parent.parent


class ControllerChecks(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="e1-control-")
        self.root = pathlib.Path(self.tmp.name) / "benchmark"
        shutil.copytree(ROOT, self.root, ignore=shutil.ignore_patterns("__pycache__"))
        self.original = score.HERE, runner.HERE
        score.HERE = runner.HERE = str(self.root)
        self.rows = score.rows_for(str(self.root), "final")
        self.plan = {"max_len": 1024, "head_max_len": 256, "device": "cpu", "limit": 0}

    def tearDown(self):
        score.HERE, runner.HERE = self.original
        self.tmp.cleanup()

    def gate(self):
        refs = []
        for name in ("r1", "r2"):
            record = {"id": name, "independent": True, "no_gold_exposure_attested": True,
                      "no_cross_reviewer_communication_attested": True,
                      "covered_tokens": len(self.rows), "planned_tokens": len(self.rows)}
            for field, data in (("answers", "".join(json.dumps({"token": r["sid"]}) + "\n" for r in self.rows)),
                                ("disclosure", "synthetic disclosure")):
                p = self.root / (name + field)
                p.write_text(data, encoding="utf-8")
                record[field + "_path"] = str(p)
                record[field + "_sha256"] = score.sha256_file(p)
            refs.append(record)
        receipt = self.root / "adjudication"
        receipt.write_text("synthetic adjudication", encoding="utf-8")
        paths = {"samples_blind": "samples/scenarios-final-blind.jsonl",
                 "question_templates": "question-templates.json", "label_spec": "LABEL_SPEC.md",
                 "config_lock": "config.lock.json", "calibration_lock": "calibration/temperature-lock.json"}
        frozen = {k: score.sha256_file(self.root / v) for k, v in paths.items()}
        frozen["external_gold"] = score.load_json(self.root / "seal-record-v2.json")["gold_final_sha256"]
        return {"schema": "e1r2-freeze-gate-v1", "status": "frozen", "split": "final",
                "blind_review": {"reviewers": refs},
                "adjudication": {"adjudicator": "other", "non_original_annotator": True,
                                 "completed": True, "receipt_path": str(receipt),
                                 "receipt_sha256": score.sha256_file(receipt)},
                "frozen_artifacts": frozen,
                "frozen_plan": dict(self.plan, models=["A", "B"], conditions=["primary", "long"],
                                    scenario_count=len(self.rows),
                                    truncation_policy="oldest_history_then_boundary_outside_window")}

    def errors(self, gate, model="A", plan=None):
        path = self.root / "fixture-gate.json"
        path.write_text(json.dumps(gate), encoding="utf-8")
        return score.verify_freeze_gate(str(self.root), self.rows, model, "primary", "final", plan or self.plan, str(path))

    def test_duplicate_alone(self):
        rec = {"sid": "x", "model": "A", "split": "dev", "condition": "primary", "signal": "social_act"}
        path = self.root / "duplicate.jsonl"
        path.write_text((json.dumps(rec) + "\n") * 2, encoding="utf-8")
        _, errors = score.load_preds(str(path), "A", "dev", "primary", {"x"})
        self.assertTrue(any("DUPLICATE" in x for x in errors))

    def test_probability_keys_types_and_both_confidences(self):
        for probs in ({"invented": 1.0}, {"威胁": "bad"}, {"威胁": True}):
            self.assertTrue(score.check_probs({"x": {"social_act": {"predicted": "合作", "probs": probs}}}))
        for field in ("confidence", "answer_confidence"):
            self.assertTrue(score.check_probs({"x": {"social_act": {"predicted": "合作", field: float("nan")}}}))

    def test_receipts_and_coverage_are_actual(self):
        gate = self.gate()
        self.assertEqual(self.errors(gate), [])
        gate["blind_review"]["reviewers"][0]["covered_tokens"] = "62"
        self.assertTrue(self.errors(gate))
        gate = self.gate()
        pathlib.Path(gate["blind_review"]["reviewers"][0]["disclosure_path"]).write_text("changed")
        self.assertTrue(self.errors(gate))

    def test_final_pairs_and_artifact_identity(self):
        gate = self.gate()
        score.journal_final_run(str(self.root), "A", "primary", None)
        self.assertTrue(self.errors(gate))
        self.assertEqual(self.errors(gate, model="B"), [])  # same pre-registered experiment
        score.journal_final_run(str(self.root), "A", "primary", "a" * 64)
        self.assertEqual(self.errors(gate, plan=dict(self.plan, predictions_sha256="a" * 64)), [])
        self.assertTrue(self.errors(gate, plan=dict(self.plan, predictions_sha256="b" * 64)))
        with self.assertRaises(ValueError):
            score.journal_final_run(str(self.root), "A", "primary", "b" * 64)

    def test_token_failure_does_not_estimate(self):
        class Broken:
            def call(self, *args):
                return None, "TIMEOUT", 0, "timeout"
        with self.assertRaisesRegex(RuntimeError, "TOKEN_COUNT_FAILED"):
            runner._count(Broken(), ["hello"], .01)

    def test_paraphrase_plan_appears_in_actual_report(self):
        path = self.root / "empty-index.json"
        path.write_text(json.dumps({"runs": {}}), encoding="utf-8")
        entries, ids = stability.authored_paraphrases()
        report = stability.build_report(["A"], "dev", str(path), score.rows_for(str(self.root), "dev"),
                                        score.load_json(self.root / "question-templates.json"), entries, ids, "fixture")
        self.assertEqual(report["models"]["A"]["conditions"]["paraphrase"]["planned_items"], len(ids) * 5)

    def test_failed_prediction_with_stale_label_is_not_stable(self):
        spec = {"canonical_order": ["合作", "威胁"]}
        self.assertEqual(stability.validate_record_semantics({"predicted": "合作", "predict_error": "TIMEOUT"}, spec, "x"), "failed")

    def test_token_failure_persists_and_shuts_down(self):
        class Broken:
            restarts = killed_for_timeouts = 0
            info = {}
            stopped = False
            def call(self, *args):
                return None, "TIMEOUT", 0, "timeout"
            def shutdown(self):
                self.stopped = True
        base = self.root / "models"
        (base / "runtime" / "A").mkdir(parents=True)
        worker = Broken()
        args = ["run_bench_v3.py", "--model", "A", "--split", "dev", "--condition", "primary",
                "--base", str(base), "--limit", "1"]
        with patch.object(runner, "Worker", return_value=worker), patch.object(sys, "argv", args):
            self.assertEqual(runner.main(), 4)
        self.assertTrue(worker.stopped)
        index = score.load_json(self.root / "results/raw/run-index.json")
        entry = list(index["runs"].values())[-1]
        records = [json.loads(l) for l in (self.root / entry["path"]).read_text(encoding="utf-8").splitlines()]
        self.assertEqual(len(records), 5)
        self.assertTrue(all(r.get("predict_error") for r in records))


if __name__ == "__main__":
    unittest.main()
