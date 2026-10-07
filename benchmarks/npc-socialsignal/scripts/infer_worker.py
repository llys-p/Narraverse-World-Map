#!/usr/bin/env python3
"""E1R2 F3: an inference worker the caller can actually stop.

A child process loads the checkpoint once and answers JSON-line jobs on stdin.
The parent reads replies through a queue with a deadline; on timeout it KILLS and
REAPS this child and starts a fresh one, so no compute continues behind the run and
the next batch never overlaps the timed-out one. `thread.join(timeout)` could not
give that guarantee because the thread kept executing inside torch.

Protocol, one JSON object per line both ways:
  parent -> {"id": 3, "states": [{"body": ...}], "questions": {...},
             "max_len": 1024, "head_max_len": 256}
  child  -> {"id": 3, "results": [...]} | {"id": 3, "error": "..."}
  child   at start: {"id": null, "ready": true, "model": "...", "backend": "..."}
"""
import json
import os
import sys

os.environ.setdefault("USE_TF", "0")


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--sha256", required=True)
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    import laya
    agent = laya.load(args.dir, device=args.device,
                      expected_sha256={"model.safetensors": args.sha256})
    emit({"id": None, "ready": True, "model": str(getattr(agent, "model_id", args.dir)),
          "device": str(getattr(agent, "device", args.device)),
          "dtype": str(getattr(agent, "dtype", "?")), "backend": str(getattr(agent, "backend", "?")),
          "laya": getattr(laya, "__version__", "?")})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            job = json.loads(line)
            if "count" in job:
                ids = agent.tok(job["count"], add_special_tokens=False)["input_ids"]
                emit({"id": job.get("id"), "counts": [len(x) for x in ids]})
                continue
            res = agent.predict_batch(job["states"], job["questions"], max_len=job["max_len"],
                                      head_max_len=job["head_max_len"])
            if not isinstance(res, list):
                res = res.get("results") if isinstance(res, dict) else None
                if res is None:
                    emit({"id": job.get("id"), "error": "worker: unexpected reply shape from SDK"})
                    continue
            emit({"id": job.get("id"), "results": json.loads(json.dumps(res, default=str))})
        except BaseException as exc:  # noqa: BLE001 - the parent needs the failure, not a dead pipe
            try:
                emit({"id": json.loads(line).get("id"), "error": f"{type(exc).__name__}: {exc}"})
            except Exception:
                emit({"id": None, "error": f"{type(exc).__name__}: {exc}"})


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
