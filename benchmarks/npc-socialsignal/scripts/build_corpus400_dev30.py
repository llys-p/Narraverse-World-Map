#!/usr/bin/env python3
"""E1 corpus400 first dev batch builder (contract: tasks/E1-CORPUS400-TASK.md).

Delivers plan `corpus400-dev30-v1`: 30 dev items over 10 NEW families (M01-M10,
3 items each), including six real long-context items covering the four
truncation paths. Item content lives in three sibling modules:
  corpus400_items.py         (M01-M04, sids E1-C400-001..012)
  corpus400_items_m05m07.py  (M05-M07, sids E1-C400-013..021)
  corpus400_items_m08m10.py  (M08-M10, sids E1-C400-022..030)

Artifacts:
  samples/corpus400-dev30-v1.jsonl                 the 30 dev rows
  samples/corpus400-dev30-manifest.json            plan/batch/spec/tokenizer/hashes + per-condition records + coverage
  results/corpus400-dev30-consumer-verification.json  four-path proof + formal-entry refusal fixture
  (outside repo) D:/ModelBench/laya/review-return/corpus400-dev30-v1/
      anon/…          reviewer-facing anonymous pack
      control-only/…  token<->sid mapping + author answers (custody: control)

The versioned corpus plan lives at corpus400-plan-v1.json (registered first).

  python scripts/build_corpus400_dev30.py --base D:/ModelBench/laya [--report] [--no-anon]
"""
import argparse
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "scripts"))

from inputs import assemble_with_budget, build_body  # noqa: E402
from corpus400_items import M01_items, M02_items, M03_items, M04_items  # noqa: E402
from corpus400_items_m05m07 import M05_items, M06_items, M07_items  # noqa: E402
from corpus400_items_m08m10 import M08_items, M09_items, M10_items  # noqa: E402

SIGNALS = {
    "social_act": ["威胁", "示好", "求助", "合作", "中性", "不确定"],
    "trust_shift": ["上升", "不变", "下降", "不确定"],
    "fear_shift": ["上升", "不变", "下降", "不确定"],
    "deception": ["有线索", "无线索", "信息不足"],
    "boundary_violation": ["已越过", "未越过", "信息不足"],
}
REQUIRED = ["sid", "family", "rel", "persona", "boundary", "history", "turn"]
ANSWER_KEYS = ["labels", "basis"]
ALLOWED_EXTRA = ["tags", "len", "notes", "extra_history", "decisive_evidence"]
PLAN_ID = "corpus400-dev30-v1"
LONG_CATS = ["cat0_within_budget", "cat1_irrelevant_only_trimmed",
             "cat2_decisive_evidence_lost", "cat3_core_over_budget_refused"]
SPEC_EXPECTED_SHA = "bb7058b4df6b1eae14564b241ff07c9105df3ee93385992af58e8d7a01a05268"
REVIEW_RETURN = "D:/ModelBench/laya/review-return/corpus400-dev30-v1"

PLANNED_COVERAGE = {
    "social_act": {"威胁": 2, "示好": 3, "求助": 7, "合作": 9, "中性": 7, "不确定": 2},
    "trust_shift": {"上升": 5, "不变": 11, "下降": 4, "不确定": 10},
    "fear_shift": {"上升": 5, "不变": 18, "下降": 3, "不确定": 4},
    "deception": {"有线索": 3, "无线索": 5, "信息不足": 22},
    "boundary_violation": {"已越过": 8, "未越过": 18, "信息不足": 4},
    "contrast_cases": [
        "request-crosses-boundary (R-8.4) vs accomplished crossing",
        "observable deadline passed (下降) vs ambiguous deadline (信息不足) vs future promise (不确定)",
        "collision-capable claim (有线索) vs matching comparable fact (无线索) vs unverifiable (信息不足)",
        "secrecy request is not a violation (R-8.6)",
        "never-declared boundary maps to 信息不足",
        "irony is not a deception clue",
        "direction-asking grade one: information question (R-8.7)",
        "visible danger withdrawal (fear 下降)",
        "current fulfillment only, old fulfillments never re-counted (R-8.5)",
    ],
}


