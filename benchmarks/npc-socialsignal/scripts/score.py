#!/usr/bin/env python3
"""E1R2 metrics and gates (v2 scorer). Pilot/E1R scorers stay in the tree as evidence.

F1 consumption chain and integrity
  * prediction files are resolved through results/raw/run-index.json written by the
    runner, or an explicit --predictions path; nothing is silently matched to an old
    pilot file, and the consumed file's sha256 is recorded in every output
  * gold and planned scenario ids must match exactly (same set, unique, five legal
    signals each); missing / extra / duplicate gold fails instead of shrinking the
    denominator
  * duplicate predictions, model/split/condition/signal mismatch, illegal labels,
    non-finite or malformed probabilities make the run exit non-zero WITHOUT writing
    scores and WITHOUT touching the calibration lock; they go to a diagnostics file
  * empty prediction sets and total model failure still produce an explicit
    all-failed report over the full planned set
  * items flagged requires_relabel (truncation removed decisive evidence or the
    boundary) are refused in formal scoring; re-scoring them against the old gold is
    a contract violation, not a smaller denominator

F2 freeze gate
  * two distinct, non-empty reviewer identities each with a signed disclosure,
    answer-file hash and full token coverage; an adjudicator identity, a completed
    receipt, and an explicit not-the-original-annotator attestation
  * frozen artifacts bound by hash: LABEL_SPEC, blind samples, templates, model
    config lock, calibration/threshold lock, external gold hash
  * the frozen plan binds model set, condition set, option order, max_len,
    head_max_len, truncation policy and sample scope; changing CLI flags (including
    --limit) or inventing a condition/model cannot bypass it
  * final runs are journaled so a second scoring of the same artefact is idempotent
    while a re-open or an unregistered condition is refused

  python scripts/score.py --selftest
  python scripts/score.py --models A,B --split dev --condition primary
  python scripts/score.py --fit-calibration --split calibration --models A,B
"""
import argparse
import datetime
import hashlib
import json
import math
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from body import load_questions, load_split_assignment  # noqa: E402
from inputs import rows_for  # noqa: E402

SIGNALS = ["social_act", "trust_shift", "fear_shift", "deception", "boundary_violation"]
HIGH_RISK = ("deception", "boundary_violation")
BOOT_REPS, SEED = 2000, 20261007
MISSING, ILLEGAL = "__MISSING__", "__ILLEGAL__"
ABSTAIN = {"social_act": "不确定", "trust_shift": "不确定", "fear_shift": "不确定",
           "deception": "信息不足", "boundary_violation": "信息不足"}
RULES = {
    "social_act": [("威胁", ["不然", "就都", "别怪", "我劝你", "千万别说", "天天在你"]),
                   ("求助", ["求", "能不能", "帮我", "劳驾", "给口", "替我送"]),
                   ("示好", ["给你带", "赔你", "补你", "谢你", "心意"]),
                   ("合作", ["分成", "一半", "照旧", "讲定", "你替我", "交换"])],
    "trust_shift": [("下降", ["拖", "不说", "别问", "躲", "先不", "记账"]),
                    ("上升", ["照讲定", "当面", "认", "补齐", "不碰", "先说个准"])],
    "fear_shift": [("上升", ["别说出去", "别声张", "熊", "官", "发作", "要挟"]),
                   ("下降", ["不劳", "我自己", "只管你的", "不沾"])],
    "deception": [("有线索", ["你千万别", "照这么回", "他不敢来", "登的名"]),
                  ("信息不足", ["祖传", "包你", "没来过"])],
    "boundary_violation": [("已越过", ["别问", "开后殿", "开柜", "出巷子", "借刀", "寿衣", "出城"]),
                           ("未越过", ["不进", "不碰", "照名册", "不沾手"])],
}


# ------------------------------------------------------------------ metrics
def accuracy(gold, pred):
    return sum(1 for g, p in zip(gold, pred) if g == p) / len(gold) if gold else None


def macro_f1(gold, pred, class_set):
    f1s, per_class = [], {}
    for lb in class_set:
        tp = sum(1 for g, p in zip(gold, pred) if g == lb and p == lb)
        fp = sum(1 for g, p in zip(gold, pred) if g != lb and p == lb)
        fn = sum(1 for g, p in zip(gold, pred) if g == lb and p != lb)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        f1s.append(f1)
        per_class[lb] = {"support": tp + fn, "tp": tp, "fp": fp, "fn": fn,
                         "precision": round(prec, 4), "recall": round(rec, 4), "f1": round(f1, 4)}
    return (sum(f1s) / len(f1s) if f1s else None), per_class


def confusion(gold, pred, labels):
    cols = list(labels) + [MISSING, ILLEGAL]
    m = {g: {c: 0 for c in cols} for g in labels}
    for g, p in zip(gold, pred):
        if g in m:
            m[g][p if p in cols else (ILLEGAL if p is not None else MISSING)] += 1
    return m


def brier(probs, gold, labels):
    tot = cnt = 0
    for pv, g in zip(probs, gold):
        if not pv or g not in labels:
            continue
        for lb in labels:
            x = pv.get(lb)
            if x is None or not math.isfinite(x):
                return None
            tot += (x - (1.0 if lb == g else 0.0)) ** 2
            cnt += 1
    return tot / cnt if cnt else None


