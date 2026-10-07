#!/usr/bin/env python3
"""E1R data contract validator (v2). The pilot validator stays in the tree as
evidence; this is what E1R requires going forward.

Differences forced by E1R:
  * final-family rows in the repository MUST NOT carry labels / basis /
    ambiguous_by_design / hidden_truth - presence is a leak and fails the run;
  * final distributions and hashes come from the sealed gold file outside the repo,
    passed with --sealed-gold;
  * output is split-manifest-v2.json; the pilot split-manifest.json is never
    rewritten, so the historical seal record survives;
  * an existing freeze record is carried forward verbatim - re-running the
    validator cannot silently un-freeze or re-open anything.

  python scripts/validate_data_v2.py --sealed-gold D:/ModelBench/laya/sealed/v2/gold-final.jsonl
"""
import argparse
import glob
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIGNALS = {
    "social_act": ["威胁", "示好", "求助", "合作", "中性", "不确定"],
    "trust_shift": ["上升", "不变", "下降", "不确定"],
    "fear_shift": ["上升", "不变", "下降", "不确定"],
    "deception": ["有线索", "无线索", "信息不足"],
    "boundary_violation": ["已越过", "未越过", "信息不足"],
}
REQUIRED = ["sid", "family", "rel", "persona", "boundary", "history", "turn"]
ANSWER_KEYS = ("labels", "basis", "ambiguous_by_design", "hidden_truth")
ALLOWED_EXTRA = ["tags", "len", "notes", "extra_history", "decisive_evidence", "paraphrase_of"]
HIGH_RISK = {"deception", "boundary_violation"}


def canon_hash(obj):
    blob = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.replace("\r\n", "\n").encode("utf-8")).hexdigest()


def load_assign():
    with open(os.path.join(HERE, "split-assignment.json"), encoding="utf-8") as fh:
        return {k: v["split"] for k, v in json.load(fh)["families"].items()}


