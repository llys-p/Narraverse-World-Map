#!/usr/bin/env python3
"""E1 M2 unified evaluator. Runs one checkpoint over one split/condition and
writes per-item raw predictions. Same body text, same instructions, same option
keys and same test ids for every candidate; the only difference is the SDK call
shape (documented in M0-SOURCES.md).

Usage:
  python scripts/run_bench.py --model A --split dev --condition primary
  python scripts/run_bench.py --model B --split calibration --condition perm_reversed

Refuses to run the final split until the label freeze is recorded in
split-manifest.json (frozen_by / blind_review status), so the blind-test set
cannot be opened early.
"""
import argparse
import glob
import json
import os
import sys
import time

os.environ.setdefault("USE_TF", "0")

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

from body import build_body, load_split, load_questions, sdk_questions  # noqa: E402

SECTIONS = ("NPC", "已知边界", "既往", "此刻")


def rotate(order, k=1):
    return list(order[k:]) + list(order[:k])


def condition_orders(condition, canonical):
    if condition in ("primary", "long", "max_len_8192", "paraphrase"):
        return {"canonical": canonical}
    if condition == "perm_rotated":
        return {"rotated": rotate(canonical, 1)}
    if condition == "perm_reversed":
        return {"reversed": list(reversed(canonical))}
    raise ValueError(f"unknown condition {condition}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, choices=["A", "B", "C"])
    ap.add_argument("--split", required=True, choices=["dev", "calibration", "final"])
    ap.add_argument("--condition", default="primary")
    ap.add_argument("--weights", required=True, help="local checkpoint dir")
    ap.add_argument("--sha256", required=True, help="expected model.safetensors sha256")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--max-len", type=int, default=1024)
    ap.add_argument("--head-max-len", type=int, default=256)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--allow-unfrozen", action="store_true")
    args = ap.parse_args()

    manifest = json.load(open(os.path.join(HERE, "split-manifest.json"), encoding="utf-8"))
    if args.split == "final" and not manifest.get("label_freeze", {}).get("final_frozen"):
        if not args.allow_unfrozen:
            print("REFUSED: final split is sealed until blind review closes "
                  "(split-manifest.json label_freeze.final_frozen). Use dev/calibration, "
                  "or pass --allow-unfrozen only with explicit controller approval.")
            return 2

    lock = json.load(open(os.path.join(HERE, "config.lock.json"), encoding="utf-8"))
    models = lock["candidates"]
    if args.model not in models:
        print(f"model {args.model} not in config.lock.json")
        return 2
    entry = models[args.model]
    if entry.get("status") != "runnable":
        print(f"model {args.model} not runnable per lockfile: {entry.get('status')} - "
              f"{entry.get('blocker', '')[:200]}")
        return 2
    if entry["model_sha256"] != args.sha256:
        print(f"REFUSED: --sha256 does not match locked hash for {args.model}")
        return 2

    qt = load_questions(os.path.join(HERE, "question-templates.json"))
    rows = load_split(HERE, args.split)
    if args.limit:
        rows = rows[: args.limit]

    outdir = os.path.join(HERE, "results", "raw")
    os.makedirs(outdir, exist_ok=True)
    out = os.path.join(outdir, f"{args.model}-{args.split}-{args.condition}.jsonl")

    import laya
    t0 = time.perf_counter()
    agent = laya.load(args.weights, device=args.device,
                      expected_sha256={"model.safetensors": args.sha256})
    load_s = time.perf_counter() - t0

    records = []
    for signal, spec in qt["signals"].items():
        orders = condition_orders(args.condition, spec["canonical_order"])
        order_name, order = list(orders.items())[0]
        q = {signal: {"type": "choice", "instructions": spec["instructions"],
                      "criteria": {k: spec["options"][k] for k in order}}}
        qsdk = sdk_questions(q)

        # identical inputs for every candidate: same body, same question, same ids
        items = []
        for r in rows:
            body = build_body(r)
            items.append((r, body))

        for i in range(0, len(items), args.batch_size):
            chunk = items[i:i + args.batch_size]
            states = [{"body": b} for _, b in chunk]
            ts = time.perf_counter()
            try:
                res = agent.predict_batch(states, qsdk, max_len=args.max_len,
                                          head_max_len=args.head_max_len)
                err = None
            except Exception as exc:  # recorded, never silently scored as correct
                res, err = None, f"{type(exc).__name__}: {exc}"
            wall_ms = (time.perf_counter() - ts) * 1000 / len(chunk)

            for j, (r, body) in enumerate(chunk):
                rec = {"sid": r["sid"], "split": args.split, "condition": args.condition,
                       "signal": signal, "gold": r["labels"][signal], "model": args.model,
                       "option_order": order_name, "tags": r.get("tags", []),
                       "family": r["family"], "rel": r["rel"]}
                if err:
                    rec.update({"predict_error": err, "predicted": None, "probs": None})
                else:
                    one = res[j] if isinstance(res, list) else res["results"][j] if "results" in res else res
                    ans = (one.get("answers") or {}).get(signal) or {}
                    rec.update({
                        "predicted": ans.get("choice"),
                        "probs": ans.get("probabilities"),
                        "confidence": ans.get("confidence"),
                        "answer_confidence": ans.get("answer_confidence"),
                        "usage": one.get("usage"),
                        "wall_ms_per_item": round(wall_ms, 1),
                    })
                records.append(rec)
            print(f"  {signal} {min(i+args.batch_size, len(items))}/{len(items)}", flush=True)

    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        for rec in records:
            fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")

    run_meta = {"model": args.model, "split": args.split, "condition": args.condition,
                "load_seconds": round(load_s, 1), "items": len(records),
                "device": args.device, "max_len": args.max_len,
                "head_max_len": args.head_max_len, "batch_size": args.batch_size,
                "sdk": {"laya": getattr(laya, "__version__", "unknown")},
                "out": os.path.relpath(out, HERE)}
    print(json.dumps(run_meta, ensure_ascii=False, indent=1))
    json.dump(run_meta, open(os.path.join(outdir, f"{args.model}-{args.split}-{args.condition}.meta.json"),
                             "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
