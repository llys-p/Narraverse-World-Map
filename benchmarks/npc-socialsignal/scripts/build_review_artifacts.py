#!/usr/bin/env python3
"""E1R dataset artifacts (v2 builder; the pilot build_dataset.py is kept untouched).

Writes:
  samples/scenarios-dev.jsonl, samples/scenarios-calibration.jsonl   (working splits, gold in repo)
  samples/scenarios-final-blind.jsonl                                (final split, NO answer key)
  calibration/majority-lock.json                                     (constant baseline chosen on dev ONLY)

Refuses to overwrite seal-record-v2.json or the pilot split-manifest.json, and
fails if anything it writes into the repository carries a final-split answer key.

  python scripts/build_review_artifacts.py --sealed-gold D:/ModelBench/laya/sealed/v2/gold-final.jsonl
"""
import argparse
import hashlib
import json
import os
import sys
from collections import Counter

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from body import load_split_assignment  # noqa: E402

ANSWER_KEYS = ("labels", "basis", "ambiguous_by_design", "hidden_truth")
SIGNALS = ["social_act", "trust_shift", "fear_shift", "deception", "boundary_violation"]


def canon(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def read_rows():
    from glob import glob
    rows = []
    for p in sorted(glob(os.path.join(HERE, "samples", "src-batch*.jsonl"))):
        for line in open(p, encoding="utf-8"):
            if line.strip():
                rows.append(json.loads(line))
    return sorted(rows, key=lambda r: r["sid"])


def write(path, lines):
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.writelines(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sealed-gold", required=True)
    args = ap.parse_args()
    assign = load_split_assignment(HERE)
    sealed = {}
    for line in open(args.sealed_gold, encoding="utf-8"):
        if line.strip():
            r = json.loads(line)
            sealed[r["sid"]] = r

    rows = read_rows()
    buckets = {"dev": [], "calibration": [], "final": []}
    for r in rows:
        buckets[assign[r["family"]]].append(r)

    for split in ("dev", "calibration"):
        p = os.path.join(HERE, "samples", f"scenarios-{split}.jsonl")
        write(p, [canon(r) + "\n" for r in buckets[split]])

    # final blind file: only the fields the model and the reviewer are allowed to see
    keep = ["sid", "family", "rel", "persona", "boundary", "history", "turn"]
    blind = [{k: r[k] for k in keep if k in r} for r in buckets["final"]]
    bp = os.path.join(HERE, "samples", "scenarios-final-blind.jsonl")
    write(bp, [canon(r) + "\n" for r in blind])
    for r in blind:
        if any(k in r for k in ANSWER_KEYS):
            print(f"ABORT: final blind row {r['sid']} still carries an answer key")
            return 1
    if len(blind) != len(buckets["final"]):
        print("ABORT: blind row count drifted")
        return 1

    # locked constant baseline: decided on dev gold only, then reused unchanged
    dev_labels = {r["sid"]: r["labels"] for r in buckets["dev"]}
    lock = {"schema": "e1r-majority-lock-v1", "chosen_on_split": "dev",
            "n_dev_scenarios": len(buckets["dev"]),
            "note": "A deployable constant baseline must be chosen before the scored "
                    "split is seen. oracle-majority (post-hoc on the evaluated set) is "
                    "reported separately and is descriptive only.", "signals": {}}
    for sig in SIGNALS:
        c = Counter(v[sig] for v in dev_labels.values())
        top, n = c.most_common(1)[0]
        lock["signals"][sig] = {"label": top, "dev_support": n, "dev_share": round(n / len(c), 4),
                                "dev_distribution": dict(c)}
    os.makedirs(os.path.join(HERE, "calibration"), exist_ok=True)
    write(os.path.join(HERE, "calibration", "majority-lock.json"),
          [json.dumps(lock, ensure_ascii=False, indent=1) + "\n"])

    for guard in ("seal-record-v2.json", "split-manifest.json"):
        p = os.path.join(HERE, guard)
        if os.path.exists(p):
            print("preserved (not rewritten):", guard,
                  hashlib.sha256(open(p, "rb").read()).hexdigest()[:12])

    print(json.dumps({"dev": len(buckets["dev"]), "calibration": len(buckets["calibration"]),
                      "final_blind": len(blind),
                      "final_blind_sha256": hashlib.sha256(open(bp, "rb").read()).hexdigest()},
                     ensure_ascii=False, indent=1))
    print("majority lock:", {k: v["label"] for k, v in lock["signals"].items()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