def norm(t):
    return re.sub(r"[\s，。！？、；：“”\"'（）()\-—…]", "", t or "").lower()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sealed-gold", default=None)
    args = ap.parse_args()
    assign = load_assign()

    sealed = {}
    if args.sealed_gold and os.path.exists(args.sealed_gold):
        for line in open(args.sealed_gold, encoding="utf-8"):
            if line.strip():
                r = json.loads(line)
                sealed[r["sid"]] = r

    errors, rows = [], []
    for path in sorted(glob.glob(os.path.join(HERE, "samples", "src-batch*.jsonl"))):
        for n, line in enumerate(open(path, encoding="utf-8"), 1):
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            where = f"{os.path.basename(path)}:{n} {r.get('sid','?')}"
            split = assign.get(r.get("family"))
            if split is None:
                errors.append(f"{where} family {r.get('family')} has no split assignment")
                continue
            for k in REQUIRED:
                if k not in r:
                    errors.append(f"{where} missing field {k}")
            for k in r:
                if k not in REQUIRED + list(ANSWER_KEYS) + ALLOWED_EXTRA:
                    errors.append(f"{where} unknown field {k}")
            if not isinstance(r.get("history"), list):
                errors.append(f"{where} history is not a list")
            if split == "final":
                leaked = [k for k in ANSWER_KEYS if k in r]
                if leaked:
                    errors.append(f"{where} FINAL row carries answer-bearing fields {leaked} inside the repository")
                if r["sid"] not in sealed:
                    errors.append(f"{where} final row has no entry in the sealed gold file")
                else:
                    labels = sealed[r["sid"]]["labels"]
                    if sealed[r["sid"]].get("sid") != r["sid"]:
                        errors.append(f"{where} sealed row sid mismatch")
                    for sig, allowed in SIGNALS.items():
                        if labels.get(sig) not in allowed:
                            errors.append(f"{where} sealed {sig}={labels.get(sig)!r} not in {allowed}")
            else:
                if "labels" not in r:
                    errors.append(f"{where} work-split row has no labels")
                else:
                    if set(r["labels"]) != set(SIGNALS):
                        errors.append(f"{where} label set {sorted(r['labels'])} != {sorted(SIGNALS)}")
                    for sig, allowed in SIGNALS.items():
                        if r["labels"].get(sig) not in allowed:
                            errors.append(f"{where} {sig}={r['labels'].get(sig)!r} not in {allowed}")
                    b = r.get("basis") or {}
                    for sig in HIGH_RISK:
                        if sig not in b:
                            errors.append(f"{where} high-risk {sig} has no basis note")
            if r["sid"] in sealed and norm(r["turn"]) != norm(sealed[r["sid"]]["turn"]):
                errors.append(f"{where} repository text differs from sealed text for the same sid")
            rows.append(r)

    for s, c in Counter(r["sid"] for r in rows).items():
        if c > 1:
            errors.append(f"duplicate sid {s} x{c}")
    for t, c in Counter(norm(r["turn"]) for r in rows).items():
        if c > 1:
            errors.append(f"identical turn text used {c} times: {t[:24]}")

    by_split = defaultdict(list)
    for r in rows:
        by_split[assign[r["family"]]].append(r)

    manifest = {"schema": "e1r-manifest-v2", "split_policy": "family-exclusive",
                "generated_by": "scripts/validate_data_v2.py", "signal_option_sets": SIGNALS,
                "sealed_gold_file": (args.sealed_gold or "").replace("\\", "/"),
                "sealed_gold_sha256": (hashlib.sha256(open(args.sealed_gold, "rb").read()).hexdigest()
                                       if args.sealed_gold and os.path.exists(args.sealed_gold) else None),
                "splits": {}, "warnings": []}
    for split in ("dev", "calibration", "final"):
        rs = by_split.get(split, [])
        labels_of = (lambda r: sealed[r["sid"]]["labels"]) if split == "final" else (lambda r: r["labels"])
        dist = {sig: {opt: 0 for opt in opts} for sig, opts in SIGNALS.items()}
        for r in rs:
            for sig, val in labels_of(r).items():
                if val in dist.get(sig, {}):
                    dist[sig][val] += 1
        manifest["splits"][split] = {
            "scenarios": len(rs), "items": len(rs) * len(SIGNALS),
            "families": sorted({r["family"] for r in rs}),
            "label_distribution": dist,
            "classes_under_20": sorted(f"{sig}:{opt}" for sig, d in dist.items() for opt in d if d[opt] < 20),
            "input_sha256": canon_hash([{k: v for k, v in r.items() if k in REQUIRED}
                                        for r in sorted(rs, key=lambda x: x["sid"])]),
            "gold_sha256": canon_hash([labels_of(r) for r in sorted(rs, key=lambda x: x["sid"])]),
            "gold_in_repository": split != "final",
        }
        for sig, d in dist.items():
            for opt, c in d.items():
                if c == 0:
                    manifest["warnings"].append(f"{split}: {sig}:{opt} has 0 samples")

    prev_path = os.path.join(HERE, "split-manifest-v2.json")
    if os.path.exists(prev_path):
        prev = json.load(open(prev_path, encoding="utf-8"))
        for key in ("label_freeze", "blind_review", "frozen_at"):
            if key in prev:
                manifest[key] = prev[key]
                manifest.setdefault("carried_forward", []).append(key)

    manifest["total_scenarios"] = sum(len(v) for v in by_split.values())
    manifest["files"] = sorted(os.path.basename(p) for p in glob.glob(os.path.join(HERE, "samples", "src-batch*.jsonl")))
    json.dump(manifest, open(os.path.join(HERE, "split-manifest-v2.json"), "w", encoding="utf-8", newline="\n"),
              ensure_ascii=False, indent=2, sort_keys=True)

    print(f"scenarios total={manifest['total_scenarios']} dev={len(by_split['dev'])} "
          f"cal={len(by_split['calibration'])} final={len(by_split['final'])} (gold only in sealed file)")
    for e in errors:
        print("ERROR", e)
    print(f"errors={len(errors)} -> split-manifest-v2.json"
          + (f" (carried forward: {manifest.get('carried_forward')})" if manifest.get("carried_forward") else ""))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
