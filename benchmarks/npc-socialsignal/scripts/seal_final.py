#!/usr/bin/env python3
"""E1R R1: actually separate the final answer key from the repository, and build
the anonymized review packages OUTSIDE the repository.

Why outside: git history at e9196ab and earlier contains the final gold labels in
samples/src-batch*.jsonl. Anyone with repo access can recover them, so a package
that lives in the repo is not blind. This script:

  1. rewrites the tracked source rows for final-family scenarios, removing
     labels / basis / ambiguous_by_design / hidden_truth (dev + calibration rows
     are left byte-identical so pilot evidence is not churned);
  2. writes the full final rows to <sealed>/v2/gold-final.jsonl (v1 is never
     overwritten - the old seal hash keeps its historical meaning);
  3. writes <pack>/blind/ and <pack>/sanity-dev/ reviewer directories: opaque ids,
     the exact text the model sees, the label spec, a blank answer sheet - and
     nothing else (no family, split, tags, author intent, gold or predictions);
  4. writes <sealed>/v2/id-map.json (opaque id -> sid) and a seal-record-v2.json
     with every hash, and records the history-exposure fact in it.

  python scripts/seal_final.py --sealed-out D:/ModelBench/laya/sealed --pack-out D:/ModelBench/laya/review-pack --sanity-n 25
"""
import argparse
import datetime
import hashlib
import json
import os
import re
import sys
from collections import OrderedDict, defaultdict

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from body import load_split_assignment  # noqa: E402
from inputs import build_body  # noqa: E402

FORBIDDEN_IN_REPO_FOR_FINAL = ("labels", "basis", "ambiguous_by_design", "hidden_truth")
SIGNALS = ["social_act", "trust_shift", "fear_shift", "deception", "boundary_violation"]


