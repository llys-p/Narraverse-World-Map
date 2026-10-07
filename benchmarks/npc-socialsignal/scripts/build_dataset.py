#!/usr/bin/env python3
"""E1 M1: build per-split scenario files, the blind-review package, and the
sealed gold record for the final split.

The final split's gold labels are deliberately NOT written into the repository:
the reviewer will have read access to this branch, so a committed answer key
would fake the blind review. Instead:
  - reviews/blind-package.jsonl   : every scenario, no labels, no basis
  - reviews/blind-answer-sheet.jsonl : blank table for the reviewer to fill
  - <sealed-out>/gold-final.jsonl: gold, kept OUTSIDE the repo, sha256 recorded
    into split-manifest.json so tampering is detectable.

  python scripts/build_dataset.py --sealed-out D:/ModelBench/laya/sealed
"""
import argparse
import datetime
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from body import load_rows, load_split_assignment, build_body  # noqa: E402

SIGNALS = ["social_act", "trust_shift", "fear_shift", "deception", "boundary_violation"]


def sha256_file(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def canon(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sealed-out", required=True, help="directory outside the repo")
    args = ap.parse_args()

    assign = load_split_assignment(HERE)
    rows = load_rows(HERE)
    buckets = {"dev": [], "calibration": [], "final": []}
    for r in rows:
        buckets[assign[r["family"]]].append(r)

    os.makedirs(os.path.join(HERE, "samples"), exist_ok=True)
    os.makedirs(os.path.join(HERE, "reviews"), exist_ok=True)
    os.makedirs(args.sealed_out, exist_ok=True)

    # working splits keep their gold in-repo (they are not the blind test)
    for split in ("dev", "calibration"):
        p = os.path.join(HERE, "samples", f"scenarios-{split}.jsonl")
        with open(p, "w", encoding="utf-8", newline="\n") as fh:
            for r in buckets[split]:
                fh.write(canon(r) + "\n")

    # blind package: identical fields for every split, labels removed
    blind_p = os.path.join(HERE, "reviews", "blind-package.jsonl")
    with open(blind_p, "w", encoding="utf-8", newline="\n") as fh:
        for split in ("dev", "calibration", "final"):
            for r in buckets[split]:
                fh.write(canon({"sid": r["sid"], "split": split, "family": r["family"],
                                "rel": r["rel"], "model_input": build_body(r),
                                "fields": {"persona": r["persona"], "boundary": r.get("boundary"),
                                           "history": r.get("history"), "turn": r["turn"]},
                                "ambiguous_by_design": r.get("ambiguous_by_design", False)}) + "\n")

    sheet_p = os.path.join(HERE, "reviews", "blind-answer-sheet.jsonl")
    with open(sheet_p, "w", encoding="utf-8", newline="\n") as fh:
        for split in ("dev", "calibration", "final"):
            for r in buckets[split]:
                fh.write(canon({"sid": r["sid"], "split": split,
                                **{s: "" for s in SIGNALS}, "notes": ""}) + "\n")

    sealed_p = os.path.join(args.sealed_out, "gold-final.jsonl")
    with open(sealed_p, "w", encoding="utf-8", newline="\n") as fh:
        for r in buckets["final"]:
            fh.write(canon({"sid": r["sid"], "labels": {s: r["labels"][s] for s in SIGNALS}}) + "\n")

    # same treatment for dev/calibration so a reviewer who wants to re-label those
    # can be checked offline without exposing the blind set
    for split in ("dev", "calibration"):
        p = os.path.join(args.sealed_out, f"gold-{split}.jsonl")
        with open(p, "w", encoding="utf-8", newline="\n") as fh:
            for r in buckets[split]:
                fh.write(canon({"sid": r["sid"], "labels": {s: r["labels"][s] for s in SIGNALS}}) + "\n")

    manifest_p = os.path.join(HERE, "split-manifest.json")
    manifest = json.load(open(manifest_p, encoding="utf-8"))
    manifest["built_at"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    manifest["files"] = {
        os.path.basename(os.path.join(HERE, "samples", f"scenarios-{s}.jsonl")): sha256_file(os.path.join(HERE, "samples", f"scenarios-{s}.jsonl"))
        for s in ("dev", "calibration")
    }
    manifest["files"][os.path.basename(blind_p)] = sha256_file(blind_p)
    manifest["files"][os.path.basename(sheet_p)] = sha256_file(sheet_p)
    manifest["label_freeze"] = {
        "final_frozen": False,
        "final_gold_location": "outside repository (sealed); path recorded by controller",
        "final_gold_sha256": sha256_file(sealed_p),
        "final_scenarios": len(buckets["final"]),
        "blind_review": {"status": "not_returned", "reviewer": None,
                         "returned_at": None, "agreement": None, "kappa": None,
                         "disagreements_adjudicated": 0},
        "note": "M3 may open the final split only after blind review is returned, disagreements "
                "adjudicated, and final_frozen set true with this same gold sha256.",
    }
    manifest["seal_note"] = ("The repository contains no gold labels for the final split, so the "
                             "external reviewer cannot read the answer key from this branch.")
    with open(manifest_p, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write("\n")

    print(json.dumps({"dev": len(buckets["dev"]), "calibration": len(buckets["calibration"]),
                      "final": len(buckets["final"]),
                      "final_gold_sha256": manifest["label_freeze"]["final_gold_sha256"],
                      "blind_package": os.path.relpath(blind_p, HERE),
                      "answer_sheet": os.path.relpath(sheet_p, HERE),
                      "sealed_dir": args.sealed_out}, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
