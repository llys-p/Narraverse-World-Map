#!/usr/bin/env python3
"""E1 dev30 bounded screening diagnostic (contract: tasks/E1-DEV30-SCREENING-TASK.md).

One locked, bounded diagnostic round over the corpus400-dev30-v1 batch:

  1. BEFORE any model call a diagnosis lock is written: input/spec/sidecar hashes,
     the valid reference set per signal (adjudication `reference_unresolved` rows
     excluded from scoring but never treated as model errors), the planned
     denominators, the deployable constant baselines, and the screening gates.
  2. Candidates A and B run once each, five signals, canonical option order, over
     the FULL-VISIBLE rendering (persona/boundary/history+extra_history/turn — the
     same text the blind reviewers saw). No silent truncation: any state over the
     768-token budget is REFUSED and stays in the plan.
  3. Reuses the existing Worker (kill/reap/restart), the existing rendering and
     budget constants, and the existing scoring primitives. Writes its own index
     bound to corpus/input/label hashes; never reads or touches old raw/index/locks.
  4. Decision report: per candidate per signal — planned/valid/unresolved/returned/
     refused/failed, accuracy on the valid reference set vs the locked constant
     baseline (gate: +3 items), unknown-class accuracy gate (>=80% when support>=5),
     unknown-as-definite misjudgements, dangerous FP/FN, raw confidence stats,
     segmented timing. Conditional single rotated re-check for a passing candidate
     (<=150 items): flip counts and cases.

  python scripts/dev30_screening.py --base D:/ModelBench/laya --models A,B \
      --batch-size 8 --timeout-s 120 --wall-budget-min 30
"""
import argparse
import datetime
import hashlib
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(HERE, "scripts"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from inputs import authored_boundary_state, read_jsonl, render_body  # noqa: E402
import run_bench_v3 as RUNNER  # noqa: E402
import score as SCORE  # noqa: E402

ROOT = HERE
BATCH_FILE = os.path.join(ROOT, "samples", "corpus400-dev30-v1.jsonl")
SIDECAR = "D:/ModelBench/laya/review-return/corpus400-dev30-v1/control-only/adjudication-v1.jsonl"
SIDECAR_SHA = "3a6af316008ac7aecdf001b3a7c245200f82509e3d93f4f68066ffdfb4020807"
SPEC_SHA = "bb7058b4df6b1eae14564b241ff07c9105df3ee93385992af58e8d7a01a05268"
SIGNALS = ("social_act", "trust_shift", "fear_shift", "deception", "boundary_violation")
UNKNOWN_CLASS = {"social_act": "不确定", "trust_shift": "不确定", "fear_shift": "不确定",
                 "deception": "信息不足", "boundary_violation": "信息不足"}
DANGEROUS_POSITIVE = {"deception": "有线索", "boundary_violation": "已越过"}
STATE_BUDGET = 768
HEAD_MAX = 256
MAX_LEN = 1024
LOCK_PATH = os.path.join(ROOT, "results", "dev30-screening-lock.json")


def sha256_file(p):
    with open(p, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def load_inputs():
    rows = read_jsonl(BATCH_FILE)
    assert len(rows) == 30, f"expected 30 planned items, got {len(rows)}"
    assert sha256_file(SIDECAR) == SIDECAR_SHA, "adjudication sidecar hash mismatch"
    spec_sha = sha256_file(os.path.join(ROOT, "LABEL_SPEC.md"))
    assert spec_sha == SPEC_SHA, f"LABEL_SPEC sha {spec_sha} != locked {SPEC_SHA}"
    sidecar = read_jsonl(SIDECAR)
    assert len(sidecar) == 150
    refs, unresolved = {}, {s: [] for s in SIGNALS}
    for r in sidecar:
        key = (r["sid"], r["signal"])
        if r.get("status") == "reference_unresolved" or r.get("reference_label") is None:
            unresolved[r["signal"]].append(r["sid"])
        else:
            refs[key] = r["reference_label"]
    return rows, refs, unresolved


def full_visible_body(row):
    """Exact blind-review visible text: complete history + extra_history, no cut."""
    history = list(row.get("history") or []) + list(row.get("extra_history") or [])
    return render_body(row["persona"], row.get("boundary"), history, row["turn"],
                       authored_boundary_state(row))


def constant_baseline(valid_refs):
    """Deployable constant per signal: majority reference class, locked pre-run."""
    base = {}
    for sig in SIGNALS:
        counts = {}
        for (sid, signal), label in refs_items(valid_refs):
            if signal == sig:
                counts[label] = counts.get(label, 0) + 1
        label = max(counts.items(), key=lambda kv: (kv[1], kv[0]))[0]
        base[sig] = {"constant_class": label, "support": counts[label], "counts": counts}
    return base


def refs_items(refs):
    return list(refs.items())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="D:/ModelBench/laya")
    ap.add_argument("--models", default="A,B")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--timeout-s", type=float, default=120.0)
    ap.add_argument("--wall-budget-min", type=float, default=30.0)
    ap.add_argument("--gate-delta", type=int, default=3)
    ap.add_argument("--unknown-min-acc", type=float, default=0.8)
    ap.add_argument("--unknown-support-min", type=int, default=5)
    ap.add_argument("--skip-rotated", action="store_true")
    args = ap.parse_args()

    t_start = time.perf_counter()
    qt = SCORE.load_json(os.path.join(ROOT, "question-templates.json"))
    lock_cfg = json.load(open(os.path.join(ROOT, "config.lock.json"), encoding="utf-8"))
    rows, refs, unresolved = load_inputs()
    batch_sha = sha256_file(BATCH_FILE)
    token_shas = {m: sha256_file(os.path.join(args.base, "runtime", m, "tokenizer", "tokenizer.json"))
                  for m in args.models.split(",")}

    planned_ids = [r["sid"] for r in rows]
    baselines = constant_baseline(refs)
    lock = {
        "schema": "e1-dev30-screening-lock-v1",
        "written_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "written_before_first_model_call": True,
        "batch_file": {"path": "samples/corpus400-dev30-v1.jsonl", "sha256": batch_sha},
        "spec_sha256": SPEC_SHA,
        "sidecar": {"path": SIDECAR, "sha256": SIDECAR_SHA},
        "models": {m: {"revision_sha256": lock_cfg["candidates"][m]["model_sha256"],
                       "tokenizer_json_sha256": token_shas[m], "device": args.device}
                   for m in args.models.split(",")},
        "rendering": "full-visible: render_body(persona, boundary, history+extra_history, turn); no truncation; "
                     "state over 768 tokens is refused and stays in the plan",
        "planned_ids": planned_ids,
        "valid_reference_sets": {s: sorted({sid for (sid, sg) in refs if sg == s}) for s in SIGNALS},
        "unresolved": unresolved,
        "denominators": {s: {"planned": 30,
                             "valid_reference": sum(1 for (sid, sg) in refs if sg == s),
                             "unresolved": len(unresolved[s])} for s in SIGNALS},
        "constant_baselines": baselines,
        "gates": {"beat_constant_baseline_by": args.gate_delta,
                  "unknown_class": {"min_accuracy": args.unknown_min_acc,
                                    "support_threshold": args.unknown_support_min},
                  "unexplained_worker_failures_block": True,
                  "note": "gates registered before the first model call; passing is a screening step only"},
        "run_plan": {"models": args.models.split(","), "signals": list(SIGNALS),
                     "option_order": "canonical", "batch_size": args.batch_size,
                     "timeout_s": args.timeout_s, "max_items_canonical": 300,
                     "max_items_rotated": 150, "wall_budget_min": args.wall_budget_min},
    }
    with open(LOCK_PATH, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(lock, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    print("LOCK written:", LOCK_PATH, flush=True)

    index = {"schema": "e1-dev30-screening-index-v1", "lock_sha256": sha256_file(LOCK_PATH), "runs": {}}
    records_by_run = {}
    timing = {}

    def budget_left():
        return (args.wall_budget_min * 60.0) - (time.perf_counter() - t_start)

    for model in args.models.split(","):
        cand = lock_cfg["candidates"][model]
        runtime_dir = os.path.join(args.base, "runtime", model)
        t_cold = time.perf_counter()
        w = RUNNER.Worker(sys.executable, os.path.join(HERE, "scripts", "infer_worker.py"),
                          runtime_dir, cand["model_sha256"], args.device, label=model)
        timing[f"{model}_cold_start_s"] = round(time.perf_counter() - t_cold, 2)

        conditions = [("canonical", "canonical")]
        gate_passing = None
        for cond_name, order in conditions:
            records = []
            for signal in SIGNALS:
                spec = qt["signals"][signal]
                criteria, mapping = RUNNER.ordered_criteria(spec, order)
                q = {signal: {"type": "choice", "instructions": spec["instructions"],
                              "criteria": criteria}}
                head = RUNNER._count(w, [spec["instructions"] + "".join(f"{k}{v}" for k, v in criteria.items())],
                                     args.timeout_s)[0]
                jobs, refused = [], []
                for r in rows:
                    body = full_visible_body(r)
                    n = RUNNER._count(w, [body], args.timeout_s)[0]
                    if n > STATE_BUDGET or head > HEAD_MAX:
                        refused.append({"sid": r["sid"], "reason": "REFUSED_INPUT_OVER_BUDGET",
                                        "state_tokens": n, "head_tokens": head})
                    else:
                        jobs.append((r, body, n))
                run_failed = None
                for i in range(0, len(jobs), args.batch_size):
                    if run_failed or budget_left() <= 0:
                        for r, body, n in jobs[i:]:
                            records.append({"sid": r["sid"], "signal": signal, "model": model,
                                            "condition": cond_name, "predicted": None, "probs": None,
                                            "confidence": None, "predict_error": "NOT_EXECUTED" if
                                            budget_left() <= 0 else f"NOT_EXECUTED after {run_failed}",
                                            "state_tokens": n, "head_tokens": head,
                                            "excluded_from_scoring": False})
                        continue
                    chunk = jobs[i:i + args.batch_size]
                    res, err, wall, kind = w.call(
                        {"states": [{"body": b} for _, b, _ in chunk], "questions": q,
                         "max_len": MAX_LEN, "head_max_len": HEAD_MAX}, args.timeout_s)
                    per_item = wall / max(len(chunk), 1)
                    if err:
                        if kind == "timeout":
                            run_failed = err
                        for r, body, n in chunk:
                            records.append({"sid": r["sid"], "signal": signal, "model": model,
                                            "condition": cond_name, "predicted": None, "probs": None,
                                            "confidence": None, "predict_error": err,
                                            "state_tokens": n, "head_tokens": head,
                                            "excluded_from_scoring": False})
                        continue
                    if not isinstance(res, list) or len(res) != len(chunk):
                        for r, body, n in chunk:
                            records.append({"sid": r["sid"], "signal": signal, "model": model,
                                            "condition": cond_name, "predicted": None, "probs": None,
                                            "confidence": None, "predict_error": "WORKER_SHAPE",
                                            "state_tokens": n, "head_tokens": head,
                                            "excluded_from_scoring": False})
                        continue
                    for j, (r, body, n) in enumerate(chunk):
                        one = res[j]
                        ans = ((one.get("answers") or {}).get(signal) if isinstance(one, dict) else None)
                        if not isinstance(ans, dict):
                            records.append({"sid": r["sid"], "signal": signal, "model": model,
                                            "condition": cond_name, "predicted": None, "probs": None,
                                            "confidence": None, "predict_error": "WORKER_SHAPE: no answer object",
                                            "state_tokens": n, "head_tokens": head,
                                            "excluded_from_scoring": False})
                            continue
                        records.append({"sid": r["sid"], "signal": signal, "model": model,
                                        "condition": cond_name, "predicted": ans.get("choice"),
                                        "probs": ans.get("probabilities"),
                                        "confidence": ans.get("answer_confidence", ans.get("confidence")),
                                        "predict_error": None, "state_tokens": n, "head_tokens": head,
                                        "wall_ms_per_item": round(per_item * 1000, 1),
                                        "usage": one.get("usage"), "excluded_from_scoring": False})
                for ref_rec in refused:
                    records.append(dict(ref_rec, signal=signal, model=model, condition=cond_name,
                                        predicted=None, probs=None, confidence=None,
                                        predict_error=ref_rec["reason"], excluded_from_scoring=False))
            records_by_run[(model, cond_name)] = records

            # gate evaluation on canonical only
            if cond_name == "canonical":
                gate_passing = []
                for signal in SIGNALS:
                    ev = evaluate_signal(records, refs, signal, baselines[signal], args)
                    if ev["gate_pass"]:
                        gate_passing.append(signal)
                if gate_passing and not args.skip_rotated and budget_left() > 120:
                    conditions.append(("rotated", "rotated"))

        w.shutdown()

    # ---------------- write raw + index ----------------
    os.makedirs(os.path.join(ROOT, "results", "raw"), exist_ok=True)
    for (model, cond_name), records in records_by_run.items():
        out = os.path.join(ROOT, "results", "raw", f"{model}-dev30screening-{cond_name}.jsonl")
        with open(out, "w", encoding="utf-8", newline="\n") as fh:
            for rec in records:
                fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")
        index["runs"][f"{model}|{cond_name}"] = {
            "path": os.path.relpath(out, ROOT).replace("\\", "/"),
            "sha256": sha256_file(out), "records": len(records),
            "binds": {"batch_sha256": batch_sha, "spec_sha256": SPEC_SHA,
                      "sidecar_sha256": SIDECAR_SHA, "lock_sha256": index["lock_sha256"],
                      "model_revision_sha256": lock["models"][model]["revision_sha256"]},
        }
    idx_path = os.path.join(ROOT, "results", "raw", "dev30-screening-index.json")
    with open(idx_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")

    # ---------------- decision report ----------------
    decision = {"schema": "e1-dev30-screening-decision-v1",
                "lock_sha256": index["lock_sha256"],
                "wall_clock_s": round(time.perf_counter() - t_start, 1),
                "timing": timing, "models": {}}
    for model in args.models.split(","):
        canonical = records_by_run[(model, "canonical")]
        rotated = records_by_run.get((model, "rotated"))
        entry = {"signals": {}, "gate_passing_signals": [], "rotated": None}
        for signal in SIGNALS:
            ev = evaluate_signal(canonical, refs, signal, baselines[signal], args)
            entry["signals"][signal] = ev
            if ev["gate_pass"]:
                entry["gate_passing_signals"].append(signal)
        if rotated is not None:
            flips = []
            for signal in SIGNALS:
                by_sid_c = {r["sid"]: r for r in canonical if r["signal"] == signal}
                by_sid_r = {r["sid"]: r for r in rotated if r["signal"] == signal}
                for sid in planned_ids:
                    c, rr = by_sid_c.get(sid), by_sid_r.get(sid)
                    if c and rr and c.get("predicted") != rr.get("predicted"):
                        flips.append({"signal": signal, "sid": sid,
                                      "canonical": c.get("predicted"), "rotated": rr.get("predicted"),
                                      "reference": refs.get((sid, signal))})
            entry["rotated"] = {"flip_count": len(flips), "flips": flips[:40],
                                "note": "factual collisions or unknown->definite flips still block admission"}
        decision["models"][model] = entry

    dec_path = os.path.join(ROOT, "results", "dev30-screening-decision.json")
    with open(dec_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(decision, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write("\n")
    print("DECISION written:", dec_path, flush=True)
    print(json.dumps({"gate_passing": {m: d["gate_passing_signals"] for m, d in decision["models"].items()},
                      "wall_clock_s": decision["wall_clock_s"]}, ensure_ascii=False))
    return 0


def evaluate_signal(records, refs, signal, baseline, args):
    planned = [r for r in records if r["signal"] == signal]
    by_sid = {}
    for r in planned:
        prev = by_sid.get(r["sid"])
        if prev is None or prev.get("predict_error"):
            by_sid[r["sid"]] = r
    returned = {sid: r for sid, r in by_sid.items() if not r.get("predict_error")}
    refused = [r["sid"] for r in planned if (r.get("predict_error") or "").startswith("REFUSED_")]
    failed = [r["sid"] for r in planned
              if r.get("predict_error") and not (r.get("predict_error") or "").startswith("REFUSED_")
              and r["sid"] not in refused]
    valid = {sid: refs[(sid, signal)] for (sid, sg) in refs
             if sg == signal and sid in {x["sid"] for x in planned}}
    correct = [sid for sid, label in valid.items() if sid in returned and returned[sid].get("predicted") == label]
    accuracy = round(len(correct) / len(valid), 4) if valid else None
    delta = len(correct) - baseline["support"]
    unknown = UNKNOWN_CLASS[signal]
    unknown_sids = [sid for sid, label in valid.items() if label == unknown]
    unknown_correct = [sid for sid in unknown_sids if sid in returned and returned[sid].get("predicted") == unknown]
    unknown_as_definite = [sid for sid in unknown_sids if sid in returned
                           and returned[sid].get("predicted") not in (None, unknown)]
    unknown_acc = round(len(unknown_correct) / len(unknown_sids), 4) if unknown_sids else None
    unknown_gate_ok = (len(unknown_sids) < args.unknown_support_min
                       or (unknown_acc is not None and unknown_acc >= args.unknown_min_acc))
    danger = {}
    if signal in DANGEROUS_POSITIVE:
        pos = DANGEROUS_POSITIVE[signal]
        danger = {"false_positive": sorted(sid for sid, label in valid.items()
                                           if label != pos and sid in returned and returned[sid].get("predicted") == pos),
                  "false_negative": sorted(sid for sid, label in valid.items()
                                           if label == pos and sid in returned and returned[sid].get("predicted") != pos)}
    confs = [r.get("confidence") for r in returned.values() if isinstance(r.get("confidence"), (int, float))]
    unexplained_failures = [sid for sid in failed]
    gate_pass = bool(
        delta >= args.gate_delta
        and unknown_gate_ok
        and not unexplained_failures
    )
    labels_list = SCORE_SIGNAL_LABELS[signal]
    return {
        "planned": len(planned), "valid_reference": len(valid), "unresolved": 30 - len(valid),
        "returned": len(returned), "refused_over_budget": sorted(refused), "failed": failed,
        "correct_on_valid": len(correct), "accuracy_on_valid": accuracy,
        "baseline_constant_class": baseline["constant_class"],
        "baseline_support": baseline["support"], "delta_vs_baseline": delta,
        "gate_pass": gate_pass, "gate_note": "delta>=3 AND unknown-gate AND no unexplained worker failures",
        "unknown_class": unknown, "unknown_support": len(unknown_sids),
        "unknown_accuracy": unknown_acc, "unknown_as_definite": sorted(unknown_as_definite),
        "dangerous": danger,
        "confidence_raw": {"mean": round(sum(confs) / len(confs), 4) if confs else None,
                           "min": min(confs) if confs else None, "max": max(confs) if confs else None,
                           "note": "raw confidence is NOT accuracy; no calibration fitted"},
        "confusion_vs_reference": SCORE.confusion([valid[s] for s in sorted(valid)],
                                                  [returned.get(s, {}).get("predicted") for s in sorted(valid)],
                                                  labels_list) if valid else {},
    }


SCORE_SIGNAL_LABELS = {
    "social_act": ["威胁", "示好", "求助", "合作", "中性", "不确定"],
    "trust_shift": ["上升", "不变", "下降", "不确定"],
    "fear_shift": ["上升", "不变", "下降", "不确定"],
    "deception": ["有线索", "无线索", "信息不足"],
    "boundary_violation": ["已越过", "未越过", "信息不足"],
}


if __name__ == "__main__":
    sys.exit(main())
