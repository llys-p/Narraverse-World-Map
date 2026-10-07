#!/usr/bin/env python3
"""E1 M0 smoke test: load a local Laya checkpoint and answer one Chinese
SocialSignal choice question. Prints the raw result shape so the evaluator can
be written against it. Reusable: python scripts/smoke_laya.py --dir <weights> --id A

Requires USE_TF=0 (upstream note: probing TensorFlow can deadlock construction).
"""
import argparse
import json
import os
import time

os.environ.setdefault("USE_TF", "0")

import laya  # noqa: E402

Q = {
    "social_act": {
        "type": "choice",
        "instructions": "从 NPC 的视角，玩家这次交互在做什么？只选一项。",
        "criteria": {
            "威胁": "对 NPC 的人身、财物、声誉或处境有损害线索",
            "示好": "无偿给予、致意或道歉",
            "求助": "请求 NPC 帮忙或庇护",
            "合作": "对等交换或一起做事",
            "中性": "只是问询、寒暄或陈述",
            "不确定": "线索不足或互相矛盾",
        },
    }
}
BODY = (
    "【NPC】集市粮油商田七，跟玩家做过四回生意，性子务实\n"
    "【已知边界】当场银货两讫，不收欠条（他挂在嘴边）\n"
    "【既往】上一回玩家赊了三十钱，隔了半月才还上\n"
    "【此刻】老规矩，先记账，集散了我就给你送来。"
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="local checkpoint directory")
    ap.add_argument("--id", default="?")
    ap.add_argument("--device", default=None)
    ap.add_argument("--sha256", default=None, help="expected model.safetensors sha256")
    ap.add_argument("--reps", type=int, default=3)
    args = ap.parse_args()

    expected = None
    if args.sha256:
        expected = {"model.safetensors": args.sha256}

    t0 = time.perf_counter()
    agent = laya.load(args.dir, device=args.device, expected_sha256=expected)
    load_s = time.perf_counter() - t0
    print(f"[{args.id}] loaded in {load_s:.1f}s | model_id={getattr(agent,'model_id',None)} "
          f"| device={getattr(agent,'device',None)} | dtype={getattr(agent,'dtype',None)} "
          f"| backend={getattr(agent,'backend',None)}")

    warm = agent.predict({"body": BODY}, Q)
    t1 = time.perf_counter()
    for _ in range(args.reps):
        r = agent.predict({"body": BODY}, Q)
    per_ms = (time.perf_counter() - t1) / args.reps * 1000
    print(f"[{args.id}] {args.reps} single-question calls: {per_ms:.1f} ms/call")
    print("[result keys]", sorted(r.keys()))
    print(json.dumps(r, ensure_ascii=False, indent=1, default=str)[:2000])

    # batch path, which the real run will use
    tb = time.perf_counter()
    rb = agent.predict_batch([{"body": BODY}] * 8, Q) if hasattr(agent, "predict_batch") else None
    b_ms = (time.perf_counter() - tb) * 1000
    if rb is not None:
        items = rb if isinstance(rb, list) else rb.get("results", rb)
        print(f"[{args.id}] predict_batch n=8: {b_ms:.0f} ms total ({b_ms/8:.1f} ms/item)")
        one = items[0] if isinstance(items, list) else items
        print("[batch item keys]", sorted(one.keys()) if isinstance(one, dict) else type(one))


if __name__ == "__main__":
    main()
