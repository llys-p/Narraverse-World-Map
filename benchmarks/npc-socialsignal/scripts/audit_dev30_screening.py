"""Read-only independent audit of the archived screening run. No inference.

Recomputes from indexed raw records and the external adjudication sidecar,
without using dev30_screening.evaluate_signal or its published conclusions.
"""
import argparse
from collections import Counter
import hashlib
import json
import math
import os
from pathlib import Path

from inputs import render_body, authored_boundary_state

ROOT = Path(__file__).resolve().parent.parent
SIGNALS = {
    "social_act": ["威胁", "示好", "求助", "合作", "中性", "不确定"],
    "trust_shift": ["上升", "不变", "下降", "不确定"],
    "fear_shift": ["上升", "不变", "下降", "不确定"],
    "deception": ["有线索", "无线索", "信息不足"],
    "boundary_violation": ["已越过", "未越过", "信息不足"],
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def strict_json(text):
    def pairs(items):
        out = {}
        for k, v in items:
            if k in out:
                raise ValueError(f"duplicate JSON key: {k}")
            out[k] = v
        return out
    def invalid(value):
        raise ValueError(f"non-finite JSON number: {value}")
    return json.loads(text, object_pairs_hook=pairs, parse_constant=invalid)


def read(path):
    return strict_json(Path(path).read_text(encoding="utf-8"))


def lines(path):
    return [strict_json(s) for s in Path(path).read_text(encoding="utf-8").splitlines() if s.strip()]


def audit(base, sidecar):
    lock_path = ROOT / "results/dev30-screening-lock.json"
    lock = read(lock_path)
    index = read(ROOT / "results/raw/dev30-screening-index.json")
    published = read(ROOT / "results/dev30-screening-decision.json")
    batch_path = ROOT / lock["batch_file"]["path"]
    assert sha(batch_path) == lock["batch_file"]["sha256"]
    assert sha(ROOT / "LABEL_SPEC.md") == lock["spec_sha256"]
    assert sha(sidecar) == lock["sidecar"]["sha256"]
    assert sha(lock_path) == index["lock_sha256"] == published["lock_sha256"]
    rows = lines(batch_path)
    ids = set(lock["planned_ids"])
    assert len(rows) == len(ids) == 30 and {r["sid"] for r in rows} == ids
    refs = lines(sidecar)
    assert len(refs) == 150 and len({(r["sid"], r["signal"]) for r in refs}) == 150
    assert {(r["sid"], r["signal"]) for r in refs} == {(i, s) for i in ids for s in SIGNALS}
    gold = {}
    for r in refs:
        assert (r["status"] == "reference_unresolved") == (r["reference_label"] is None)
        if r["reference_label"] is not None:
            assert r["reference_label"] in SIGNALS[r["signal"]]
            gold[r["sid"], r["signal"]] = r["reference_label"]
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    from transformers import AutoTokenizer
    tok_path = Path(base) / "runtime/A/tokenizer"
    tok = AutoTokenizer.from_pretrained(tok_path, local_files_only=True)
    bodies = {r["sid"]: render_body(r["persona"], r["boundary"], r["history"] + r.get("extra_history", []),
                                   r["turn"], authored_boundary_state(r)) for r in rows}
    tokens = {i: len(tok(b, add_special_tokens=False)["input_ids"]) for i, b in bodies.items()}
    qt = read(ROOT / "question-templates.json")
    head = {s: len(tok(qt["signals"][s]["instructions"] + "".join(k + v for k, v in qt["signals"][s]["options"].items()),
                      add_special_tokens=False)["input_ids"]) for s in SIGNALS}
    expected = {(i, s) for i in ids for s in SIGNALS}
    assert set(index["runs"]) == {"A|canonical", "B|canonical"}
    assert lock["gates"]["beat_constant_baseline_by"] == 3
    assert lock["gates"]["unknown_class"] == {"min_accuracy": 0.8, "support_threshold": 5}
    out = {"schema": "dev30-screening-control-audit-v1", "inference_rerun": False,
           "lock_sha256": sha(lock_path), "models": {}, "models_with_any_positive_subset_delta": []}
    for model in ("A", "B"):
        model_lock = lock["models"][model]
        assert sha(Path(base) / f"runtime/{model}/tokenizer/tokenizer.json") == model_lock["tokenizer_json_sha256"] == sha(tok_path / "tokenizer.json")
        assert sha(Path(base) / f"runtime/{model}/model.safetensors") == model_lock["revision_sha256"]
        entry = index["runs"][model + "|canonical"]
        path = (ROOT / entry["path"]).resolve()
        assert path.is_relative_to(ROOT.resolve()) and sha(path) == entry["sha256"]
        assert entry["binds"] == {
            "batch_sha256": sha(batch_path), "spec_sha256": lock["spec_sha256"],
            "sidecar_sha256": sha(sidecar), "lock_sha256": sha(lock_path),
            "model_revision_sha256": model_lock["revision_sha256"],
        }
        records = lines(path)
        assert len(records) == entry["records"] == 150
        assert len({(r["sid"], r["signal"]) for r in records}) == 150
        assert {(r["sid"], r["signal"]) for r in records} == expected
        by_key = {(r["sid"], r["signal"]): r for r in records}
        for r in records:
            assert r["model"] == model and r["condition"] == "canonical"
            assert r["state_tokens"] == tokens[r["sid"]] and r["head_tokens"] == head[r["signal"]]
            if r.get("predict_error"):
                assert r["predict_error"] == "REFUSED_INPUT_OVER_BUDGET" and tokens[r["sid"]] > 768
                assert r["predicted"] is None
            else:
                assert tokens[r["sid"]] <= 768 and r["predicted"] in SIGNALS[r["signal"]]
                assert set(r["probs"]) == set(SIGNALS[r["signal"]])
                assert all(math.isfinite(v) and 0 <= v <= 1 for v in r["probs"].values())
                assert abs(sum(r["probs"].values()) - 1) < 0.002
                assert math.isfinite(r["confidence"]) and 0 <= r["confidence"] <= 1
                assert r["usage"]["truncated"] is False and not r["usage"]["truncated_questions"]
        metrics = {}
        for signal in SIGNALS:
            valid = {i: label for (i, s), label in gold.items() if s == signal}
            assert sorted(valid) == lock["valid_reference_sets"][signal]
            assert sorted(ids - set(valid)) == sorted(lock["unresolved"][signal])
            assert lock["denominators"][signal] == {"planned": 30, "valid_reference": len(valid), "unresolved": 30 - len(valid)}
            counts = Counter(valid.values())
            baseline = lock["constant_baselines"][signal]
            assert dict(counts) == baseline["counts"] and counts[baseline["constant_class"]] == baseline["support"]
            returned = {i for i in ids if not by_key[i, signal].get("predict_error")}
            correct = {i for i, label in valid.items() if i in returned and by_key[i, signal]["predicted"] == label}
            executable_valid = set(valid) & returned
            subset_baseline = sum(valid[i] == baseline["constant_class"] for i in executable_valid)
            unknown = "信息不足" if signal in ("deception", "boundary_violation") else "不确定"
            unknown_ids = {i for i in valid if valid[i] == unknown}
            unknown_correct = correct & unknown_ids
            definite = {i for i in unknown_ids & returned if by_key[i, signal]["predicted"] != unknown}
            metric = {"planned": 30, "valid_reference": len(valid), "unresolved": 30 - len(valid),
                      "returned": len(returned), "refused": len(ids - returned),
                      "correct": len(correct), "accuracy_over_valid_planned": round(len(correct) / len(valid), 4),
                      "locked_constant_correct": baseline["support"], "delta": len(correct) - baseline["support"],
                      "executable_valid": len(executable_valid), "executable_accuracy": round(len(correct) / len(executable_valid), 4),
                      "constant_correct_on_executable_same_refs": subset_baseline,
                      "delta_on_executable_same_refs": len(correct) - subset_baseline,
                      "unknown_support": len(unknown_ids), "unknown_correct": len(unknown_correct),
                      "unknown_as_definite": len(definite), "unknown_refused": len(unknown_ids - returned),
                      "unknown_support_sufficient": len(unknown_ids) >= 5}
            if signal in ("deception", "boundary_violation"):
                pos = "有线索" if signal == "deception" else "已越过"
                metric["false_positive"] = sorted(i for i in executable_valid if valid[i] != pos and by_key[i, signal]["predicted"] == pos)
                metric["false_negative"] = sorted(i for i in executable_valid if valid[i] == pos and by_key[i, signal]["predicted"] != pos)
            report = published["models"][model]["signals"][signal]
            assert metric["correct"] == report["correct_on_valid"] and metric["delta"] == report["delta_vs_baseline"]
            assert metric["accuracy_over_valid_planned"] == report["accuracy_on_valid"]
            assert metric["unknown_as_definite"] == len(report["unknown_as_definite"])
            if signal in ("deception", "boundary_violation"):
                assert metric["false_positive"] == report["dangerous"]["false_positive"]
                assert metric["false_negative"] == report["dangerous"]["false_negative"]
            assert report["gate_pass"] is False
            metrics[signal] = metric
        assert not published["models"][model]["gate_passing_signals"] and published["models"][model]["rotated"] is None
        out["models"][model] = metrics
        if any(m["delta_on_executable_same_refs"] > 0 for m in metrics.values()):
            out["models_with_any_positive_subset_delta"].append(model)
    out["refused_records_total"] = sum(m["refused"] for signals in out["models"].values() for m in signals.values())
    out["conclusion"] = "No signal beats its locked constant, even on executable inputs with the same reference set; stop expansion/training investment. Not general Laya incapability or formal E acceptance."
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="D:/ModelBench/laya")
    ap.add_argument("--sidecar", default="D:/ModelBench/laya/review-return/corpus400-dev30-v1/control-only/adjudication-v1.jsonl")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    result = audit(args.base, args.sidecar)
    with open(args.out, "x", encoding="utf-8", newline="\n") as fh:
        json.dump(result, fh, ensure_ascii=False, sort_keys=True, indent=2)
        fh.write("\n")
    print("Independent indexed raw/hash/token/metric audit passed; no inference rerun.")
