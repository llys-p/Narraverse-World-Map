#!/usr/bin/env python3
"""E1R2 unified evaluator (v3 runner). Pilot and E1R versions stay in the tree.

Changes forced by E1R2:
  * F3 - inference runs in a killable child process; on timeout the child is
    killed, reaped and restarted, the batch is recorded as failed, every later
    batch of that signal is recorded as not_executed, and the run exits non-zero.
    No silent overlap, no fallback to another condition.
  * F4 - long/max_len conditions enforce the state budget through the worker's own
    tokenizer, keep the deletion order and counts, never describe a truncated
    boundary as "never informed", and refuse items whose undeletable core cannot
    fit. Anything marked requires_relabel is written but flagged excluded=true so
    the scorer cannot score it against the old gold.
  * F1 - each run appends an entry to results/raw/run-index.json with the file
    path, sha256, record count and full run configuration; the scorer consumes the
    index instead of guessing filenames.
  * F2 - the final split is gated by the freeze gate, and the frozen plan (models,
    conditions, option order, max_len/head_max_len, truncation policy, sample
    scope) must match what is being run.

  python scripts/run_bench_v3.py --model A --split dev --condition primary --base D:/ModelBench/laya
"""
import argparse
import datetime
import hashlib
import json
import os
import queue
import subprocess
import sys
import threading
import time

os.environ.setdefault("USE_TF", "0")

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from body import load_questions  # noqa: E402
from inputs import (assemble_with_budget, build_body, ordered_criteria,  # noqa: E402
                    read_jsonl, rows_for)

CONDITIONS = ("primary", "long", "max_len_8192", "perm_rotated", "perm_reversed",
              "paraphrase", "probe_malformed")
PROBE_BODIES = [
    ("empty", "", "error_or_abstain"),
    ("address_only", "【此刻】岑婆婆。", "error_or_abstain"),
    ("oversized", "【此刻】" + "重复台词" * 1200, "truncated_or_error"),
    ("latin_only", "【此刻】Please keep this between us.", "answered"),
    ("control_chars", "【此刻】\u0000\u0007 weird \uffff", "no_silent_fix"),
]