def all_items():
    items = []
    for fn in (M01_items, M02_items, M03_items, M04_items, M05_items, M06_items,
               M07_items, M08_items, M09_items, M10_items):
        items += fn()
    items.sort(key=lambda r: r["sid"])
    assert len(items) == 30, f"expected 30 items, got {len(items)}"
    return items


def norm_text(t):
    return re.sub(r"[\s，。！？、；：“”\"'（）()\-—…]", "", t or "").lower()


def validate_schema(items):
    errs = []
    seen_sids, seen_turns = set(), {}
    for r in items:
        where = r.get("sid", "?")
        for k in REQUIRED:
            if k not in r:
                errs.append(f"{where}: missing field {k}")
        for k in ("sid", "family", "rel", "persona", "turn"):
            if not r.get(k):
                errs.append(f"{where}: empty required field {k}")
        if not isinstance(r.get("history"), list):
            errs.append(f"{where}: history is not a list")
        # boundary may be "" (never-declared-by-design) but must exist
        if "boundary" not in r:
            errs.append(f"{where}: missing field boundary")
        for k in r:
            if k not in REQUIRED + ANSWER_KEYS + ALLOWED_EXTRA:
                errs.append(f"{where}: unknown field {k}")
        if set(r.get("labels", {})) != set(SIGNALS):
            errs.append(f"{where}: label set mismatch")
        for sig, allowed in SIGNALS.items():
            if r.get("labels", {}).get(sig) not in allowed:
                errs.append(f"{where}: {sig}={r['labels'].get(sig)!r} illegal")
        for sig in SIGNALS:
            if not (r.get("basis") or {}).get(sig):
                errs.append(f"{where}: {sig} has no basis note")
        if set((r.get("decisive_evidence") or {})) != set(SIGNALS):
            errs.append(f"{where}: decisive_evidence must cover all five signals")
        if r["sid"] in seen_sids:
            errs.append(f"{where}: duplicate sid")
        seen_sids.add(r["sid"])
        t = norm_text(r["turn"])
        if t in seen_turns:
            errs.append(f"{where}: turn duplicates {seen_turns[t]}")
        seen_turns[t] = r["sid"]
        visible = "\n".join([r["persona"], r.get("boundary") or ""] + list(r.get("history") or [])
                            + list(r.get("extra_history") or []) + [r["turn"]])
        for sig, refs in (r.get("decisive_evidence") or {}).items():
            if sig not in SIGNALS:
                errs.append(f"{where}: unknown decisive signal {sig}")
                continue
            if not refs:
                errs.append(f"{where}: {sig} has no decisive evidence reference")
            for ref in refs:
                if ref and ref not in visible:
                    errs.append(f"{where}: {sig} decisive ref not in visible text: {ref[:20]}")
    return errs


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha256_file(p):
    with open(p, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def deterministic_tokens(sids):
    """Reviewer tokens carry no ordering information: rotate the sorted sids."""
    rotated = sids[7:] + sids[:7]
    return {sid: f"C400-{i + 1:03d}" for i, sid in enumerate(rotated)}


def write_anon_pack(items, spec_path):
    """Repo-external anonymous pack. Reviewer files carry visible text only;
    the token<->sid mapping and author answers go to control-only/."""
    os.makedirs(REVIEW_RETURN, exist_ok=True)
    anon = os.path.join(REVIEW_RETURN, "anon")
    ctrl = os.path.join(REVIEW_RETURN, "control-only")
    os.makedirs(anon, exist_ok=True)
    os.makedirs(ctrl, exist_ok=True)

    sids = sorted(r["sid"] for r in items)
    tokens = deterministic_tokens(sids)
    by_sid = {r["sid"]: r for r in items}

    lines = []
    for sid in sids:
        r = by_sid[sid]
        lines.append(json.dumps({
            "token": tokens[sid],
            "persona": r["persona"],
            "boundary": r["boundary"],
            "history": r["history"],
            "extra_history": r.get("extra_history") or [],
            "turn": r["turn"],
        }, ensure_ascii=False, sort_keys=True))
    with open(os.path.join(anon, "review-inputs.jsonl"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write("".join(l + "\n" for l in lines))

    with open(os.path.join(anon, "LABEL_SPEC.md"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(open(spec_path, encoding="utf-8").read())

    sheet = []
    for sid in sids:
        entry = {"token": tokens[sid]}
        for sig in SIGNALS:
            entry[sig] = {"label": "", "basis": "", "evidence_quote": ""}
        sheet.append(json.dumps(entry, ensure_ascii=False))
    with open(os.path.join(anon, "answer-sheet-blank.jsonl"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write("".join(l + "\n" for l in sheet))

    checklist = """# 复核清单（corpus400-dev30-v1 匿名包）

包内只含可见文本、现行规范、空白五信号答案表。不含任何 ID 含义、家族、切分、
标签、作者意图或 decisive 字段。

复核者须知：
1. 你可能与作者使用同一模型；如属实请在 disclosure 中声明（同模型/资料接触限制）。
2. 只按 model_visible_text（persona/已知边界/既往/此刻 的组合文本）与现行规范逐条独立判定。
3. 每条每信号填 label、basis（引用规范条号）、evidence_quote（据以判定的原文摘录）。
4. 不要猜测作者意图；依据必须是文本本身。
5. 回收后由中控按逐信号支持量/一致率/κ/分歧统计；作者不参与裁定。
"""
    with open(os.path.join(anon, "CHECKLIST.md"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(checklist)

    mapping = {
        "schema": "corpus400-dev30-v1-author-mapping",
        "plan_id": PLAN_ID,
        "custody": "for the controller only; the author must not act as blind reviewer or adjudicator",
        "mapping": [{"token": tokens[r["sid"]], "sid": r["sid"], "family": r["family"],
                     "author_labels": r["labels"]} for r in sorted(items, key=lambda r: r["sid"])],
    }
    with open(os.path.join(ctrl, "author-mapping.json"), "w", encoding="utf-8", newline="\n") as fh:
        json.dump(mapping, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")

    with open(os.path.join(ctrl, "README-custody.md"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write("# corpus400-dev30-v1 复核材料保管说明\n\n"
                 "- anon/ 是交给复核者的匿名包（可见文本+规范+空白答案表+清单），无任何 ID/家族/标签信息。\n"
                 "- control-only/author-mapping.json 是 token<->sid 家族与作者金标映射，只由中控保管；\n"
                 "  作者不担任盲审者或裁定人；分歧由作者外裁定人处理。\n"
                 "- 两份独立上下文复核由中控安排；独立复核尚未完成前，本批不进入任何 gate。\n")
    return tokens


def build(base, model_name, write=True, report_only=False, no_anon=False):
    items = all_items()
    errs = validate_schema(items)
    if errs:
        for e in errs:
            print("SCHEMA-ERROR", e)
        return 1

    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    from transformers import AutoTokenizer
    tok_dir = os.path.join(base, "runtime", model_name, "tokenizer")
    tok = AutoTokenizer.from_pretrained(tok_dir, local_files_only=True)

    def counter(text):
        return len(tok(text, add_special_tokens=False)["input_ids"])

    budget = 768  # run_bench_v3: state_budget = max_len(1024) - head_max_len(256)

    if report_only:
        for row in items:
            cat = next((t for t in row["tags"] if t.startswith("cat")), "short")
            rep = assemble_with_budget(counter, row, budget, "social_act")[1]
            print(row["sid"], cat, "before=", rep["tokens_before_truncation"],
                  "after=", rep["tokens_after"], "min=", rep.get("minimum_possible_tokens"),
                  "removed=", len(rep["removed_lines"]))
        return 0

    per_item, outcomes = [], {}
    for row in items:
        cat = next((t for t in row["tags"] if t.startswith("cat")), None)
        signals_report = {}
        for signal in SIGNALS:
            body, rep = assemble_with_budget(counter, row, budget, signal)
            signals_report[signal] = rep
            if body is not None:
                assert "decisive_evidence" not in body and "basis" not in body
        for signal in SIGNALS:
            rep = signals_report[signal]
            body = assemble_with_budget(counter, row, budget, signal)[0]
            if body is None:
                continue
            for ref in row["decisive_evidence"].get(signal, []):
                if rep.get("lost_decisive_evidence") and ref in rep["lost_decisive_evidence"]:
                    continue
                if ref not in body:
                    errs.append(f"{row['sid']}: {signal} decisive ref missing from final body: {ref[:20]}")
        if errs:
            break

        primary_body, _primary_info = build_body(row)
        primary_tokens = counter(primary_body)

        if cat:
            rep0 = signals_report["social_act"]
            if cat == "cat0_within_budget":
                ok = (rep0.get("refused") is None and rep0["tokens_before_truncation"] <= budget
                      and not rep0["removed_lines"] and not rep0["requires_relabel"]
                      and rep0["boundary_kept"])
            elif cat == "cat1_irrelevant_only_trimmed":
                ok = (rep0.get("refused") is None and rep0["tokens_before_truncation"] > budget
                      and rep0["tokens_after"] <= budget and rep0["removed_lines"]
                      and rep0["boundary_kept"]
                      and all(not rep["requires_relabel"] for rep in signals_report.values()))
            elif cat == "cat2_decisive_evidence_lost":
                ok = (rep0.get("refused") is None and rep0["tokens_before_truncation"] > budget
                      and rep0["tokens_after"] <= budget and rep0["boundary_kept"]
                      and any(rep["requires_relabel"] for rep in signals_report.values())
                      and not all(rep["requires_relabel"] for rep in signals_report.values()))
            else:  # cat3
                ok = all(rep.get("refused") == "core_over_budget"
                         and rep.get("minimum_possible_tokens", 0) > budget
                         for rep in signals_report.values())
            outcomes[row["sid"]] = {"category": cat, "outcome_matches_design": ok}
            if not ok:
                errs.append(f"{row['sid']}: category {cat} outcome mismatch: "
                            f"before={rep0['tokens_before_truncation']} after={rep0['tokens_after']} "
                            f"refused={rep0.get('refused')} min={rep0.get('minimum_possible_tokens')} "
                            f"relabel={[s for s, r in signals_report.items() if r['requires_relabel']]}")
        per_item.append({
            "sid": row["sid"], "family": row["family"],
            "category": cat or "short",
            "primary_tokens": primary_tokens,
            "long_tokens_before": signals_report["social_act"]["tokens_before_truncation"],
            "long_tokens_after": signals_report["social_act"]["tokens_after"],
            "minimum_possible_tokens": signals_report["social_act"].get("minimum_possible_tokens"),
            "removed_lines": signals_report["social_act"]["removed_lines"],
            "per_signal": {s: {"decisive_refs": row["decisive_evidence"].get(s, []),
                               "lost_decisive_evidence": rep["lost_decisive_evidence"],
                               "requires_relabel": rep["requires_relabel"],
                               "refused": rep.get("refused")}
                           for s, rep in signals_report.items()},
        })
    if errs:
        for e in errs:
            print("CHECK-ERROR", e)
        return 1

    # ---------------- artifacts ----------------
    batch_path = os.path.join(HERE, "samples", "corpus400-dev30-v1.jsonl")
    manifest_path = os.path.join(HERE, "samples", "corpus400-dev30-manifest.json")
    verify_path = os.path.join(HERE, "results", "corpus400-dev30-consumer-verification.json")
    spec_path = os.path.join(HERE, "LABEL_SPEC.md")
    plan_path = os.path.join(HERE, "corpus400-plan-v1.json")

    spec_sha = sha256_file(spec_path)
    if spec_sha != SPEC_EXPECTED_SHA:
        print(f"SPEC-ERROR: LABEL_SPEC sha {spec_sha} != expected {SPEC_EXPECTED_SHA}")
        return 1

    batch_blob = "".join(json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in items)
    if write:
        with open(batch_path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(batch_blob)

    actual = {sig: {} for sig in SIGNALS}
    for r in items:
        for sig, v in r["labels"].items():
            actual[sig][v] = actual[sig].get(v, 0) + 1
    for sig in actual:
        for opt in SIGNALS[sig]:
            actual[sig].setdefault(opt, 0)

    tokens_map = None if no_anon else write_anon_pack(items, spec_path)

    manifest = {
        "schema": "e1-corpus400-dev30-manifest-v1",
        "plan_id": PLAN_ID,
        "corpus_plan": {"file": "corpus400-plan-v1.json", "sha256": sha256_file(plan_path),
                        "totals": {"dev": 150, "calibration": 90, "final": 160},
                        "note": "family-exclusive split policy; M01-M10 authored here, other slots pending"},
        "batch_file": {"path": "samples/corpus400-dev30-v1.jsonl",
                       "sha256": sha256_bytes(batch_blob.encode("utf-8")), "items": len(items)},
        "spec": {"file": "LABEL_SPEC.md", "sha256": spec_sha,
                 "note": "current spec; matches the hash registered in the task book and long-dev24-v2 acceptance"},
        "tokenizer": {"model": model_name, "path": os.path.relpath(tok_dir, base).replace("\\", "/"),
                      "sha256_tokenizer_json": sha256_file(os.path.join(tok_dir, "tokenizer.json")),
                      "note": "offline checkpoint tokenizer; real token counts, no character estimates"},
        "budgets": {"max_len": 1024, "head_max_len": 256, "state_budget": 768,
                    "source": "run_bench_v3.py defaults from question-templates.json hard_constraints"},
        "history_semantics": {
            "combined_order": "history (older block) then extra_history (more recent block); front = oldest",
            "deletion": "inputs.assemble_with_budget pops from the FRONT (oldest); boundary only marked "
                        "outside_window after history is exhausted; undeletable core overflow is refused",
        },
        "plan_consistency": {
            "planned_ids": [r["sid"] for r in items],
            "signals": list(SIGNALS),
            "note": "primary and long plan the same 30 ids x 5 signals; inputs.build_body (primary) renders "
                    "only the base history field while long renders history+extra_history under the state "
                    "budget — existing consumer behaviour, unchanged by this batch; same id does NOT mean "
                    "identical primary/long gold semantics for truncated items",
        },
        "coverage": {"planned": PLANNED_COVERAGE, "actual_authored": actual,
                     "gaps_note": "actual counts below plan for any class are reported, never manufactured; "
                                  "cat3 (refused) and cat2 relabel rows can never contribute to formal scoring",
                     "families": sorted({r["family"] for r in items})},
        "old_corpus_integrity": {
            "files": ["long-dev24.jsonl", "long-dev24-v2.jsonl", "scenarios-final-blind.jsonl"],
            "sha256": {name: sha256_file(os.path.join(HERE, "samples", name))
                       for name in ("long-dev24.jsonl", "long-dev24-v2.jsonl", "scenarios-final-blind.jsonl")
                       if os.path.exists(os.path.join(HERE, "samples", name))},
            "note": "old 125, exposed final 62 and long-dev v1/v2 stay untouched; none of them serve as new corpus",
        },
        "anon_pack": {"path": REVIEW_RETURN, "tokens": "C400-001..030 (deterministic rotation, no ordering info)",
                      "note": "reviewer files carry visible text only; mapping/author answers under control-only/"},
        "token_records": per_item,
    }
    if write:
        with open(manifest_path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(manifest, fh, ensure_ascii=False, indent=1, sort_keys=True)
            fh.write("\n")

    # ---------------- consumer verification ----------------
    cat0 = next(r for r in items if r["sid"] == "E1-C400-016")
    cat1 = next(r for r in items if r["sid"] == "E1-C400-025")
    cat2 = next(r for r in items if r["sid"] == "E1-C400-013")
    cat3 = next(r for r in items if r["sid"] == "E1-C400-019")
    b0, r0 = assemble_with_budget(counter, cat0, budget, "trust_shift")
    b1, r1 = assemble_with_budget(counter, cat1, budget, "trust_shift")
    b2, r2 = assemble_with_budget(counter, cat2, budget, "trust_shift")
    b3, r3 = assemble_with_budget(counter, cat3, budget, "social_act")

    import score as SCORE
    spec = {"_name": "trust_shift", "canonical_order": ["上升", "不变", "下降", "不确定"], "options": {}}
    gold_map = {"E1-C400-013": {"trust_shift": cat2["labels"]["trust_shift"]},
                "E1-C400-016": {"trust_shift": cat0["labels"]["trust_shift"]}}
    preds = {"E1-C400-016": {"trust_shift": {"sid": "E1-C400-016", "predicted": cat0["labels"]["trust_shift"],
                                             "probs": None, "input_report": {"requires_relabel": False},
                                             "predict_error": None}},
             "E1-C400-013": {"trust_shift": {"sid": "E1-C400-013", "predicted": cat2["labels"]["trust_shift"],
                                             "probs": None, "input_report": {"requires_relabel": True,
                                                                             "lost_decisive_evidence":
                                                                                 r2["lost_decisive_evidence"]},
                                             "predict_error": None}}}
    entry, _ = SCORE.score_signal(spec, [{"sid": "E1-C400-013"}, {"sid": "E1-C400-016"}], gold_map, preds, [])

    verification = {
        "schema": "e1-corpus400-dev30-consumer-verification-v1",
        "plan_id": PLAN_ID,
        "tokenizer": {"model": model_name, "path": tok_dir},
        "budget": {"state_budget": budget},
        "four_paths": {
            "path1_within_budget_keeps_full_text": {
                "sid": "E1-C400-016", "tokens_before": r0["tokens_before_truncation"],
                "tokens_after": r0["tokens_after"], "removed": len(r0["removed_lines"]),
                "requires_relabel": r0["requires_relabel"], "body_produced": b0 is not None},
            "path2_irrelevant_history_trimmed_without_evidence_loss": {
                "sid": "E1-C400-025", "tokens_before": r1["tokens_before_truncation"],
                "tokens_after": r1["tokens_after"], "removed": len(r1["removed_lines"]),
                "lost_decisive_evidence": r1["lost_decisive_evidence"],
                "requires_relabel": r1["requires_relabel"]},
            "path3_evidence_loss_blocks_formal_scoring": {
                "sid": "E1-C400-013", "tokens_before": r2["tokens_before_truncation"],
                "tokens_after": r2["tokens_after"],
                "lost_decisive_evidence": r2["lost_decisive_evidence"],
                "requires_relabel": r2["requires_relabel"],
                "scorer_result": {"planned_items": entry["planned_items"],
                                  "n_excluded_requires_relabel": entry["n_excluded_requires_relabel"],
                                  "accuracy_over_planned": entry["accuracy_over_planned"],
                                  "excluded_value": "__EXCLUDED_RELABEL__"}},
            "path4_core_over_budget_refused": {
                "sid": "E1-C400-019", "refused": r3.get("refused"),
                "minimum_possible_tokens": r3.get("minimum_possible_tokens"),
                "body_is_none": b3 is None},
        },
        "category_outcomes": outcomes,
        "coverage": {"planned": PLANNED_COVERAGE, "actual_authored": actual,
                     "families": len({r["family"] for r in items}), "items": len(items)},
        "unexecuted": {
            "model_inference": "none; token counting only, per the task book",
            "independent_review": "two independent non-author reviews + non-author adjudication are arranged by "
                                  "control; not started in this delivery",
            "consumer_entry": "no corpus400 runner/scorer/stability entry exists yet; not claimed or built here",
            "calibration_final": "no calibration/final generation, no freeze gate",
        },
    }
    if write:
        os.makedirs(os.path.dirname(verify_path), exist_ok=True)
        with open(verify_path, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(verification, fh, ensure_ascii=False, indent=1, sort_keys=True)
            fh.write("\n")

    print(json.dumps({"items": len(items), "families": len({r["family"] for r in items}),
                      "coverage": actual, "plan_id": PLAN_ID,
                      "anon_tokens": bool(tokens_map)}, ensure_ascii=False))
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="D:/ModelBench/laya")
    ap.add_argument("--model", default="A")
    ap.add_argument("--no-write", action="store_true")
    ap.add_argument("--no-anon", action="store_true")
    ap.add_argument("--report", action="store_true", help="only print per-item token measurements")
    args = ap.parse_args()
    if args.report:
        return build(args.base, args.model, write=False, report_only=True)
    return build(args.base, args.model, write=not args.no_write, no_anon=args.no_anon)


if __name__ == "__main__":
    sys.exit(main())
