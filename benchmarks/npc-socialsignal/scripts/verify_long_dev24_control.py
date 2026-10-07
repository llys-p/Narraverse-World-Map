"""Independent tokenizer/consumer audit. No inference; never changes v1 artifacts."""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
from copy import deepcopy
from unittest.mock import patch

from inputs import assemble_with_budget, build_body
import score
import build_long_dev24 as builder

ROOT = Path(__file__).resolve().parent.parent


def audit(base):
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    from transformers import AutoTokenizer
    tok_path = Path(base) / "runtime/A/tokenizer"
    tok = AutoTokenizer.from_pretrained(tok_path, local_files_only=True)
    counter = lambda text: len(tok(text, add_special_tokens=False)["input_ids"])
    rows = [json.loads(line) for line in (ROOT / "samples/long-dev24.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(rows) == 24 and len({r["sid"] for r in rows}) == 24
    assert not builder.validate_schema(rows)
    incomplete = deepcopy(rows)
    incomplete[0]["decisive_evidence"].pop("trust_shift")
    assert builder.validate_schema(incomplete), "missing per-signal evidence must fail validation"
    assert builder.validate_schema(rows[:-1]), "wrong plan size must fail validation"
    assert all(set(r["decisive_evidence"]) == set(builder.SIGNALS) for r in rows)
    counts = Counter(next(t for t in r["tags"] if t.startswith("cat")) for r in rows)
    assert set(counts) == set(builder.CATEGORIES) and set(counts.values()) == {6}
    assert len({r["family"] for r in rows}) >= 8
    items, primary_records, long_records = [], [], []
    qt = score.load_questions(str(ROOT / "question-templates.json"))
    head_counts = {s: counter(sp["instructions"] + "".join(k + v for k, v in sp["options"].items())) for s, sp in qt["signals"].items()}
    assert max(head_counts.values()) <= 256
    for row in rows:
        primary, _ = build_body(row)
        item = {"sid": row["sid"], "primary_tokens": counter(primary), "primary_missing_refs": {}, "long": {}}
        for sig in builder.SIGNALS:
            missing = [r for r in row["decisive_evidence"][sig] if r not in primary]
            item["primary_missing_refs"][sig] = missing
            body, rep = assemble_with_budget(counter, row, 768, sig)
            assert body is None or counter(body) <= 768
            item["long"][sig] = rep
            def record(condition, relabel, error=None):
                return {"sid": row["sid"], "signal": sig, "model": "A", "split": "dev", "condition": condition,
                        "predicted": None if error else row["labels"][sig], "predict_error": error,
                        "input_report": {"requires_relabel": relabel}, "excluded_from_formal_scoring": relabel}
            primary_records.append(record("primary", bool(missing), "REFUSED_INPUT_OVER_BUDGET" if counter(primary) > 768 else None))
            long_records.append(record("long", rep["requires_relabel"], "REFUSED_CORE_OVER_BUDGET" if body is None else None))
        items.append(item)
    exits = {}
    # Synthetic label copies probe the real CLI's publication guard; they are
    # never represented as model predictions or actual label accuracy evidence.
    with tempfile.TemporaryDirectory(prefix="longdev-cli-") as td:
        for condition, records in (("primary", primary_records), ("long", long_records)):
            path = Path(td) / (condition + ".jsonl")
            path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")
            entry = {"model": "A", "split": "dev", "condition": condition, "path": str(path),
                     "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "records": len(records)}
            index = Path(td) / "index.json"
            index.write_text(json.dumps({"runs": {condition: entry}}), encoding="utf-8")
            gold = {r["sid"]: r["labels"] for r in rows}
            (Path(td) / "question-templates.json").write_bytes((ROOT / "question-templates.json").read_bytes())
            with patch.object(score, "rows_for", return_value=rows), patch.object(score, "gold_map_for", return_value=gold), patch.object(score, "HERE", td):
                with patch.object(sys, "argv", ["score.py", "--models", "A", "--split", "dev", "--condition", condition, "--index", str(index)]):
                    exits[condition] = score.main()
            assert exits[condition] == 4
            assert not list(Path(td).rglob("scores-*.json"))
    return {"schema": "long-dev24-control-audit-v1", "planned_scenarios": 24, "planned_signal_items": 120,
            "batch_sha256": hashlib.sha256((ROOT / "samples/long-dev24.jsonl").read_bytes()).hexdigest(),
            "label_spec_sha256": hashlib.sha256((ROOT / "LABEL_SPEC.md").read_bytes()).hexdigest(),
            "tokenizer_sha256": hashlib.sha256((tok_path / "tokenizer.json").read_bytes()).hexdigest(),
            "category_counts": dict(counts), "head_tokens": head_counts,
            "formal_cli_rejection_exit": exits, "synthetic_predictions_only": True,
            "model_inference": False, "label_quality_accepted": False,
            "primary_missing_evidence_scenarios": sum(any(r["primary_missing_refs"].values()) for r in items),
            "primary_over_budget_scenarios": sum(r["primary_tokens"] > 768 for r in items), "items": items}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="D:/ModelBench/laya")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    output = audit(args.base)
    with open(args.out, "x", encoding="utf-8") as fh:
        json.dump(output, fh, ensure_ascii=False, indent=2)
    print("Independent input paths and formal CLI guards passed; label reliability remains separate.")
