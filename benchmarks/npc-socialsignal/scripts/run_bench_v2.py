#!/usr/bin/env python3
"""E1R unified evaluator (v2). Pilot run_bench.py stays in the tree unchanged.

What E1R forced into this version:
  * conditions really change the input: option-order permutation, an authored
    paraphrase table, short vs long context with the documented truncation policy
    executed against the checkpoint's own tokenizer, and empty/malformed probes;
  * every run records the text actually passed, token counts, head budget, which
    evidence lines were removed, and per-item wall time under a bounded timeout;
  * a timeout, crash or illegal answer is written as a failed record and can only
    ever count as not-correct (score.py owns the denominator);
  * the final split reads only samples/scenarios-final-blind.jsonl (no answer key
    in the repository) and refuses to run unless the freeze gate verifies; there
    is no --allow-unfrozen bypass any more;
  * the locked runtime directory is a COPY of the verified weights, because
    laya.load() rewrites tokenizer_config.json in place (see M0-SOURCES).

  python scripts/run_bench_v2.py --model A --split dev --condition primary
"""
import argparse
import datetime
import json
import os
import sys
import threading
import time

os.environ.setdefault("USE_TF", "0")

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from body import load_questions, load_split  # noqa: E402
from inputs import assemble_with_budget, build_body, count_tokens, ordered_criteria  # noqa: E402
import score as SCORE  # noqa: E402

CONDITIONS = ("primary", "long", "max_len_8192", "perm_rotated", "perm_reversed",
              "paraphrase", "probe_malformed")


def rows_for(split):
    if split == "final":
        import json as _json
        p = os.path.join(HERE, "samples", "scenarios-final-blind.jsonl")
        return [_json.loads(l) for l in open(p, encoding="utf-8") if l.strip()]
    return load_split(HERE, split)


PROBE_BODIES = [
    {"probe": "empty", "body": "", "expect": "error_or_abstain"},
    {"probe": "address_only", "body": "【此刻】岑婆婆。", "expect": "error_or_abstain"},
    {"probe": "oversized", "body": "【此刻】" + "重复台词" * 1200, "expect": "truncated_or_error"},
    {"probe": "latin_only", "body": "【此刻】Please keep this between us.", "expect": "answered"},
    {"probe": "control_chars", "body": "【此刻】\u0000\u0007 weird \uffff", "expect": "no_silent_fix"},
]


