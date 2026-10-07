#!/usr/bin/env python3
"""E1R2 F1: register already-produced raw prediction files into results/raw/run-index.json.

The scorer now refuses to guess filenames, so the pilot and E1R raw artefacts have
to be declared explicitly. Entries are marked provenance=registered_after_the_fact
with the run configuration recovered from the matching .meta.json when present, and
with whatever the file itself states otherwise, so nobody mistakes a back-registered
entry for a run that was indexed while it happened.

  python scripts/register_runs.py [--dry-run]
"""
import argparse
import glob
import hashlib
import json
import os

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDX = os.path.join(HERE, "results", "raw", "run-index.json")
SPLIT_OF = {"dev": "dev", "calibration": "calibration", "final": "final"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    idx = json.load(open(IDX, encoding="utf-8")) if os.path.exists(IDX) else {
        "schema": "e1r2-run-index-v1", "runs": {}}
    added = []
    for path in sorted(glob.glob(os.path.join(HERE, "results", "raw", "*-primary.jsonl"))):
        base = os.path.basename(path)
        stem = base[:-len(".jsonl")]
        if stem.endswith(".e1r"):
            stem = stem[:-len(".e1r")]
        model, split, condition = stem.split("-", 2)
        if split not in SPLIT_OF:
            continue
        with open(path, "rb") as fh:
            data = fh.read()
        recs = [json.loads(l) for l in data.decode("utf-8").splitlines() if l.strip()]
        if not recs:
            continue
        meta_p = path.replace(".jsonl", ".meta.json")
        meta = json.load(open(meta_p, encoding="utf-8")) if os.path.exists(meta_p) else {}
        config = meta.get("config") or {
            "device": meta.get("device", "unknown"),
            "max_len": meta.get("max_len", "unknown"),
            "head_max_len": meta.get("head_max_len", "unknown"),
            "batch_size": meta.get("batch_size", "unknown"),
            "timeout_s": meta.get("timeout_s", "not enforced by the producing runner"),
            "limit": meta.get("limit", 0)}
        key = f"{model}|{split}|{condition}"
        n = 1
        lookup = key
        while lookup in idx["runs"]:
            n += 1
            lookup = f"{key}#{n}"
        if key in idx["runs"] or lookup != key:
            if any(e.get("sha256") == hashlib.sha256(data).hexdigest() for e in idx["runs"].values()):
                continue
        idx["runs"][lookup] = {
            "model": model, "split": split, "condition": condition,
            "path": os.path.relpath(path, HERE).replace("\\", "/"),
            "sha256": hashlib.sha256(data).hexdigest(), "records": len(recs),
            "config": config, "provenance": "registered_after_the_fact",
            "produced_by": os.path.basename(meta_p) if meta else "no meta file",
            "registered_at": "this script"}
        added.append((lookup, idx["runs"][lookup]["path"], idx["runs"][lookup]["records"]))

    print(json.dumps(added, ensure_ascii=False, indent=1))
    if not args.dry_run:
        json.dump(idx, open(IDX, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
        print("wrote", os.path.relpath(IDX, HERE), "entries:", len(idx["runs"]))
    else:
        print("dry run, nothing written")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
