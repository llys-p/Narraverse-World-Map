"""Versioned label corrections and six replacement evidence-loss scenarios.

v1 is an immutable input. Only the local tokenizer is loaded; no inference.
Labels remain provisional development annotations, not independently frozen gold.
"""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path

from inputs import assemble_with_budget, render_body
from build_long_dev24 import CATEGORIES, SIGNALS, validate_schema

ROOT = Path(__file__).resolve().parent.parent
PLAN = "long-dev24-v2"
V1_SHA = "d96c67ee8490a416eda3f5f7d5eee31b3655142876d5e3072ffa4c59d8ea4c8b"

# Corrections adjudicated against R8.1/R8.2/R8.4/R8.5. The six cat2 rows below
# replace their entire transaction; corrections here only apply to other rows.
CORRECTIONS = {
    "002": {"deception": ("无线索", "承认两次船钱仍欠，与可见事实一致；未来付款保证不作为已兑现。"),
            "boundary_violation": ("已越过", "已知不欠账，仍要求这趟也延后结算，属于请求越界。")},
    "009": {"trust_shift": ("不变", "前日归还、昨日已验不是本次新增履约，不重复记信任上升。")},
    "011": {"deception": ("信息不足", "风将起是未给当前气象证据的预测，旧帮忙不能核实预测。")},
    "012": {"trust_shift": ("下降", "约今日晌午归还、当前天擦黑仍未付且明确延至明日，是本次可见延期。"),
            "deception": ("无线索", "承认面钱未付与可见欠账一致，未声称过去已经付款。")},
    "013": {"trust_shift": ("不确定", "柴钱方向及本次砖钱支付不明，不能将旧送柴再次记为当前履约。"),
            "deception": ("信息不足", "两清涉及未明确的结算事实，当前点数不能证明钱款已清。")},
    "014": {"trust_shift": ("不确定", "约今日付款、当前今早，原截止时刻不明；改期请求不能猜成已到期违约。")},
    "024": {"boundary_violation": ("信息不足", "生前属鸡与纸鹤用途、今晚是否已天黑不明，不能推定未越过。")},
}

# Expected quantity appears ONLY in the oldest line. The present transaction
# states observed quantity, never the expected quantity or whether it fulfilled
# the agreement. No NPC breach is attributed to the player.
TRANSACTIONS = {
    "003": ("陈九", "修船缆绳", 42, 42, "根", "上升"),
    "005": ("白老夹", "柜上包货油纸", 18, 12, "张", "下降"),
    "007": ("程守拙", "登记用空白账页", 48, 48, "页", "上升"),
    "015": ("郑一窑", "晾坯木托盘", 12, 9, "只", "下降"),
    "017": ("顾先生", "习字用素纸", 30, 30, "张", "上升"),
    "019": ("老奚官", "前棚青骡草料", 7, 5, "捆", "下降"),
}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def revised_rows():
    source = ROOT / "samples/long-dev24.jsonl"
    if sha(source) != V1_SHA:
        raise ValueError("v1 source hash changed")
    rows = [json.loads(l) for l in source.read_text(encoding="utf-8").splitlines() if l.strip()]
    for row in rows:
        suffix = row["sid"][-3:]
        row["tags"] = [PLAN if t == "long-dev24-v1" else t for t in row["tags"]]
        for signal, (label, basis) in CORRECTIONS.get(suffix, {}).items():
            row["labels"][signal], row["basis"][signal] = label, basis
        if suffix not in TRANSACTIONS:
            continue
        npc, goods, expected, actual, unit, trust = TRANSACTIONS[suffix]
        old = f"双方此前当面写下这份待结供货约：玩家承诺本次交{goods}{expected}{unit}，这次到场点收时全部结清，{npc}保留了原字据。"
        present = f"本次玩家到场，{npc}刚刚当面逐一验收{goods}，实际交到手的合计{actual}{unit}，除此没有交来别的。"
        # Keep the original varied background, remove its obsolete transaction
        # and use a new present transaction. All background predates this turn.
        row["history"][0] = old
        if suffix == "003":
            row["history"].append("本月渡口修了候船的凉棚，陈九把两根旧篙靠在新棚柱边，棚外芦苇还没有割完。")
        elif suffix == "005":
            row["history"].append("本月柜上换了遮窗的青布帘，白老夹仍用旧戥子验银，伙计每日收铺前擦净柜面。")
        row["extra_history"] = [present]
        row["turn"] = f"{npc}，这次交来的{goods}你已点过，我就交这些，没有别的了。"
        row["labels"] = dict(social_act="合作", trust_shift=trust, fear_shift="不变",
                             deception="无线索", boundary_violation="未越过")
        row["basis"] = {
            "social_act": "供货点收的协作交付，无威胁或越界请求。",
            "trust_shift": f"R8.5：玩家本次已可见交{actual}{unit}，原字据要求{expected}{unit}，"
                           + ("当场足额履约。" if trust == "上升" else "当场明确只交不足数量，拒绝补足原约。"),
            "fear_shift": "点收物件且没有危险行为或威胁。",
            "deception": "只说明已交物件，与NPC本次实际点收一致，无对撞陈述。",
            "boundary_violation": "所交为普通物件，不涉及正文列出的禁止活动。",
        }
        row["decisive_evidence"] = {
            "social_act": [row["turn"]], "trust_shift": [old, present],
            "fear_shift": [row["turn"]], "deception": [present, row["turn"]],
            "boundary_violation": [row["boundary"], present],
        }
        row["notes"] = "v2 replacement transaction; quantity obligation only in oldest history; labels provisional"
    errors = validate_schema(rows)
    if errors:
        raise ValueError(errors)
    return rows