def predict_with_timeout(agent, states, q, max_len, head_max_len, timeout_s):
    """Bounded execution. The SDK is synchronous, so a worker thread + join timeout
    gives a real bound; a timed-out chunk is recorded as a failure for every item in
    it rather than falling back to another condition."""
    box, err = {}, {}

    def run():
        try:
            box["res"] = agent.predict_batch(states, q, max_len=max_len, head_max_len=head_max_len)
        except BaseException as exc:  # noqa: BLE001 - recorded, never swallowed
            err["e"] = f"{type(exc).__name__}: {exc}"

    t = threading.Thread(target=run, daemon=True)
    t0 = time.perf_counter()
    t.start()
    t.join(timeout_s)
    wall = time.perf_counter() - t0
    if t.is_alive():
        return None, f"TIMEOUT>{timeout_s}s", wall
    if err:
        return None, err["e"], wall
    return box.get("res"), None, wall


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, choices=["A", "B", "C"])
    ap.add_argument("--split", required=True, choices=["dev", "calibration", "final"])
    ap.add_argument("--condition", required=True, choices=CONDITIONS)
    ap.add_argument("--base", required=True, help="D:/ModelBench/laya style base dir")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--max-len", type=int, default=None)
    ap.add_argument("--head-max-len", type=int, default=256)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--timeout-s", type=float, default=120.0)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    qt = load_questions(os.path.join(HERE, "question-templates.json"))
    lock = json.load(open(os.path.join(HERE, "config.lock.json"), encoding="utf-8"))
    entry = lock["candidates"][args.model]
    if entry.get("status") != "runnable":
        print(f"REFUSED: model {args.model} status={entry.get('status')}: "
              f"{(entry.get('blocker') or '')[:220]}")
        return 2
    if args.split == "final":
        errs = SCORE.verify_freeze_gate(rows_for("final"), args.condition, [args.model])
        if errs:
            print("REFUSED: final split is not open. Reasons:")
            for e in errs:
                print("  -", e)
            return 3

    max_len = args.max_len or (8192 if args.condition == "max_len_8192" else qt["hard_constraints"]["max_len_default"])
    state_budget = (max_len - args.head_max_len) if args.condition in ("long", "max_len_8192") else qt["hard_constraints"]["body_budget_tokens"]

    import laya
    # runtime copy, never the read-only download directory: laya.load rewrites
    # tokenizer_config.json in place, which would dirty the verified source evidence
    runtime_dir = os.path.join(args.base, "runtime", args.model)
    weights_dir = os.path.join(args.base, "weights", args.model)
    if not os.path.isdir(runtime_dir):
        raise SystemExit(f"runtime copy missing: {runtime_dir} (see scripts/make_runtime_copy.py)")
    tok_check = json.load(open(os.path.join(runtime_dir, "RUNTIME-COPY.json"), encoding="utf-8")) if os.path.exists(os.path.join(runtime_dir, "RUNTIME-COPY.json")) else {}

    t0 = time.perf_counter()
    agent = laya.load(runtime_dir, device=args.device,
                      expected_sha256={"model.safetensors": entry["model_sha256"]})
    load_s = time.perf_counter() - t0

    para = None
    if args.condition == "paraphrase":
        pp = os.path.join(HERE, "samples", "paraphrase-dev.jsonl")
        if not os.path.exists(pp):
            raise SystemExit("paraphrase condition needs samples/paraphrase-dev.jsonl (authored rewrites)")
        para = {}
        for line in open(pp, encoding="utf-8"):
            if line.strip():
                e = json.loads(line)
                para[e["sid"]] = e

    rows = rows_for(args.split)
    if args.limit:
        rows = rows[: args.limit]

    outdir = os.path.join(HERE, "results", "raw")
    os.makedirs(outdir, exist_ok=True)
    out = os.path.join(outdir, f"{args.model}-{args.split}-{args.condition}.e1r.jsonl")
    records, skipped = [], 0

    for signal, spec in qt["signals"].items():
        order = {"perm_rotated": "rotated", "perm_reversed": "reversed"}.get(args.condition, "canonical")
        criteria, mapping = ordered_criteria(spec, order)
        q = {signal: {"type": "choice", "instructions": spec["instructions"], "criteria": criteria}}

        jobs = []
        if args.condition == "probe_malformed":
            for pb in PROBE_BODIES:
                jobs.append(({"sid": f"PROBE-{pb['probe']}", "family": "probe", "rel": "probe",
                              "turn": pb["body"], "labels": {signal: "不确定" if "不确定" in spec["canonical_order"] else "信息不足"}},
                             pb["body"], {"probe": pb["probe"], "expect": pb["expect"]}))
        else:
            for r in rows:
                if args.condition in ("long", "max_len_8192"):
                    body, rep = assemble_with_budget(agent.tok, r, state_budget, paraphrase_table=para)
                else:
                    body, rep = build_body(r, paraphrase_table=para)
                if body is None:
                    skipped += 1
                    continue
                rep = dict(rep)
                rep["state_tokens"] = count_tokens(agent.tok, body)
                rep["head_tokens_measured"] = count_tokens(agent.tok, spec["instructions"] + "".join(
                    f"{k}{v}" for k, v in criteria.items()))
                jobs.append((r, body, rep))

        for i in range(0, len(jobs), args.batch_size):
            chunk = jobs[i:i + args.batch_size]
            res, err, wall = predict_with_timeout(agent, [{"body": b} for _, b, _ in chunk], q,
                                                  max_len, args.head_max_len, args.timeout_s)
            per_item = wall / len(chunk)
            for j, (r, body, rep) in enumerate(chunk):
                rec = {"sid": r["sid"], "split": args.split, "condition": args.condition,
                       "signal": signal, "model": args.model, "family": r.get("family"),
                       "rel": r.get("rel"), "tags": r.get("tags", []),
                       "option_order": order, "semantic_labels": mapping["semantic_labels"],
                       "requested_criteria_order": mapping["requested_order"],
                       "input_report": rep, "body_text": body,
                       "gold": (r.get("labels") or {}).get(signal)}
                if rec["gold"] is None and args.split != "final":
                    rec["gold_missing"] = True
                if err:
                    rec["predict_error"] = err
                else:
                    one = res[j] if isinstance(res, list) else (res.get("results") or [])[j]
                    ans = (one.get("answers") or {}).get(signal) or {}
                    rec["predicted"] = ans.get("choice")
                    rec["probs"] = ans.get("probabilities")
                    rec["confidence"] = ans.get("confidence")
                    rec["answer_confidence"] = ans.get("answer_confidence")
                    rec["usage"] = one.get("usage")
                rec["wall_ms_per_item"] = round(per_item * 1000, 1)
                records.append(rec)
            print(f"  {signal} {min(i + args.batch_size, len(jobs))}/{len(jobs)}", flush=True)

    write_time = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        for rec in records:
            fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")
    meta = {"model": args.model, "split": args.split, "condition": args.condition,
            "written_at": write_time, "records": len(records), "skipped_no_paraphrase": skipped,
            "load_seconds": round(load_s, 1), "device": args.device, "max_len": max_len,
            "head_max_len": args.head_max_len, "state_budget_tokens": state_budget,
            "batch_size": args.batch_size, "timeout_s": args.timeout_s,
            "laya": getattr(laya, "__version__", "?"),
            "runtime_dir": runtime_dir.replace("\\", "/"), "runtime_copy": tok_check,
            "weights_sha256_verified_at_load": entry["model_sha256"],
            "out": os.path.relpath(out, HERE)}
    json.dump(meta, open(out.replace(".jsonl", ".meta.json"), "w", encoding="utf-8", newline="\n"),
              ensure_ascii=False, indent=1)
    print(json.dumps({k: meta[k] for k in ("records", "skipped_no_paraphrase", "load_seconds", "max_len", "out")},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
