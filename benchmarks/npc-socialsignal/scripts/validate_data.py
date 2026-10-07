#!/usr/bin/env python3
"""E1 M1 data validator + split manifest builder.

Reads samples/src-batch*.jsonl, validates against LABEL_SPEC option sets and
split-assignment.json (family -> split, so no family ever crosses splits),
then writes split-manifest.json with counts, label distributions and
line-ending-independent content hashes.

Stdlib only so it runs on any machine for reproduction.
"""
import glob
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SIGNALS = {
    "social_act": ["威胁", "示好", "求助", "合作", "中性", "不确定"],
    "trust_shift": ["上升", "不变", "下降", "不确定"],
    "fear_shift": ["上升", "不变", "下降", "不确定"],
    "deception": ["有线索", "无线索", "信息不足"],
    "boundary_violation": ["已越过", "未越过", "信息不足"],
}
REQUIRED = ["sid", "family", "rel", "persona", "boundary", "history", "turn", "labels"]
OPTIONAL = ["hidden_truth", "basis", "tags", "len", "ambiguous_by_design", "notes"]
BANNED_IN_MODEL_INPUT = SIGNALS.keys() | {"hidden_truth", "labels", "basis", "tags", "split", "sid"}

HIGH_RISK = {"deception", "boundary_violation"}


def canon_hash(obj) -> str:
    """Hash independent of CRLF/autocrlf: canonical JSON with LF joins."""
    blob = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.replace("\r\n", "\n").encode("utf-8")).hexdigest()


def load_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as fh:
        for n, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append((os.path.basename(path), n, json.loads(line)))
            except json.JSONDecodeError as exc:
                rows = None
                print(f"PARSE FAIL {path}:{n}: {exc}")
                return []
    return rows


def normalize(text):
    """Near-duplicate key: strip punctuation/whitespace, casefold."""
    return re.sub(r"[\s，。！？、；：“”\"'（）()\-—…]", "", text or "").lower()


def main():
    errors = []
    files = sorted(glob.glob(os.path.join(ROOT, "samples", "src-batch*.jsonl")))
    if not files:
        print("no sample files found")
        return 1

    with open(os.path.join(ROOT, "split-assignment.json"), encoding="utf-8") as fh:
        assign = {k: v["split"] for k, v in json.load(fh)["families"].items()}

    seen_sid, seen_turn, by_split, families = {}, {}, defaultdict(list), set()
    for f in files:
        for src, n, r in load_jsonl(f):
            where = f"{src}:{n} {r.get('sid','?')}"
            for k in REQUIRED:
                if k not in r:
                    errors.append(f"{where} missing field {k}")
            for k in r:
                if k not in REQUIRED + OPTIONAL:
                    errors.append(f"{where} unknown field {k}")
            sid = r.get("sid")
            if sid in seen_sid:
                errors.append(f"{where} duplicate sid (also {seen_sid[sid]})")
            seen_sid[sid] = where
            fam = r.get("family")
            families.add(fam)
            if fam not in assign:
                errors.append(f"{where} family {fam} has no split assignment")
                continue
            got = set(r.get("labels", {}))
            if got != set(SIGNALS):
                errors.append(f"{where} label set {sorted(got)} != {sorted(SIGNALS)}")
                continue
            for sig, allowed in SIGNALS.items():
                val = r["labels"].get(sig)
                if val not in allowed:
                    errors.append(f"{where} {sig}={val!r} not in {allowed}")
            b = r.get("basis") or {}
            for sig in HIGH_RISK:
                if sig not in b:
                    errors.append(f"{where} high-risk {sig} has no basis note")
            for sig in b:
                if sig not in SIGNALS:
                    errors.append(f"{where} basis has unknown signal {sig}")
            tk = normalize(r.get("turn"))
            if tk in seen_turn:
                errors.append(f"{where} turn identical to {seen_turn[tk]} (near-duplicate)")
            seen_turn[tk] = where
            if not isinstance(r.get("history"), list):
                errors.append(f"{where} history is not a list")
            by_split[assign[fam]].append((fam, r))

    missing_fams = sorted(f for f in assign if f not in families)

    manifest = {"generated_by": "scripts/validate_data.py", "signal_option_sets": SIGNALS,
                "split_policy": "family-exclusive", "splits": {}, "warnings": []}
    for split in ("dev", "calibration", "final"):
        rows = by_split.get(split, [])
        dist = {sig: {opt: 0 for opt in opts} for sig, opts in SIGNALS.items()}
        for _, r in rows:
            for sig, val in r["labels"].items():
                if sig in dist and val in dist[sig]:
                    dist[sig][val] += 1
        fams = sorted({f for f, _ in rows})
        manifest["splits"][split] = {
            "scenarios": len(rows),
            "items": len(rows) * len(SIGNALS),
            "families": fams,
            "label_distribution": dist,
            "classes_under_20": sorted(f"{sig}:{opt}" for sig, o in dist.items() for opt in o if o[opt] < 20),
            "content_sha256": canon_hash([r for _, r in sorted(rows, key=lambda x: x[1]["sid"])]),
        }
        for sig, opt_list in SIGNALS.items():
            for opt in opt_list:
                if dist[sig][opt] == 0:
                    manifest["warnings"].append(f"{split}: {sig}:{opt} has 0 samples")
    manifest["total_scenarios"] = sum(len(v) for v in by_split.values())
    manifest["families_without_samples"] = missing_fams
    manifest["files"] = [os.path.basename(f) for f in files]

    with open(os.path.join(ROOT, "split-manifest.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2, sort_keys=True)
        fh.write("\n")

    print(f"scenarios total={manifest['total_scenarios']} "
          f"dev={manifest['splits']['dev']['scenarios']} "
          f"cal={manifest['splits']['calibration']['scenarios']} "
          f"final={manifest['splits']['final']['scenarios']}")
    for e in errors:
        print("ERROR", e)
    print(f"errors={len(errors)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