def build(base):
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    from transformers import AutoTokenizer
    tokdir = Path(base) / "runtime/A/tokenizer"
    tok = AutoTokenizer.from_pretrained(tokdir, local_files_only=True)
    count = lambda text: len(tok(text, add_special_tokens=False)["input_ids"])
    rows = revised_rows()
    records = []
    for row in rows:
        category = next(t for t in row["tags"] if t in CATEGORIES)
        reports = {}
        visible = render_body(row["persona"], row["boundary"], row["history"] + row["extra_history"], row["turn"])
        for signal in SIGNALS:
            assert all(ref in visible for ref in row["decisive_evidence"][signal])
            body, rep = assemble_with_budget(count, row, 768, signal)
            reports[signal] = rep
            assert body is None or count(body) <= 768
            if category == CATEGORIES[0]:
                assert body is not None and not rep["removed_lines"] and not rep["requires_relabel"]
            elif category == CATEGORIES[1]:
                assert body is not None and rep["removed_lines"] and not rep["requires_relabel"]
            elif category == CATEGORIES[2]:
                assert body is not None and rep["removed_lines"] and rep["boundary_kept"], (row["sid"], rep)
                assert rep["requires_relabel"] == (signal == "trust_shift"), (row["sid"], rep)
            else:
                assert body is None and rep["refused"] == "core_over_budget"
        records.append({"sid": row["sid"], "category": category, "per_signal": reports})
    sample = ROOT / "samples/long-dev24-v2.jsonl"
    sample.write_text("".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows), encoding="utf-8", newline="\n")
    report = {
        "schema": "long-dev24-v2-input-verification", "plan_id": PLAN, "corpus_version": PLAN,
        "batch_file": "samples/long-dev24-v2.jsonl",
        "planned_ids": {condition: [r["sid"] for r in rows] for condition in ("primary", "long")},
        "signals": list(SIGNALS),
        "condition_policy": "primary omits extra_history; long combines history+extra_history and trims oldest. Same IDs do not establish gold comparability; both are diagnostic only until condition-specific review.",
        "source_v1_sha256": V1_SHA, "sample_sha256": sha(sample),
        "spec_sha256": sha(ROOT / "LABEL_SPEC.md"), "tokenizer_sha256": sha(tokdir / "tokenizer.json"),
        "budget": 768, "category_counts": dict(Counter(r["category"] for r in records)),
        "families": len({r["family"] for r in rows}), "model_inference": False,
        "label_status": "provisional development annotations; no frozen gold or full five-signal acceptance",
        "records": records,
    }
    path = ROOT / "results/long-dev24-v2-input-verification.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({k: report[k] for k in ("plan_id", "sample_sha256", "category_counts", "families")}, ensure_ascii=False))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="D:/ModelBench/laya")
    build(ap.parse_args().base)