def ece(pairs, bins=10):
    pts = [(c, k) for c, k in pairs if c is not None and isinstance(c, (int, float)) and math.isfinite(c)]
    if not pts:
        return None
    buckets = defaultdict(list)
    for c, k in pts:
        buckets[min(int(c * bins), bins - 1)].append((c, k))
    n = len(pts)
    return sum((len(v) / n) * abs(sum(c for c, _ in v) / len(v) - sum(1 for _, k in v if k) / len(v))
               for v in buckets.values())


def fit_temperature(items, labels):
    lodds = [({k: math.log(max(pv[k], 1e-9)) for k in labels if k in pv}, g)
             for pv, g in items if pv and g in labels]
    if not lodds:
        return None

    def nll(logT):
        T = math.exp(logT)
        s = 0.0
        for lg, g in lodds:
            z = {k: v / T for k, v in lg.items()}
            mx = max(z.values())
            s -= (z[g] - (mx + math.log(sum(math.exp(v - mx) for v in z.values()))))
        return s / len(lodds)

    gr = (math.sqrt(5) - 1) / 2
    a, b = math.log(0.05), math.log(20.0)
    c, d = b - gr * (b - a), a + gr * (b - a)
    for _ in range(80):
        if nll(c) < nll(d):
            b = d
        else:
            a = c
        c, d = b - gr * (b - a), a + gr * (b - a)
    return round(math.exp((a + b) / 2), 4)


def apply_temperature(pv, T, labels):
    lg = {k: math.log(max(pv[k], 1e-9)) / T for k in labels if k in pv}
    mx = max(lg.values())
    ex = {k: math.exp(v - mx) for k, v in lg.items()}
    s = sum(ex.values())
    return {k: v / s for k, v in ex.items()}


_INDEX_CACHE = {}


def boot_index_table(n, reps):
    if (n, reps) not in _INDEX_CACHE:
        s, table = SEED, []
        for _ in range(reps):
            row = []
            for _ in range(n):
                s = (1103515245 * s + 12345) & 0x7FFFFFFF
                row.append((s >> 7) % n)
            table.append(row)
        _INDEX_CACHE[(n, reps)] = table
    return _INDEX_CACHE[(n, reps)]


def rule_predict(signal, turn):
    for label, keys in RULES.get(signal, []):
        if any(k in turn for k in keys):
            return label
    return None


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def sha256_file(path):
    with open(path, "rb") as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def display_path(path):
    """Repo-relative when it lives in the repo; absolute as-is otherwise (a temp
    fixture on another drive has no relative form and must not crash the scorer)."""
    try:
        rel = os.path.relpath(path, HERE)
    except ValueError:
        return path.replace("\\", "/")
    return rel.replace("\\", "/") if not rel.startswith("..") else path.replace("\\", "/")


# ------------------------------------------------------------------ F1 loading
def resolve_prediction_file(model, split, condition, index_path=None, override=None):
    """Return (path, index_entry, problems). Never guesses legacy filenames."""
    if override:
        return override, {"explicit_override": True}, []
    ip = index_path or os.path.join(HERE, "results", "raw", "run-index.json")
    if not os.path.exists(ip):
        return None, None, [f"no run index at {ip}: predictions must be registered by the runner"]
    idx = load_json(ip)
    hits = [e for k, e in idx.get("runs", {}).items()
            if e.get("model") == model and e.get("split") == split and e.get("condition") == condition]
    if not hits:
        return None, None, [f"run index has no entry for {model}/{split}/{condition}; "
                            f"run scripts/run_bench_v3.py first (the pilot raw files are not "
                            f"consumed implicitly)"]
    latest = hits[-1]
    path = os.path.join(HERE, latest["path"])
    if not os.path.exists(path):
        return None, None, [f"indexed file missing: {latest['path']}"]
    got = sha256_file(path)
    if got != latest.get("sha256"):
        return None, None, [f"indexed file hash changed: {latest['path']} index={latest.get('sha256')} actual={got}"]
    return path, latest, []


def load_preds(path, model, split, condition, planned_ids):
    by, problems = defaultdict(dict), []
    if not os.path.exists(path):
        return by, [f"prediction file missing: {path}"]
    with open(path, encoding="utf-8") as fh:
        for ln, line in enumerate(fh, 1):
            if not line.strip():
                continue
            tag = f"{os.path.basename(path)}:{ln}"
            try:
                r = json.loads(line)
            except (ValueError, TypeError):
                problems.append(f"{tag} malformed prediction JSON")
                continue
            if not isinstance(r, dict) or not isinstance(r.get("sid"), str):
                problems.append(f"{tag} prediction must be an object with a string sid")
                continue
            for field, want in (("model", model), ("split", split), ("condition", condition)):
                if r.get(field) != want:
                    problems.append(f"{tag} {field}={r.get(field)!r} but invoked with {want!r}")
            if r.get("signal") not in SIGNALS:
                problems.append(f"{tag} unknown signal {r.get('signal')!r}")
                continue
            if r.get("sid") not in planned_ids:
                problems.append(f"{tag} sid {r['sid']} is not in the planned scenario set")
                continue
            key = (r["sid"], r["signal"])
            if key[1] in by.get(key[0], {}):
                problems.append(f"{tag} DUPLICATE prediction for {key}")
                continue
            by[key[0]][key[1]] = r
    # absent planned items are expected only if the runner recorded them as failures
    for sid in planned_ids:
        for sig in SIGNALS:
            if sid not in by or sig not in by[sid]:
                problems.append(f"MISSING prediction row for {sid}/{sig} in {os.path.basename(path)}")
    return by, problems