def sha256_file(p):
    with open(p, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


class Worker:
    """One request in flight; kill + reap + restart on timeout."""

    def __init__(self, python_exe, worker_script, model_dir, sha256, device, label=""):
        self.args = [python_exe, worker_script, "--dir", model_dir, "--sha256", sha256,
                     "--device", device]
        self.label = label
        self.proc = None
        self.replies = queue.Queue()
        self.restarts = 0
        self.killed_for_timeouts = 0
        self.overlap_detected = 0
        self._reader = None
        self.start()

    def start(self):
        self.proc = subprocess.Popen(self.args, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, text=True, encoding="utf-8",
                                     bufsize=1, cwd=HERE)
        self.replies = queue.Queue()
        self._reader = threading.Thread(target=self._pump, daemon=True)
        self._reader.start()
        ready = self._await(300.0, kind="ready")
        if not ready or not ready.get("ready"):
            self.proc.kill()
            self.proc.wait(timeout=30)
            raise RuntimeError(f"worker failed to become ready: {ready}")
        self.info = ready

    def _pump(self):
        for line in self.proc.stdout:
            line = line.strip()
            if line:
                try:
                    self.replies.put(json.loads(line))
                except json.JSONDecodeError:
                    self.replies.put({"id": None, "error": "worker: unparseable reply"})

    def _await(self, deadline_s, want_id=None, kind=None):
        t0 = time.perf_counter()
        while True:
            left = deadline_s - (time.perf_counter() - t0)
            if left <= 0:
                return None
            try:
                msg = self.replies.get(timeout=min(left, 1.0))
            except queue.Empty:
                continue
            if want_id is not None and msg.get("id") != want_id:
                continue
            if kind is not None and not msg.get(kind):
                continue
            return msg

    def _kill_reap(self):
        self.killed_for_timeouts += 1
        try:
            self.proc.kill()
        except ProcessLookupError:
            pass
        try:
            self.proc.wait(timeout=30)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("worker could not be reaped; refusing to start a replacement") from exc
        if self._reader:
            self._reader.join(timeout=2)
        self.restarts += 1

    def call(self, payload, timeout_s):
        seq = id(payload) % 10**9
        job = dict(payload, id=seq)
        t0 = time.perf_counter()
        try:
            self.proc.stdin.write(json.dumps(job, ensure_ascii=False) + "\n")
            self.proc.stdin.flush()
        except Exception as exc:
            return None, f"WORKER_PIPE: {exc}", time.perf_counter() - t0, "pipe"
        msg = self._await(timeout_s, want_id=seq)
        wall = time.perf_counter() - t0
        if msg is None:
            # timeout: kill it, make sure nothing keeps computing, then restart
            self._kill_reap()
            self.start()
            return None, f"TIMEOUT>{timeout_s}s (worker killed and restarted)", wall, "timeout"
        if msg.get("error"):
            return None, msg["error"], wall, "error"
        return msg.get("results") or msg.get("counts"), None, wall, "ok"

    def shutdown(self):
        try:
            self.proc.stdin.close()
        except Exception:
            pass
        try:
            self.proc.wait(timeout=15)
        except Exception:
            self.proc.kill()
            self.proc.wait(timeout=30)


def append_index(entry):
    p = os.path.join(HERE, "results", "raw", "run-index.json")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as fh:
            idx = json.load(fh)
    else:
        idx = {"schema": "e1r2-run-index-v1", "runs": {}}
    key = f'{entry["model"]}|{entry["split"]}|{entry["condition"]}'
    if key in idx["runs"]:
        n = 2
        while f"{key}#{n}" in idx["runs"]:
            n += 1
        key = f"{key}#{n}"
    idx["runs"][key] = entry
    with open(p, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(idx, fh, ensure_ascii=False, indent=1)
    return key


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True, choices=["A", "B", "C"])
    ap.add_argument("--split", required=True, choices=["dev", "calibration", "final"])
    ap.add_argument("--condition", required=True, choices=CONDITIONS)
    ap.add_argument("--base", required=True)
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--max-len", type=int, default=None)
    ap.add_argument("--head-max-len", type=int, default=256)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--timeout-s", type=float, default=120.0)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--gate", default=None, help="freeze-gate path (required for final)")
    args = ap.parse_args()

    qt = load_questions(os.path.join(HERE, "question-templates.json"))
    with open(os.path.join(HERE, "config.lock.json"), encoding="utf-8") as fh:
        lock = json.load(fh)
    cand = lock["candidates"][args.model]
    if cand.get("status") != "runnable":
        print(f"REFUSED: model {args.model} status={cand.get('status')}: {(cand.get('blocker') or '')[:200]}")
        return 2

    if args.batch_size < 1 or args.timeout_s <= 0 or args.head_max_len < 1 or args.limit < 0:
        raise SystemExit("invalid batch, timeout, head budget or limit")
    max_len = args.max_len or (8192 if args.condition == "max_len_8192" else qt["hard_constraints"]["max_len_default"])
    if max_len <= args.head_max_len:
        raise SystemExit("max_len must exceed head_max_len")
    rows = rows_for(HERE, args.split)
    if args.split == "final":
        import score as SCORE
        errs = SCORE.verify_freeze_gate(HERE, rows, args.model, args.condition, args.split,
                                        {"max_len": max_len,
                                         "head_max_len": args.head_max_len, "limit": args.limit,
                                         "device": args.device}, gate_path=args.gate)
        if errs:
            print("REFUSED: final run not authorised")
            for e in errs:
                print("  -", e)
            return 3
        # Reserve this pre-registered pair before loading/inference. A failed or
        # interrupted run must not silently expose the same holdout a second time.
        SCORE.journal_final_run(HERE, args.model, args.condition, None)

    state_budget = max_len - args.head_max_len
    runtime_dir = os.path.join(args.base, "runtime", args.model)
    if not os.path.isdir(runtime_dir):
        raise SystemExit(f"runtime copy missing: {runtime_dir}")

    para = None
    if args.condition == "paraphrase":
        para = {e["sid"]: e for e in read_jsonl(os.path.join(HERE, "samples", "paraphrase-dev.jsonl"))}

    if args.limit:
        rows = rows[: args.limit]

    w = Worker(sys.executable, os.path.join(HERE, "scripts", "infer_worker.py"),
               runtime_dir, cand["model_sha256"], args.device, label=args.model)

    outdir = os.path.join(HERE, "results", "raw")
    os.makedirs(outdir, exist_ok=True)
    run_id = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    out = os.path.join(outdir, f"{args.model}-{args.split}-{args.condition}.{run_id}.e1r3.jsonl")
    records, skipped, failed_run = [], 0, None
    seq = 0

    try:
        for signal, spec in qt["signals"].items():
            order = {"perm_rotated": "rotated", "perm_reversed": "reversed"}.get(args.condition, "canonical")
            criteria, mapping = ordered_criteria(spec, order)
            q = {signal: {"type": "choice", "instructions": spec["instructions"], "criteria": criteria}}

            jobs = []
            if args.condition == "probe_malformed":
                for name, body, expect in PROBE_BODIES:
                    jobs.append(({"sid": f"PROBE-{name}", "family": "probe", "rel": "probe", "turn": body},
                                 body, {"probe": name, "expect": expect, "state_tokens": None}, False))
            else:
                for r in rows:
                    if failed_run:
                        records.append(_fail_record(r, args, signal, order, mapping, {}, None,
                                                    f"NOT_EXECUTED after {failed_run}", False))
                        continue
                    try:
                        if args.condition in ("long", "max_len_8192"):
                            body, rep = _counting_assemble(w, r, state_budget, signal, para, args.timeout_s)
                        else:
                            body, rep = build_body(r, paraphrase_table=para)
                            rep = dict(rep)
                            if body is not None:
                                rep["state_tokens"] = _count(w, [body], args.timeout_s)[0]
                                rep["boundary_state"] = rep.get("boundary_state", "stated")
                        if body is None:
                            skipped += 1
                            if rep.get("refused"):
                                records.append({"sid": r["sid"], "split": args.split, "condition": args.condition,
                                                "signal": signal, "model": args.model, "family": r.get("family"),
                                                "rel": r.get("rel"), "tags": r.get("tags", []),
                                                "option_order": order, "input_report": rep, "body_text": None,
                                                "predict_error": f"REFUSED_{rep['refused']}", "predicted": None,
                                                "excluded_from_formal_scoring": True, "not_executed": True})
                            continue
                        head = _count(w, [spec["instructions"] + "".join(f"{k}{v}" for k, v in criteria.items())],
                                      args.timeout_s)[0]
                        if head > args.head_max_len or rep.get("state_tokens", 0) > state_budget:
                            records.append(_fail_record(r, args, signal, order, mapping, rep, body,
                                                        "REFUSED_INPUT_OVER_BUDGET", False))
                            continue
                        rep["head_tokens_measured"] = head
                        rep["total_tokens_estimate"] = (rep.get("state_tokens") or rep.get("tokens_after") or 0) + head
                        jobs.append((r, body, rep, bool(rep.get("requires_relabel"))))
                    except RuntimeError as exc:
                        failed_run = str(exc)
                        records.append(_fail_record(r, args, signal, order, mapping,
                                                    {"refused": "token_count_failed"}, None, failed_run, False))

            for i in range(0, len(jobs), args.batch_size):
                if failed_run:
                    for r, body, rep, relabel in jobs[i:]:
                        records.append(_fail_record(r, args, signal, order, mapping, rep, body,
                                                    f"NOT_EXECUTED after {failed_run}", relabel))
                    break
                chunk = jobs[i:i + args.batch_size]
                res, err, wall, kind = w.call({"states": [{"body": b} for _, b, _, _ in chunk],
                                               "questions": q, "max_len": max_len,
                                               "head_max_len": args.head_max_len}, args.timeout_s)
                per_item = wall / max(len(chunk), 1)
                if err:
                    if kind == "timeout":
                        failed_run = err
                    for r, body, rep, relabel in chunk:
                        records.append(_fail_record(r, args, signal, order, mapping, rep, body, err, relabel))
                    continue
                if not isinstance(res, list) or len(res) != len(chunk):
                    for r, body, rep, relabel in chunk:
                        records.append(_fail_record(r, args, signal, order, mapping, rep, body,
                                                    f"WORKER_SHAPE: expected {len(chunk)} replies, got "
                                                    f"{type(res).__name__}/{len(res) if isinstance(res, list) else 'n/a'}",
                                                    relabel))
                    continue
                for j, (r, body, rep, relabel) in enumerate(chunk):
                    seq += 1
                    one = res[j]
                    ans = ((one.get("answers") or {}).get(signal) if isinstance(one, dict) else None)
                    if not isinstance(ans, dict):
                        records.append(_fail_record(r, args, signal, order, mapping, rep, body,
                                                    "WORKER_SHAPE: reply has no answer object", relabel))
                        continue
                    rec = {"sid": r["sid"], "split": args.split, "condition": args.condition,
                           "signal": signal, "model": args.model, "family": r.get("family"),
                           "rel": r.get("rel"), "tags": r.get("tags", []), "seq": seq,
                           "option_order": order, "semantic_labels": mapping["semantic_labels"],
                           "requested_criteria_order": mapping["requested_order"],
                           "input_report": rep, "body_text": body,
                           "gold": (r.get("labels") or {}).get(signal),
                           "predicted": ans.get("choice"), "probs": ans.get("probabilities"),
                           "confidence": ans.get("confidence"),
                           "answer_confidence": ans.get("answer_confidence"),
                           "usage": one.get("usage"), "wall_ms_per_item": round(per_item * 1000, 1),
                           "excluded_from_formal_scoring": relabel,
                           "requires_relabel": relabel}
                    records.append(rec)
                print(f"  {signal} {min(i + args.batch_size, len(jobs))}/{len(jobs)}", flush=True)
    finally:
        w.shutdown()
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        for rec in records:
            fh.write(json.dumps(rec, ensure_ascii=False, sort_keys=True) + "\n")

    entry = {"model": args.model, "split": args.split, "condition": args.condition,
             "written_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
             "path": os.path.relpath(out, HERE).replace("\\", "/"), "sha256": sha256_file(out),
             "records": len(records), "skipped": skipped,
             "config": {"device": args.device, "max_len": max_len, "head_max_len": args.head_max_len,
                        "state_budget": state_budget, "batch_size": args.batch_size,
                        "timeout_s": args.timeout_s, "limit": args.limit, "option_order": "derived"},
             "worker": {"restarts": w.restarts, "killed_for_timeouts": w.killed_for_timeouts,
                        "ready_info": getattr(w, "info", {}),
                        "runtime_dir": runtime_dir.replace("\\", "/"),
                        "weights_sha256": cand["model_sha256"]},
             "run_failed": bool(failed_run), "failure": failed_run}
    key = append_index(entry)
    if args.split == "final":
        SCORE.journal_final_run(HERE, args.model, args.condition, entry["sha256"])
    print(json.dumps({k: entry[k] for k in ("records", "skipped", "sha256", "run_failed")}, ensure_ascii=False))
    print("index key:", key, "worker:", {k: entry["worker"][k] for k in ("restarts", "killed_for_timeouts")})
    return 4 if failed_run else 0


