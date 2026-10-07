#!/usr/bin/env python3
"""E1R2 F5: rebuild reviewer packages against the current LABEL_SPEC, with the
answer slots the spec actually requires (per-signal basis) and the machine enum
stated explicitly.

Packages are written OUTSIDE the repository, because repository history contains
the final gold labels; a package inside the repo is not blind. The pack manifest
records the LABEL_SPEC hash it was built against, so a freeze gate can bind spec
version to reviewer returns and a re-trial after a spec change cannot be mistaken
for the earlier round.

  python scripts/make_review_pack.py --pack-out D:/ModelBench/laya/review-pack-v3 --kind sanity-retrial-v2
  python scripts/make_review_pack.py --pack-out D:/ModelBench/laya/review-pack-v3 --kind blind
"""
import argparse
import datetime
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from body import load_questions, load_split_assignment  # noqa: E402
from inputs import build_body, rows_for  # noqa: E402

SIGNALS = ["social_act", "trust_shift", "fear_shift", "deception", "boundary_violation"]
ALIASES = {"有欺骗线索": "有线索", "缺乏欺骗线索": "无线索", "无欺骗线索": "无线索",
           "证据不足": "信息不足", "无法判断": "不确定"}


def canon(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack-out", required=True)
    ap.add_argument("--kind", required=True, choices=["blind", "sanity-retrial-v2", "sanity-dev"])
    ap.add_argument("--sids", default=None, help="comma list restricting the pack (for re-trials)")
    args = ap.parse_args()

    qt = load_questions(os.path.join(HERE, "question-templates.json"))
    assign = load_split_assignment(HERE)
    spec_sha = hashlib.sha256(open(os.path.join(HERE, "LABEL_SPEC.md"), "rb").read()).hexdigest()

    if args.kind == "blind":
        rows = rows_for(HERE, "dev") + rows_for(HERE, "calibration") + rows_for(HERE, "final")
        rows = sorted({r["sid"]: r for r in rows}.values(), key=lambda r: r["sid"])
        prefix = "E1R3-BLIND"
    else:
        rows = rows_for(HERE, "dev")
        prefix = "E1R3-SANITY"
    if args.sids:
        want = set(args.sids.split(","))
        rows = [r for r in rows if r["sid"] in want]
    if not rows:
        print("no rows selected")
        return 1

    d = os.path.join(args.pack_out, args.kind)
    os.makedirs(d, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
    existing = [p for p in os.listdir(d) if p.startswith("review-inputs.")]
    suffix = f".{stamp}" if existing else ""

    ip = os.path.join(d, f"review-inputs{suffix}.jsonl")
    sp = os.path.join(d, f"answer-sheet{suffix}.jsonl")
    idmap, seq = {}, 0
    with open(ip, "w", encoding="utf-8", newline="\n") as fi, open(sp, "w", encoding="utf-8", newline="\n") as fs:
        for r in rows:
            seq += 1
            token = f"{prefix}-{seq:04d}"
            idmap[token] = r["sid"]
            body, _ = build_body(r)
            fi.write(canon({"token": token, "model_visible_text": body,
                            "answer_slots": SIGNALS,
                            "allowed_labels": {s: qt["signals"][s]["canonical_order"] for s in SIGNALS}}) + "\n")
            fs.write(canon({"token": token,
                            **{s: {"label": "", "basis": ""} for s in SIGNALS},
                            "spec_question": ""}) + "\n")

    spec_src = os.path.join(HERE, "LABEL_SPEC.md")
    open(os.path.join(d, f"LABEL_SPEC{suffix}.md"), "w", encoding="utf-8", newline="\n").write(
        open(spec_src, encoding="utf-8").read())
    readme = f"""# 盲审说明（复核者唯一需要先读的文件）

规范版本：LABEL_SPEC sha256 `{spec_sha}`（本次包与该哈希绑定）

1. `review-inputs.jsonl` 每行：`token` 匿名编号、`model_visible_text` 待判定全文、`allowed_labels` 每个信号**只接受列出的枚举值**。
2. 在 `answer-sheet.jsonl` 对应行填写每个信号：`label`（枚举值之一）与 `basis`（据以判定的原文片段或规则号，如 `R-8.3`）。规范要求的证据栏必须填，不能只给标签。
3. 只依据可见文本判定。不要参考项目仓库、报告、模型输出或另一位复核者的结果；条件阈值不明、或没有可比对事实时，按规范给 `信息不足` / `不确定`，不要自行补阈值。
4. 若使用自然语言写法，请照下表登记（判定语义不变，统计一律折成枚举值）：
{chr(10).join(f"   - `{k}` → `{v}`" for k, v in sorted(ALIASES.items()))}
5. `spec_question` 写这条里让你无法按现有规范判定的问题。逐条独立判定，不要为类别平衡调整。
"""
    open(os.path.join(d, f"README{suffix}.md"), "w", encoding="utf-8", newline="\n").write(readme)

    mapping_p = os.path.join(args.pack_out, f"id-map-{args.kind}{suffix}.json")
    json.dump({"created": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
               "kind": args.kind, "label_spec_sha256": spec_sha, "map": idmap},
              open(mapping_p, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)

    manifest = {"kind": args.kind, "n_items": len(rows), "label_spec_sha256": spec_sha,
                "review_inputs": os.path.basename(ip),
                "review_inputs_sha256": hashlib.sha256(open(ip, "rb").read()).hexdigest(),
                "answer_sheet_sha256": hashlib.sha256(open(sp, "rb").read()).hexdigest(),
                "id_map": os.path.basename(mapping_p),
                "alias_table": ALIASES,
                "rebuilt_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                "note": ("re-trial set: the same inputs under a revised spec must be treated as a NEW "
                         "reliability measurement; do not reuse the previous agreement/kappa for this version")}
    json.dump(manifest, open(os.path.join(d, f"pack-manifest{suffix}.json"), "w", encoding="utf-8", newline="\n"),
              ensure_ascii=False, indent=1)
    print(json.dumps(manifest, ensure_ascii=False, indent=1))
    print("pack dir:", d.replace("\\", "/"), " map outside repo:", mapping_p.replace("\\", "/"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