def check_probs(by):
    problems = []
    specs = load_questions(os.path.join(HERE, "question-templates.json"))["signals"]
    for sid, sigs in by.items():
        for sig, r in sigs.items():
            if r.get("predicted") is None and not r.get("predict_error"):
                problems.append(f"{sid}/{sig} neither a prediction nor a recorded error")
            if r.get("predicted") is not None and r["predicted"] not in specs[sig]["canonical_order"]:
                problems.append(f"{sid}/{sig} illegal predicted label {r['predicted']!r}")
            pv = r.get("probs")
            if pv is not None:
                if not isinstance(pv, dict) or not pv:
                    problems.append(f"{sid}/{sig} probabilities malformed")
                    continue
                if set(pv) != set(specs[sig]["canonical_order"]):
                    problems.append(f"{sid}/{sig} probability label keys differ from the canonical set")
                invalid = False
                for k, v in pv.items():
                    if type(v) not in (int, float) or not math.isfinite(v) or v < 0 or v > 1:
                        invalid = True
                        problems.append(f"{sid}/{sig} non-finite or out-of-range probability {k}={v!r}")
                if not invalid and abs(sum(pv.values()) - 1.0) > 0.02:
                    problems.append(f"{sid}/{sig} probabilities do not sum to 1 ({sum(pv.values()):.4f})")
            for field in ("confidence", "answer_confidence"):
                c = r.get(field)
                if c is not None and (type(c) not in (int, float) or not math.isfinite(c) or not 0 <= c <= 1):
                    problems.append(f"{sid}/{sig} illegal {field} {c!r}")
    return problems


def gold_map_for(split, gold_path):
    if split == "final":
        if not gold_path:
            raise ValueError("final scoring requires --gold pointing at the sealed answer file")
        want = load_json(os.path.join(HERE, "seal-record-v2.json"))["gold_final_sha256"]
        got = sha256_file(gold_path)
        if got != want:
            raise ValueError(f"sealed gold sha256 mismatch: got {got} expected {want}")
        out = {}
        for line in open(gold_path, encoding="utf-8"):
            if line.strip():
                r = json.loads(line)
                if r["sid"] in out:
                    raise ValueError(f"duplicate gold sid {r['sid']}")
                out[r["sid"]] = r["labels"]
        return out
    return {r["sid"]: r["labels"] for r in rows_for(HERE, split)}