def sha256_file(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def canon(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def strip_line(text):
    """Remove answer-bearing keys from one JSONL line, preserving key order and
    the exact formatting of everything that stays."""
    obj = json.loads(text, object_pairs_hook=OrderedDict)
    for k in FORBIDDEN_IN_REPO_FOR_FINAL:
        obj.pop(k, None)
    return json.dumps(obj, ensure_ascii=False)


def stratified_dev_sample(rows, assign, n):
    """Pick ~n dev rows spread across families and coverage tags, so a label-spec
    trial exercises negation/irony/multi-reference/boundary-adjacent cases rather
    than the easiest 25."""
    byfam = defaultdict(list)
    for r in rows:
        if assign.get(r["family"]) == "dev":
            byfam[r["family"]].append(r)
    pool, fams = [], sorted(byfam)
    i = 0
    while len(pool) < n and any(byfam[f] for f in fams):
        f = fams[i % len(fams)]
        if byfam[f]:
            pool.append(byfam[f].pop(0))
        i += 1
    return pool[:n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sealed-out", required=True)
    ap.add_argument("--pack-out", required=True)
    ap.add_argument("--sanity-n", type=int, default=25)
    args = ap.parse_args()

    assign = load_split_assignment(HERE)
    v2 = os.path.join(args.sealed_out, "v2")
    os.makedirs(v2, exist_ok=True)
    os.makedirs(args.pack_out, exist_ok=True)

    # 1 + 2: split tracked sources, keep dev/calibration lines untouched
    src_dir = os.path.join(HERE, "samples")
    final_rows, work_rows = [], []
    files_touched = []
    for name in sorted(os.listdir(src_dir)):
        if not re.match(r"src-batch.*\.jsonl$", name):
            continue
        path = os.path.join(src_dir, name)
        keep = []
        for line in open(path, encoding="utf-8"):
            if not line.strip():
                continue
            row = json.loads(line, object_pairs_hook=OrderedDict)
            if assign.get(row["family"]) == "final":
                final_rows.append(json.loads(line))
                keep.append(strip_line(line.rstrip("\n")) + "\n")
                files_touched.append(name)
            else:
                work_rows.append(json.loads(line))
                keep.append(line if line.endswith("\n") else line + "\n")
        with open(path, "w", encoding="utf-8", newline="\n") as fh:
            fh.writelines(keep)

    gold_p = os.path.join(v2, "gold-final.jsonl")
    if os.path.exists(gold_p):
        stamp = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
        gold_p = os.path.join(v2, f"gold-final.{stamp}.jsonl")
        print("existing v2 gold preserved; writing new file:", os.path.basename(gold_p))
    with open(gold_p, "w", encoding="utf-8", newline="\n") as fh:
        for r in sorted(final_rows, key=lambda x: x["sid"]):
            fh.write(canon(r) + "\n")

    # 3: reviewer packages, outside the repo, opaque ids
    all_rows = work_rows + final_rows
    pack_dirs = {}
    for kind, rows in (("blind", sorted(all_rows, key=lambda r: r["sid"])),
                       ("sanity-dev", stratified_dev_sample(work_rows, assign, args.sanity_n))):
        d = os.path.join(args.pack_out, kind)
        os.makedirs(d, exist_ok=True)
        pack_dirs[kind] = d
        prefix = "E1R-BLIND" if kind == "blind" else "E1R-SANITY"
        inputs_p = os.path.join(d, "review-inputs.jsonl")
        sheet_p = os.path.join(d, "answer-sheet.jsonl")
        idmap = {}
        with open(inputs_p, "w", encoding="utf-8", newline="\n") as fi, \
             open(sheet_p, "w", encoding="utf-8", newline="\n") as fs:
            for i, r in enumerate(rows, 1):
                token = f"{prefix}-{i:04d}"
                idmap[token] = r["sid"]
                body, _ = build_body(r)
                fi.write(canon({"token": token, "model_visible_text": body,
                                "answer_slots": SIGNALS}) + "\n")
                fs.write(canon({"token": token, **{s: "" for s in SIGNALS},
                                "evidence_quote": "", "spec_question": ""}) + "\n")
        with open(os.path.join(d, "LABEL_SPEC.md"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(open(os.path.join(HERE, "LABEL_SPEC.md"), encoding="utf-8").read())
        readme = (
            "# 盲审说明（复核者唯一需要读的文件）\n\n"
            "1. `review-inputs.jsonl` 每行一条：`token` 是匿名编号，`model_visible_text` 是待判定的中文场景全文，"
            "`answer_slots` 是五个待填信号。\n"
            "2. 只依据 `model_visible_text` 本身判定，按 `LABEL_SPEC.md` 的定义与裁定顺序填写 `answer-sheet.jsonl`。\n"
            "3. 不要参考任何项目仓库、报告、模型输出或另一位复核者的结果；看不出线索就按规范给 `不确定` / `信息不足`。\n"
            "4. `evidence_quote` 请摘录你据以判定的原文片段（不超过 40 字）；`spec_question` 写这条里让你无法判定的规范问题。\n"
            "5. 逐条独立判定，不要因为某类看起来偏多或偏少而调整。\n"
        )
        with open(os.path.join(d, "README.md"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(readme)
        map_p = os.path.join(v2, f"id-map-{kind}.json")
        json.dump({"created": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                   "kind": kind, "map": idmap},
                  open(map_p, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)

    # 4: seal record with hashes + history fact
    leak_scan = []
    for path, _, names in os.walk(HERE):
        if any(p in path for p in (".git", "__pycache__")):
            continue
        for nm in names:
            if not nm.endswith(".jsonl"):
                continue
            p = os.path.join(path, nm)
            for ln, line in enumerate(open(p, encoding="utf-8"), 1):
                if '"labels"' not in line:
                    continue
                row = json.loads(line)
                fam = row.get("family")
                if assign.get(fam) == "final" and "labels" in row:
                    leak_scan.append(f"{os.path.relpath(p, HERE)}:{ln} {row.get('sid')}")
    record = {
        "schema": "e1r-seal-v2",
        "created": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "final_scenarios": len(final_rows),
        "dev_calibration_scenarios": len(work_rows),
        "gold_final_path_outside_repo": gold_p.replace("\\", "/"),
        "gold_final_sha256": sha256_file(gold_p),
        "review_packages_outside_repo": {k: v.replace("\\", "/") for k, v in pack_dirs.items()},
        "package_hashes": {k: {"review-inputs.jsonl": sha256_file(os.path.join(v, "review-inputs.jsonl")),
                               "answer-sheet.jsonl": sha256_file(os.path.join(v, "answer-sheet.jsonl")),
                               "LABEL_SPEC.md": sha256_file(os.path.join(v, "LABEL_SPEC.md")),
                               "n": len(open(os.path.join(v, "review-inputs.jsonl"), encoding="utf-8").readlines())}
                           for k, v in pack_dirs.items()},
        "id_maps_outside_repo": {k: os.path.join(v2, f"id-map-{k}.json").replace("\\", "/") for k in pack_dirs},
        "sources_rewritten": sorted(set(files_touched)),
        "repo_final_gold_scan": {"leaks_found": leak_scan, "status": "clean" if not leak_scan else "LEAK"},
        "history_exposure": (
            "Git commits 5599c46 / 6adb2bd / e9196ab contain samples/src-batch*.jsonl with the final split's gold "
            "labels and basis. That answer key is recoverable from history and was NOT rewritten or deleted, per "
            "E1R instruction not to erase history. Consequence: no reviewer who has read those commits, the pilot "
            "reports, or the working chat may blind-review the current 62 final scenarios. The reviewer packages "
            "produced here live outside the repository for the same reason."),
        "old_seal_v1": {
            "gold_final_sha256": "4b245c18a634322550f537f5be46702f4900c7633c69743debb342ccac5efcbc",
            "note": "v1 seal retained for historical reference only; it was computed from an answer key that was "
                    "simultaneously present in the repository, so it cannot support a blind-review claim.",
        },
    }
    dest = os.path.join(HERE, "seal-record-v2.json")
    json.dump(record, open(dest, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    print(json.dumps({k: record[k] for k in ("final_scenarios", "dev_calibration_scenarios",
                                             "gold_final_sha256", "package_hashes",
                                             "sources_rewritten")}, ensure_ascii=False, indent=1))
    print("leak status:", record["repo_final_gold_scan"]["status"], record["repo_final_gold_scan"]["leaks_found"][:5])
    print("wrote", os.path.relpath(dest, HERE), "and packs under", args.pack_out.replace("\\", "/"))
    return 0 if not leak_scan else 1


if __name__ == "__main__":
    sys.exit(main())