def _count(w, texts, timeout_s):
    res, err, _, _ = w.call({"count": texts}, timeout_s)
    if err or not isinstance(res, list) or len(res) != len(texts):
        raise RuntimeError(f"TOKEN_COUNT_FAILED: {err or 'worker counts shape mismatch'}")
    if any(type(n) is not int or n < 0 for n in res):
        raise RuntimeError("TOKEN_COUNT_FAILED: invalid token count")
    return res


def _counting_assemble(w, row, budget, signal, para, timeout_s):
    """Token counting through the worker so the budget is measured with the
    checkpoint's own tokenizer, not an estimate."""
    def counter(text):
        return _count(w, [text], timeout_s)[0]
    return assemble_with_budget(counter, row, budget, signal, paraphrase_table=para)


def _fail_record(r, args, signal, order, mapping, rep, body, err, relabel):
    return {"sid": r["sid"], "split": args.split, "condition": args.condition, "signal": signal,
            "model": args.model, "family": r.get("family"), "rel": r.get("rel"),
            "tags": r.get("tags", []), "option_order": order,
            "semantic_labels": mapping["semantic_labels"],
            "requested_criteria_order": mapping["requested_order"],
            "input_report": rep, "body_text": body, "gold": (r.get("labels") or {}).get(signal),
            "predicted": None, "probs": None, "predict_error": err, "not_executed": True,
            "excluded_from_formal_scoring": bool(relabel), "requires_relabel": bool(relabel)}


if __name__ == "__main__":
    sys.exit(main())