# ------------------------------------------------------------------ F2 gate
def verify_freeze_gate(root, rows, model, condition, split, plan, gate_path=None):
    """Strict, fail-closed gate. Returns a list of refusal reasons."""
    errs = []
    gp = gate_path or os.path.join(root, "freeze-gate.json")
    if not os.path.exists(gp):
        return [f"freeze gate file absent: {os.path.basename(gp)}"]
    gate = load_json(gp)
    if gate.get("schema") != "e1r2-freeze-gate-v1":
        errs.append(f"gate schema {gate.get('schema')!r} is not 'e1r2-freeze-gate-v1'")
    if gate.get("status") != "frozen":
        errs.append(f"gate status is {gate.get('status')!r}, not 'frozen'")
    if gate.get("split") != split:
        errs.append(f"gate was frozen for split {gate.get('split')!r}, not {split!r}")

    br = gate.get("blind_review")
    if not isinstance(br, dict):
        errs.append("blind_review block missing")
        br = {}
    revs = br.get("reviewers")
    if not isinstance(revs, list) or len(revs) < 2:
        errs.append("needs at least two reviewer records")
        revs = []
    ids = [r.get("id") for r in revs if isinstance(r, dict)]
    if any(not isinstance(i, str) or not i.strip() for i in ids) or len(set(ids)) != len(ids):
        errs.append("reviewer ids must be non-empty and distinct")
    def check_receipt(record, field):
        path = record.get(field + "_path")
        expected = record.get(field + "_sha256")
        if not isinstance(path, str) or not path:
            errs.append(f"{field} receipt path missing")
            return None
        path = os.path.join(root, path)
        if not os.path.isfile(path) or sha256_file(path) != expected:
            errs.append(f"{field} receipt is missing or its actual hash differs")
            return None
        return path
    for r in revs:
        if not isinstance(r, dict):
            errs.append("reviewer record is not an object")
            continue
        for k, why in (("independent", "independence"), ("no_gold_exposure_attested", "no-answer-exposure"),
                       ("no_cross_reviewer_communication_attested", "no-mutual-visibility")):
            if r.get(k) is not True:
                errs.append(f"reviewer {r.get('id')!r} {why} must be exactly true (got {r.get(k)!r})")
        for k in ("answers_sha256", "disclosure_sha256", "covered_tokens", "planned_tokens"):
            if k not in r:
                errs.append(f"reviewer {r.get('id')!r} missing {k}")
        ct, pt = r.get("covered_tokens"), r.get("planned_tokens")
        if type(ct) is not int or type(pt) is not int or ct != pt or pt != len(rows):
            errs.append(f"reviewer {r.get('id')!r} covered {ct} of {pt} planned tokens")
        answers = check_receipt(r, "answers")
        check_receipt(r, "disclosure")
        if answers:
            try:
                with open(answers, encoding="utf-8") as fh:
                    records = [json.loads(line) for line in fh if line.strip()]
                tokens = [x["token"] for x in records]
                if len(tokens) != len(rows) or len(set(tokens)) != len(tokens):
                    errs.append("reviewer actual answer coverage differs from the planned samples")
            except (ValueError, KeyError, TypeError):
                errs.append("reviewer answers cannot verify unique sample coverage")

    adj = gate.get("adjudication")
    if not isinstance(adj, dict):
        errs.append("adjudication block missing")
        adj = {}
    if not (isinstance(adj.get("adjudicator"), str) and adj["adjudicator"].strip()):
        errs.append("adjudicator identity missing")
    if adj.get("non_original_annotator") is not True:
        errs.append("adjudicator must attest explicitly they are not the original annotator")
    if adj.get("completed") is not True:
        errs.append("adjudication receipt not marked completed")
    if not adj.get("receipt_sha256"):
        errs.append("adjudication receipt hash missing")
    check_receipt(adj, "receipt")
    if isinstance(adj.get("adjudicator"), str) and adj["adjudicator"] in ids:
        errs.append("adjudicator may not also be a reviewer")

    frozen = gate.get("frozen_artifacts") or {}
    need_art = ("samples_blind", "question_templates", "label_spec", "config_lock",
                "calibration_lock", "external_gold")
    for k in need_art:
        if k not in frozen:
            errs.append(f"frozen_artifacts missing {k}")
    live = {"samples_blind": os.path.join(root, "samples", "scenarios-final-blind.jsonl"),
            "question_templates": os.path.join(root, "question-templates.json"),
            "label_spec": os.path.join(root, "LABEL_SPEC.md"),
            "config_lock": os.path.join(root, "config.lock.json"),
            "calibration_lock": os.path.join(root, "calibration", "temperature-lock.json")}
    for k, p in live.items():
        if k in frozen:
            if not os.path.exists(p):
                errs.append(f"frozen artifact {k} cannot be verified: {os.path.basename(p)} missing")
            elif frozen[k] != sha256_file(p):
                errs.append(f"frozen artifact {k} no longer matches {os.path.basename(p)}")
    if frozen.get("external_gold") != load_json(
            os.path.join(root, "seal-record-v2.json")).get("gold_final_sha256"):
        errs.append("frozen external gold hash differs from seal-record-v2.json")

    fp = gate.get("frozen_plan") or {}
    if not fp:
        errs.append("frozen_plan missing: the run configuration was never bound")
    else:
        for field in ("models", "conditions"):
            values = fp.get(field)
            if not isinstance(values, list) or not values or any(not isinstance(x, str) or not x for x in values) or len(values) != len(set(values)):
                errs.append(f"frozen plan {field} must be a non-empty unique string list")
        if model not in (fp.get("models") or []):
            errs.append(f"model {model!r} is not in the pre-registered model set {fp.get('models')}")
        if condition not in (fp.get("conditions") or []):
            errs.append(f"condition {condition!r} is not in the pre-registered condition set {fp.get('conditions')}")
        for k, want in (("max_len", plan.get("max_len")), ("head_max_len", plan.get("head_max_len")),
                        ("truncation_policy", "oldest_history_then_boundary_outside_window"),
                        ("device", plan.get("device"))):
            if k in fp and fp[k] != want:
                errs.append(f"frozen plan {k}={fp[k]!r} but invoked with {want!r}")
            if k not in fp:
                errs.append(f"frozen plan missing {k}")
        scope = fp.get("scenario_count")
        if type(scope) is not int or scope != len(rows):
            errs.append(f"frozen scenario_count {scope} != {len(rows)} rows in the blind file")
        if "limit" not in fp or type(fp["limit"]) is not int or fp.get("limit") != plan.get("limit"):
            errs.append(f"frozen plan limit={fp.get('limit')!r} but invoked with --limit {plan.get('limit')!r}")

    journal_p = os.path.join(root, "results", "final-run-journal.json")
    if os.path.exists(journal_p):
        jr = load_json(journal_p)
        for entry in jr.get("runs", []):
            if entry.get("model") == model and entry.get("condition") == condition:
                expected = plan.get("predictions_sha256")
                if not expected or entry.get("predictions_sha256") != expected:
                    errs.append("final run already opened: only identical prediction scoring is allowed")
    return errs


