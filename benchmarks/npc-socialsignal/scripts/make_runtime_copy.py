#!/usr/bin/env python3
"""E1R R5: keep the download directory as read-only source evidence and run the
SDK against a separate copy, because laya.load() rewrites tokenizer_config.json
in place. Records both hashes so "the weights we ran are the weights we verified"
stays checkable, without claiming that a pre-load hash alone proves the runtime
directory was never modified.

  python scripts/make_runtime_copy.py --base D:/ModelBench/laya --models A,B
"""
import argparse
import datetime
import hashlib
import json
import os
import shutil

SRC = "weights"
DST = "runtime"


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--models", default="A,B")
    args = ap.parse_args()
    for m in args.models.split(","):
        src = os.path.join(args.base, SRC, m)
        dst = os.path.join(args.base, DST, m)
        os.makedirs(dst, exist_ok=True)
        listing = {}
        for root, _, names in os.walk(src):
            for nm in names:
                p = os.path.join(root, nm)
                rel = os.path.relpath(p, src).replace("\\", "/")
                if rel.startswith(".cache/"):
                    continue
                digest = sha256(p)
                listing[rel] = digest
                target = os.path.join(dst, rel.replace("/", os.sep))
                os.makedirs(os.path.dirname(target), exist_ok=True)
                if not (os.path.exists(target) and sha256(target) == digest):
                    shutil.copy2(p, target)
        record = {"created": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                  "source_dir": src.replace("\\", "/"), "runtime_dir": dst.replace("\\", "/"),
                  "purpose": "laya.load() rewrites tokenizer/tokenizer_config.json in place; the download "
                             "directory keeps the pristine, revision-verified bytes and this copy absorbs the SDK edit",
                  "source_sha256": listing,
                  "post_run_note": "compare runtime hashes against source_sha256 after a run to see exactly "
                                   "what the SDK changed"}
        json.dump(record, open(os.path.join(dst, "RUNTIME-COPY.json"), "w", encoding="utf-8", newline="\n"),
                  ensure_ascii=False, indent=1)
        print(m, "copied", len(listing), "files;",
              "model.safetensors", listing.get("model.safetensors", "?")[:16])
    return 0


if __name__ == "__main__":
    main()