def journal_final_run(root, model, condition, pred_hash):
    p = os.path.join(root, "results", "final-run-journal.json")
    jr = load_json(p) if os.path.exists(p) else {"final_split_opened_before": False, "runs": []}
    jr["final_split_opened_before"] = True
    existing = next((e for e in jr["runs"] if e.get("model") == model and e.get("condition") == condition), None)
    if existing:
        if existing.get("predictions_sha256") is None and pred_hash is not None:
            existing["predictions_sha256"] = pred_hash
        elif existing.get("predictions_sha256") != pred_hash:
            raise ValueError("final prediction artifact cannot be replaced for an opened run")
    else:
        jr["runs"].append({"model": model, "condition": condition, "predictions_sha256": pred_hash,
                           "at": datetime.datetime.now().astimezone().isoformat(timespec="seconds")})
    with open(p, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(jr, fh, ensure_ascii=False, indent=1)


# ------------------------------------------------------------------ scoring
def score_signal(spec, rows, gold_map, preds, integrity):
    labels = spec["canonical_order"]
    abstain = ABSTAIN[spec["_name"]]
    got = []
    for r in rows:
        sid = r["sid"]
        g = gold_map[sid][spec["_name"]]
        rec = preds.get(sid, {}).get(spec["_name"])
        if rec is None:
            got.append((sid, g, MISSING, None, None))
            integrity.append(f"{sid}/{spec['_name']} no prediction row at all")
            continue
        p = rec.get("predicted")
        if rec.get("predict_error") or p is None:
            got.append((sid, g, MISSING, None, rec))
        elif p not in labels:
            got.append((sid, g, ILLEGAL, None, rec))
        elif rec.get("excluded_from_formal_scoring") or rec.get("requires_relabel") or (rec.get("input_report") or {}).get("requires_relabel"):
            got.append((sid, g, "__EXCLUDED_RELABEL__", None, rec))
        else:
            got.append((sid, g, p, rec.get("probs"), rec))
    gold_v = [x[1] for x in got]
    pred_v = [x[2] for x in got]
    planned = len(got)
    returned = [i for i, x in enumerate(got) if x[2] not in (MISSING, ILLEGAL, "__EXCLUDED_RELABEL__")]
    class_set = [lb for lb in labels if gold_v.count(lb) > 0]
    zero_support = [lb for lb in labels if gold_v.count(lb) == 0]
    f1, per_class = macro_f1(gold_v, pred_v, class_set)
    ok = [g == p for g, p in zip(gold_v, pred_v)]
    keep = [i for i in returned if pred_v[i] != abstain]
    pairs_conf = [(got[i][4].get("answer_confidence"), ok[i]) for i in returned]
    entry = {
        "planned_items": planned, "n_returned": len(returned),
        "n_missing": sum(1 for p in pred_v if p == MISSING),
        "n_illegal": sum(1 for p in pred_v if p == ILLEGAL),
        "n_excluded_requires_relabel": sum(1 for p in pred_v if p == "__EXCLUDED_RELABEL__"),
        "run_success_rate": round(len(returned) / planned, 4) if planned else None,
        "accuracy_over_planned": round(accuracy(gold_v, pred_v), 4) if planned else None,
        "macro_f1_over_planned": round(f1, 4) if f1 is not None else None,
        "macro_f1_class_set": class_set, "zero_support_classes_excluded": zero_support,
        "per_class": per_class,
        "accuracy_returned_only": round(accuracy([gold_v[i] for i in returned], [pred_v[i] for i in returned]), 4) if returned else None,
        "abstain_coverage_over_planned": round(sum(1 for p in pred_v if p == abstain) / planned, 4) if planned else None,
        "accepted_subset_error_rate": round(1 - accuracy([gold_v[i] for i in keep], [pred_v[i] for i in keep]), 4) if keep else None,
        "confusion": confusion(gold_v, pred_v, labels),
        "gold_distribution": dict(Counter(gold_v)),
        "brier_returned_only": (lambda v: round(v, 4) if v is not None else None)(
            brier([got[i][3] for i in returned], [gold_v[i] for i in returned], labels)),
        "ece_raw_returned_only": (lambda v: round(v, 4) if v is not None else None)(ece(pairs_conf)),
    }
    if spec["_name"] in HIGH_RISK:
        entry["false_positive"] = {lb: sum(1 for g, p in zip(gold_v, pred_v) if p == lb and g != lb) for lb in labels}
        entry["false_negative"] = {lb: sum(1 for g, p in zip(gold_v, pred_v) if g == lb and p != lb) for lb in labels}
        entry["dangerous_cases"] = [{"sid": s, "gold": g, "pred": p} for s, g, p, _, _ in got if p != g][:12]
    return entry, ok


def integrity_problems(rows, gold_map, qt):
    """Gold and planned scenario ids must match exactly: missing, extra or duplicate
    gold, or an illegal label, fails closed instead of shrinking the denominator."""
    out = []
    planned_ids = {r["sid"] for r in rows}
    if planned_ids != set(gold_map):
        out.append(f"gold/planned id sets differ: only_in_planned="
                   f"{sorted(planned_ids - set(gold_map))[:5]} only_in_gold="
                   f"{sorted(set(gold_map) - planned_ids)[:5]} (denominator may not shrink)")
    if len(rows) != len(planned_ids):
        out.append("duplicate scenario ids in the planned set")
    for sid, labels in gold_map.items():
        if set(labels) != set(SIGNALS):
            out.append(f"{sid} gold signal set {sorted(labels)} != {SIGNALS}")
            continue
        for sig, val in labels.items():
            if sig not in qt["signals"]:
                out.append(f"{sid} unknown gold signal {sig}")
            elif val not in qt["signals"][sig]["canonical_order"]:
                out.append(f"{sid} illegal gold {sig}={val!r}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--regressions", action="store_true", help="run the E1R2 synthetic regression suite")
    ap.add_argument("--models", default="A,B")
    ap.add_argument("--split", default="dev")
    ap.add_argument("--condition", default="primary")
    ap.add_argument("--gold", default=None)
    ap.add_argument("--index", default=None, help="run index path (default results/raw/run-index.json)")
    ap.add_argument("--predictions", default=None, help="explicit prediction file (single model only)")
    ap.add_argument("--fit-calibration", action="store_true")
    ap.add_argument("--gate", default=None)
    ap.add_argument("--max-len", type=int, default=1024)
    ap.add_argument("--head-max-len", type=int, default=256)
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--diagnostic-only", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return selftest()
    if args.regressions:
        import regressions_e1r2
        return regressions_e1r2.run_all()

    qt = load_questions(os.path.join(HERE, "question-templates.json"))
    models = args.models.split(",")
    if args.predictions and len(models) != 1:
        print("--predictions accepts one model only")
        return 3
    if args.predictions and not args.diagnostic_only:
        print("REFUSED: formal scoring requires the run index; --predictions is diagnostic only")
        return 4
    if args.fit_calibration and args.split != "calibration":
        print(f"REFUSED: temperatures/thresholds may only be fitted on the calibration split (got {args.split})")
        return 3

    rows = rows_for(HERE, args.split)
    if args.limit:
        rows = rows[: args.limit]
    try:
        gold_map = gold_map_for(args.split, args.gold)
    except ValueError as exc:
        print("REFUSED:", exc)
        return 5

    planned_ids = {r["sid"] for r in rows}
    integrity = integrity_problems(rows, gold_map, qt)

    preds, consumed = {}, {}
    for m in models:
        preds[m] = {}
        path, entry, probs = resolve_prediction_file(m, args.split, args.condition, args.index, args.predictions)
        integrity += probs
        if path is None:
            continue
        by, lp = load_preds(path, m, args.split, args.condition, planned_ids)
        integrity += lp
        integrity += check_probs(by)
        preds[m] = by
        consumed[m] = {"path": display_path(path), "sha256": sha256_file(path),
                       "run_config": (entry or {}).get("config"),
                       "explicit_override": bool(entry and entry.get("explicit_override"))}
    integrity = sorted(set(integrity))
    relabel = [f"{m}:{sid}/{sig}" for m, d in preds.items() for sid, sgs in d.items() for sig, r in sgs.items()
               if r.get("excluded_from_formal_scoring") or r.get("requires_relabel")
               or (r.get("input_report") or {}).get("requires_relabel")]
    if relabel and (not args.diagnostic_only or args.fit_calibration or args.split == "final"):
        integrity.append(f"{len(relabel)} items flagged requires_relabel are present; formal scoring refuses them. "
                         f"Re-review the truncated text or pass --diagnostic-only for a labelled diagnostic run.")

    if integrity:
        os.makedirs(os.path.join(HERE, "results"), exist_ok=True)
        dest = os.path.join(HERE, "results", f"integrity-errors-{args.split}-{args.condition}.json")
        json.dump({"written_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                   "split": args.split, "condition": args.condition, "models": models,
                   "consumed": consumed, "problems": integrity,
                   "scores_published": False, "calibration_lock_written": False},
                  open(dest, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
        print(f"REFUSED: {len(integrity)} integrity problem(s); no scores published, no lock written.")
        for p in integrity[:12]:
            print("  -", p)
        print("wrote", os.path.relpath(dest, HERE))
        return 4

    if args.split == "final":
        plan = {"max_len": args.max_len, "head_max_len": args.head_max_len,
                "device": args.device, "limit": args.limit}
        errs = []
        for m in models:
            config = consumed[m].get("run_config") or {}
            for field in ("max_len", "head_max_len", "device", "limit"):
                if config.get(field) != plan[field]:
                    errs.append(f"indexed run {m} configuration {field} differs from the invoked frozen plan")
            errs += verify_freeze_gate(HERE, rows, m, args.condition, args.split,
                                       dict(plan, predictions_sha256=consumed[m]["sha256"]), args.gate)
        if errs:
            print("REFUSED final:")
            for e in sorted(set(errs)):
                print("  -", e)
            return 5

    if args.fit_calibration:
        lock = {"schema": "e1r2-temperature-lock-v1",
                "fitted_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                "fitted_on_split": "calibration", "condition": args.condition,
                "consumed_predictions": consumed, "run_config": {"max_len": args.max_len,
                                                                  "head_max_len": args.head_max_len,
                                                                  "device": args.device},
                "entries": {}}
        for m in models:
            for signal, spec in qt["signals"].items():
                items = [(preds[m][r["sid"]][signal]["probs"], gold_map[r["sid"]][signal])
                         for r in rows if r["sid"] in preds[m] and signal in preds[m][r["sid"]]
                         and preds[m][r["sid"]][signal].get("probs")]
                lock["entries"].setdefault(m, {})[signal] = {
                    "temperature": fit_temperature(items, spec["canonical_order"]),
                    "n_fit": len(items), "class_set": spec["canonical_order"],
                    "zero_support_classes_excluded": [l for l in spec["canonical_order"]
                                                      if [g for _, g in items].count(l) == 0]}
        os.makedirs(os.path.join(HERE, "calibration"), exist_ok=True)
        dest = os.path.join(HERE, "calibration", "temperature-lock.json")
        json.dump(lock, open(dest, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
        print("wrote", os.path.relpath(dest, HERE), "sha256", sha256_file(dest)[:16])
        return 0

    cal_lock = None
    cl = os.path.join(HERE, "calibration", "temperature-lock.json")
    if os.path.exists(cl):
        cal_lock = load_json(cl)
    ml = os.path.join(HERE, "calibration", "majority-lock.json")
    maj_lock = load_json(ml).get("signals") if os.path.exists(ml) else None

    out = {"schema": "e1r2-scores-v1", "split": args.split, "condition": args.condition,
           "planned_scenarios": len(rows), "consumed_predictions": consumed,
           "calibration_lock": ({"sha256": sha256_file(cl), "fitted_on_split": cal_lock.get("fitted_on_split"),
                                 "consumed_predictions": cal_lock.get("consumed_predictions")}
                                if cal_lock else None),
           "models": {}, "baselines": {}, "paired": {},
           "integrity_problems": [], "requires_relabel_excluded": relabel}
    if args.split == "final":
        for m in models:
            journal_final_run(HERE, m, args.condition, consumed[m]["sha256"])

    for signal, spec in qt["signals"].items():
        spec = dict(spec, _name=signal)
        vectors = {}
        for m in models:
            entry, ok = score_signal(spec, rows, gold_map, preds[m], out.setdefault("unexpected", []))
            if cal_lock and m in cal_lock.get("entries", {}):
                T = cal_lock["entries"][m][signal].get("temperature")
                pairs = []
                for r in rows:
                    rec = preds[m].get(r["sid"], {}).get(signal) or {}
                    if not rec.get("probs"):
                        continue
                    q = apply_temperature(rec["probs"], T, spec["canonical_order"])
                    best = max(q, key=q.get)
                    pairs.append((q[best], best == gold_map[r["sid"]][signal]))
                entry["temperature_applied"] = T
                entry["ece_calibrated_applied"] = (lambda v: round(v, 4) if v is not None else None)(ece(pairs))
                entry["ece_scope_note"] = ("out-of-sample" if args.split != cal_lock.get("fitted_on_split")
                                           else "IN-SAMPLE: the scored split is the fitting split, not evidence")
            out["models"].setdefault(m, {})[signal] = entry
            vectors[m] = ok
        gold_v = [gold_map[r["sid"]][signal] for r in rows]
        maj = Counter(gold_v).most_common(1)[0][0] if gold_v else None
        b = {"planned": len(gold_v), "chance_level": round(1 / len(spec["canonical_order"]), 4),
             "oracle_majority_label": maj,
             "oracle_majority_accuracy": round(accuracy(gold_v, [maj] * len(gold_v)), 4) if maj else None,
             "random_expected_accuracy": round(sum((c / len(gold_v)) ** 2 for c in Counter(gold_v).values()), 4) if gold_v else None}
        if maj_lock and signal in maj_lock:
            b["locked_majority_label"] = maj_lock[signal]["label"]
            b["locked_majority_accuracy"] = round(accuracy(gold_v, [maj_lock[signal]["label"]] * len(gold_v)), 4)
            b["locked_majority_source"] = "calibration/majority-lock.json chosen on dev"
        rf = rc = 0
        for r in rows:
            p = rule_predict(signal, r["turn"])
            if p is not None:
                rf += 1
                rc += int(p == gold_map[r["sid"]][signal])
        b.update(rule_fires=rf, rule_coverage=round(rf / len(gold_v), 4) if gold_v else None,
                 rule_accuracy_when_fires=round(rc / rf, 4) if rf else None)
        out["baselines"][signal] = b

        for i, ma in enumerate(models):
            for mb in models[i + 1:]:
                ga, gb = vectors[ma], vectors[mb]
                n = len(ga)
                if n and n == len(gb):
                    diffs = sorted(sum(ga[j] for j in row) / n - sum(gb[j] for j in row) / n
                                   for row in boot_index_table(n, BOOT_REPS))
                    out["paired"].setdefault(f"{ma}-vs-{mb}", {})[signal] = {
                        "point_estimate": round(sum(ga) / n - sum(gb) / n, 4),
                        "ci95": [round(diffs[int(0.025 * BOOT_REPS)], 4), round(diffs[int(0.975 * BOOT_REPS)], 4)],
                        "planned_items": n, "reps": BOOT_REPS,
                        "indistinguishable": diffs[int(0.025 * BOOT_REPS)] <= 0 <= diffs[int(0.975 * BOOT_REPS)]}

    tag = ".diagnostic" if args.diagnostic_only else ""
    dest = os.path.join(HERE, "results", f"scores-{args.split}-{args.condition}.e1r2{tag}.json")
    json.dump(out, open(dest, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    print(f"wrote {os.path.relpath(dest, HERE)}")
    for m in models:
        print(f"--- {m}")
        for s, e in out["models"][m].items():
            bl = out["baselines"][s]
            print(f"  {s:20s} acc={e['accuracy_over_planned']} f1={e['macro_f1_over_planned']} "
                  f"(planned {e['planned_items']}, miss {e['n_missing']}, illegal {e['n_illegal']}) "
                  f"oracle-maj={bl['oracle_majority_accuracy']} locked-maj={bl.get('locked_majority_accuracy')}")
    return 0


# ------------------------------------------------------------------ selftest
def selftest():
    fails = []

    def chk(name, got, want, tol=1e-4):
        ok = (abs(got - want) <= tol) if isinstance(want, float) and isinstance(got, float) else got == want
        print(f"  {'ok ' if ok else 'FAIL'} {name}: got {got} want {want}")
        if not ok:
            fails.append(name)

    spec = dict(load_questions(os.path.join(HERE, "question-templates.json"))["signals"]["social_act"],
                _name="social_act")
    rows = [{"sid": "x1", "turn": "a"}, {"sid": "x2", "turn": "b"}]
    gold = {"x1": {"social_act": "合作"}, "x2": {"social_act": "威胁"}}
    print("F1 denominators")
    preds = {"x1": {"social_act": {"predicted": "合作", "probs": {"合作": .6, "威胁": .4}, "answer_confidence": .6}},
             "x2": {"social_act": {"predict_error": "TIMEOUT", "predicted": None}}}
    integ = []
    e, ok = score_signal(spec, rows, gold, preds, integ)
    chk("timeout_counts_wrong_accuracy", e["accuracy_over_planned"], 0.5)
    chk("run_success_rate", e["run_success_rate"], 0.5)
    chk("returned_only_separate", e["accuracy_returned_only"], 1.0)
    chk("confusion_missing_column", e["confusion"]["威胁"]["__MISSING__"], 1)
    chk("macro_f1_timeout_half", e["macro_f1_over_planned"], 0.5)
    e2, _ = score_signal(spec, rows, gold, {"x1": {"social_act": {"predict_error": "boom"}},
                                            "x2": {"social_act": {"predict_error": "boom"}}}, integ)
    chk("all_failed_zero", e2["accuracy_over_planned"], 0.0)
    e3, _ = score_signal(spec, rows, gold, {"x1": {"social_act": {"predicted": "合作", "probs": {"合作": .6, "威胁": .4},
                                                                 "excluded_from_formal_scoring": True}},
                                            "x2": {"social_act": {"predicted": "威胁", "probs": {"合作": .1, "威胁": .9},
                                                                 "answer_confidence": .9}}}, integ)
    chk("relabel_item_not_scored_correct", e3["accuracy_over_planned"], 0.5)
    chk("relabel_counted_excluded", e3["n_excluded_requires_relabel"], 1)
    chk("relabel_not_in_returned", e3["n_returned"], 1)
    missing_integ = []
    e4, _ = score_signal(spec, [{"sid": "x1", "turn": "a"}], {"x1": {"social_act": "合作"}}, {}, missing_integ)
    chk("absent_row_recorded", len(missing_integ) >= 1, True)
    chk("absent_row_counts_wrong", e4["accuracy_over_planned"], 0.0)
    print("F1/F2 hand values and guards")
    chk("accuracy", accuracy(["a", "a", "b", "b"], ["a", "b", "b", "b"]), 0.75)
    f1, _ = macro_f1(["a", "a", "b", "b"], ["a", "b", "b", "b"], ["a", "b"])
    chk("macro_f1", f1, (2 / 3 + 0.8) / 2)
    chk("brier_all_correct", brier([{"a": 1.0, "b": 0.0}, {"a": 0.0, "b": 1.0}], ["a", "b"], ["a", "b"]), 0.0)
    chk("brier_one_wrong", brier([{"a": 1.0, "b": 0.0}, {"a": 0.0, "b": 1.0}], ["a", "a"], ["a", "b"]), 0.5)
    chk("nan_rejected", brier([{"a": float("nan"), "b": 0.0}], ["a"], ["a", "b"]), None)
    items = [({"a": .99, "b": .01}, "a"), ({"a": .99, "b": .01}, "b"), ({"a": .01, "b": .99}, "a"),
             ({"a": .9, "b": .1}, "b")]
    chk("T>1_when_overconfident", fit_temperature(items, ["a", "b"]) > 1.0, True)
    chk("T_none_on_empty", fit_temperature([], ["a", "b"]), None)
    t1 = boot_index_table(10, 5)
    _INDEX_CACHE.clear()
    chk("bootstrap_deterministic", boot_index_table(10, 5), t1)
    print(f"selftest: {len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
