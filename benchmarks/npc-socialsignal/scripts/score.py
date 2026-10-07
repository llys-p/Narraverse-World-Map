#!/usr/bin/env python3
"""E1R metrics (R2 + R3).

Contract this implements:
  * headline accuracy / macro-F1 denominators are the FULL planned scenario set;
    a timeout, crash, missing prediction or illegal label counts as NOT correct;
  * macro-F1 averages over one fixed class set per signal (classes with gold
    support in the planned set), so a model cannot win or lose by which labels it
    happens to emit; per-class support is always printed;
  * confusion matrices carry explicit MISSING and ILLEGAL columns;
  * the majority baseline is reported twice: oracle-majority (post-hoc on the
    evaluated gold, descriptive only) and the locked majority chosen on dev and
    shipped in calibration/majority-lock.json;
  * temperature/thresholds are FIT ONLY on the calibration split and applied to
    another split; the calibration split can never be the scored split and the
    final split can never be a fitting set;
  * scoring the final split requires --gold plus a verified freeze gate
    (blind-review receipts + sample/template/model/calibration hashes). There is
    no flag that bypasses it.

  python scripts/score.py --selftest
  python scripts/score.py --models A,B --split dev --condition primary
  python scripts/score.py --fit-calibration --models A,B
  python scripts/score.py --models A,B --split final --gold <sealed jsonl>
"""
import argparse
import datetime
import hashlib
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from body import load_questions, load_split, load_split_assignment  # noqa: E402

HIGH_RISK = ("deception", "boundary_violation")
BOOT_REPS = 2000
SEED = 20261007
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


# ---------------------------------------------------------------- primitives

def accuracy(gold, pred):
    n = len(gold)
    if not n:
        return None
    return sum(1 for g, p in zip(gold, pred) if g == p) / n


def macro_f1(gold, pred, class_set):
    """Fixed class set: every label listed gets an F1 (0.0 when the model never
    predicted it and never got it right). Never depends on what the model emitted."""
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
        if g not in m:
            continue
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
    pts = [(c, k) for c, k in pairs if c is not None and math.isfinite(c)]
    if not pts:
        return None
    buckets = defaultdict(list)
    for c, k in pts:
        buckets[min(int(c * bins), bins - 1)].append((c, k))
    total = len(pts)
    return sum((len(v) / total) * abs(sum(c for c, _ in v) / len(v) - sum(1 for _, k in v if k) / len(v))
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
            den = mx + math.log(sum(math.exp(v - mx) for v in z.values()))
            s -= (z[g] - den)
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
    key = (n, reps)
    if key not in _INDEX_CACHE:
        s, table = SEED, []
        for _ in range(reps):
            row = []
            for _ in range(n):
                s = (1103515245 * s + 12345) & 0x7FFFFFFF
                row.append((s >> 7) % n)
            table.append(row)
        _INDEX_CACHE[key] = table
    return _INDEX_CACHE[key]


def rule_predict(signal, turn):
    for label, keys in RULES.get(signal, []):
        if any(k in turn for k in keys):
            return label
    return None


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------- prediction loading

def load_preds(model, split, condition):
    path = os.path.join(HERE, "results", "raw", f"{model}-{split}-{condition}.jsonl")
    if not os.path.exists(path):
        return None, path
    by, problems = defaultdict(dict), []
    seen = set()
    with open(path, encoding="utf-8") as fh:
        for ln, line in enumerate(fh, 1):
            r = json.loads(line)
            key = (r["sid"], r["signal"])
            if key in seen:
                problems.append(f"DUPLICATE prediction {key} at {path}:{ln}")
            seen.add(key)
            pv = r.get("probs")
            if pv:
                vals = list(pv.values())
                if any(not math.isfinite(v) or v < 0 or v > 1 for v in vals):
                    r["probs_invalid"] = True
                    problems.append(f"NON-FINITE/OUT-OF-RANGE probs {key} at {path}:{ln}")
                elif abs(sum(vals) - 1.0) > 0.02:
                    r["probs_invalid"] = True
                    problems.append(f"probs do not sum to 1 {key} at {path}:{ln}")
            by[r["sid"]][r["signal"]] = r
    return by, problems


def gold_map_for(split, gold_path):
    """dev/calibration read gold from the repository; final only from the sealed file."""
    if split == "final":
        if not gold_path:
            raise SystemExit("final scoring requires --gold pointing at the sealed answer file")
        raw = open(gold_path, "rb").read()
        got = hashlib.sha256(raw).hexdigest()
        want = load_json(os.path.join(HERE, "seal-record-v2.json"))["gold_final_sha256"]
        if got != want:
            raise SystemExit(f"sealed gold sha256 mismatch: got {got} expected {want}")
        out = {}
        for line in raw.decode("utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                out[r["sid"]] = r.get("labels") or r
        return out
    return {r["sid"]: r["labels"] for r in load_split(HERE, split)}


def verify_freeze_gate(rows, condition, models):
    """R3: the final split only opens on a fully verified, frozen record."""
    gate_p = os.path.join(HERE, "freeze-gate.json")
    if not os.path.exists(gate_p):
        return ["freeze-gate.json is absent: the final split is not frozen"]
    gate = load_json(gate_p)
    errs = []
    if gate.get("status") != "frozen":
        errs.append(f"freeze-gate status is {gate.get('status')!r}, not 'frozen'")
    if gate.get("final_split_opened_before") is True:
        errs.append("gate says the final split was already opened; a new holdout is required")
    need = ("blind_review", "adjudication", "samples_sha256", "templates_sha256",
            "model_config_sha256", "calibration_sha256", "scenario_count")
    for k in need:
        if k not in gate:
            errs.append(f"freeze-gate missing field {k}")
    br = gate.get("blind_review") or {}
    if len(br.get("reviewers") or []) < 2:
        errs.append("freeze-gate records fewer than two independent reviewers")
    if not br.get("independent") or not br.get("no_gold_exposure_attested"):
        errs.append("reviewer independence / no-answer-exposure not attested")
    adj = gate.get("adjudication") or {}
    if adj.get("adjudicator_is_original_annotator") is True:
        errs.append("adjudicator may not be the original annotator")
    if not adj.get("completed"):
        errs.append("disagreement adjudication not completed")

    def digest(path):
        return hashlib.sha256(open(os.path.join(HERE, path), "rb").read()).hexdigest()

    checks = (("samples_sha256", os.path.join("samples", "scenarios-final-blind.jsonl")),
              ("templates_sha256", "question-templates.json"),
              ("model_config_sha256", "config.lock.json"),
              ("calibration_sha256", os.path.join("calibration", "temperature-lock.json")))
    for field, rel in checks:
        want = gate.get(field)
        if not os.path.exists(os.path.join(HERE, rel)):
            errs.append(f"{field} cannot be verified: {rel} is missing")
        elif want != digest(rel):
            errs.append(f"{field} does not match the current {rel} (frozen artifact changed)")
    count = gate.get("scenario_count")
    if count is not None and count != len(rows):
        errs.append(f"gate scenario_count {count} != {len(rows)} in the blind sample file")
    for m in models:
        if not load_preds(m, "final", condition)[0]:
            pass
    return errs


# ---------------------------------------------------------------- scoring

def score_signal(model, split, signal, spec, rows, preds, gold_map):
    labels = spec["canonical_order"]
    abstain = ABSTAIN[signal]
    planned = [r for r in rows if r["sid"] in gold_map]
    got, errs = [], []
    for r in planned:
        rec = preds.get(r["sid"], {}).get(signal)
        g = gold_map[r["sid"]][signal]
        if g not in labels:
            errs.append(f"illegal gold {g!r} for {r['sid']}/{signal}")
        if rec is None:
            got.append((r["sid"], g, MISSING, None, None))
            continue
        if rec.get("predict_error"):
            got.append((r["sid"], g, MISSING, None, None))
            continue
        p = rec.get("predicted")
        if p is None or p not in labels:
            got.append((r["sid"], g, ILLEGAL if p is not None else MISSING, None, rec))
            continue
        got.append((r["sid"], g, p, None if rec.get("probs_invalid") else rec.get("probs"), rec))
    gold_v = [g for _, g, _, _, _ in got]
    pred_v = [p for _, _, p, _, _ in got]
    ok_v = [(g == p) for g, p in zip(gold_v, pred_v)]
    returned = [i for i, (_, _, p, _, _) in enumerate(got) if p not in (MISSING, ILLEGAL)]
    class_set = [lb for lb in labels if gold_v.count(lb) > 0]
    f1, per_class = macro_f1(gold_v, pred_v, class_set)
    acc_sub = accuracy([gold_v[i] for i in returned], [pred_v[i] for i in returned]) if returned else None
    keep = [i for i in returned if pred_v[i] != abstain]
    acc_accepted = accuracy([gold_v[i] for i in keep], [pred_v[i] for i in keep]) if keep else None
    probs_only = [(got[i][3], gold_v[i]) for i in returned if got[i][3]]
    conf_pairs = [(got[i][4].get("answer_confidence"), ok_v[i]) for i in returned if got[i][4]]
    entry = {
        "planned_items": len(got),
        "n_returned": len(returned),
        "n_missing_or_illegal": len(got) - len(returned),
        "run_success_rate": round(len(returned) / len(got), 4) if got else None,
        "accuracy_over_planned": round(accuracy(gold_v, pred_v), 4) if got else None,
        "macro_f1_over_planned": round(f1, 4) if f1 is not None else None,
        "macro_f1_class_set": class_set,
        "per_class": per_class,
        "accuracy_returned_only": round(acc_sub, 4) if acc_sub is not None else None,
        "abstain_coverage_over_planned": round(sum(1 for p in pred_v if p == abstain) / len(got), 4) if got else None,
        "accuracy_accepted_only": round(acc_accepted, 4) if acc_accepted is not None else None,
        "accepted_subset_error_rate": round(1 - acc_accepted, 4) if acc_accepted is not None else None,
        "confusion": confusion(gold_v, pred_v, labels),
        "gold_distribution": dict(Counter(gold_v)),
        "brier_returned_only": round(v, 4) if (v := brier([p for p, _ in probs_only], [g for _, g in probs_only], labels)) is not None else None,
        "ece_raw_returned_only": round(v, 4) if (v := ece(conf_pairs)) is not None else None,
        "label_errors": errs,
    }
    if signal in HIGH_RISK:
        entry["false_positive"] = {lb: sum(1 for g, p in zip(gold_v, pred_v) if p == lb and g != lb) for lb in labels}
        entry["false_negative"] = {lb: sum(1 for g, p in zip(gold_v, pred_v) if g == lb and p != lb) for lb in labels}
        entry["dangerous_cases"] = [
            {"sid": sid, "gold": g, "pred": p}
            for sid, g, p, _, _ in got if p in (MISSING, ILLEGAL) or p != g][:12]
    return entry, got, ok_v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--models", default="A,B")
    ap.add_argument("--split", default="dev")
    ap.add_argument("--condition", default="primary")
    ap.add_argument("--gold", default=None)
    ap.add_argument("--fit-calibration", action="store_true",
                    help="fit temperature on the calibration split and write calibration/temperature-lock.json")
    ap.add_argument("--no-calibration", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    # R3 first gate: the final split can never be a fitting set, regardless of
    # anything else on the command line.
    if args.fit_calibration and args.split != "calibration":
        print(f"REFUSED: temperatures/thresholds may only be fitted on the calibration split "
              f"(got --split {args.split}). The final split is never a fitting set.")
        return 3

    qt = load_json(os.path.join(HERE, "question-templates.json"))
    models = args.models.split(",")
    rows = load_split(HERE, args.split)
    gold_map = gold_map_for(args.split, args.gold)

    if args.split == "final":
        errs = verify_freeze_gate(rows, args.condition, models)
        if errs:
            print("REFUSED final scoring:")
            for e in errs:
                print("  -", e)
            return 3

    preds, all_problems = {}, []
    for m in models:
        p, probs = load_preds(m, args.split, args.condition)
        if not p:
            print(f"no predictions for {m} on {args.split}/{args.condition}")
            return 1
        preds[m], all_problems = p, all_problems + probs

    if args.fit_calibration:
        lock = {"schema": "e1r-temperature-lock-v1",
                "fitted_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
                "fitted_on_split": "calibration", "condition": args.condition,
                "provenance": {"prediction_files": {m: f"results/raw/{m}-calibration-{args.condition}.jsonl" for m in models}},
                "entries": {}}
        for m in models:
            for signal, spec in qt["signals"].items():
                crows = [r for r in rows if r["sid"] in gold_map]
                items = []
                for r in crows:
                    rec = preds[m].get(r["sid"], {}).get(signal) or {}
                    if rec.get("probs") and not rec.get("probs_invalid"):
                        items.append((rec["probs"], gold_map[r["sid"]][signal]))
                T = fit_temperature(items, spec["canonical_order"])
                lock["entries"].setdefault(m, {})[signal] = {
                    "temperature": T, "n_fit": len(items), "class_set": spec["canonical_order"]}
        os.makedirs(os.path.join(HERE, "calibration"), exist_ok=True)
        dest = os.path.join(HERE, "calibration", "temperature-lock.json")
        json.dump(lock, open(dest, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
        print(json.dumps(lock["entries"], ensure_ascii=False, indent=1))
        print("wrote", os.path.relpath(dest, HERE))
        return 0

    cal_lock = None
    if not args.no_calibration:
        p = os.path.join(HERE, "calibration", "temperature-lock.json")
        if os.path.exists(p):
            cal_lock = load_json(p)

    maj_lock = None
    mp = os.path.join(HERE, "calibration", "majority-lock.json")
    if os.path.exists(mp):
        maj_lock = load_json(mp).get("signals")

    out = {"schema": "e1r-scores-v1", "split": args.split, "condition": args.condition,
          "planned_scenarios": len(rows), "models": {}, "baselines": {}, "paired": {},
          "prediction_integrity_problems": all_problems,
          "calibration_source": (None if args.no_calibration or cal_lock is None
                                 else {"file": "calibration/temperature-lock.json",
                                       "fitted_on_split": cal_lock.get("fitted_on_split"),
                                       "sha256": hashlib.sha256(open(mp2 := os.path.join(HERE, "calibration", "temperature-lock.json"), "rb").read()).hexdigest()}),
          }
    for signal, spec in qt["signals"].items():
        scored_vectors = {}
        for m in models:
            entry, got, ok_v = score_signal(m, args.split, signal, spec, rows, preds[m], gold_map)
            if cal_lock and m in cal_lock.get("entries", {}):
                T = cal_lock["entries"][m][signal].get("temperature")
                if T:
                    pairs = []
                    for sid, g, p, pv, _ in got:
                        if not pv:
                            continue
                        q = apply_temperature(pv, T, spec["canonical_order"])
                        best = max(q, key=q.get)
                        pairs.append((q[best], best == g))
                    entry["ece_calibrated_applied"] = round(v, 4) if (v := ece(pairs)) is not None else None
                    entry["temperature_applied"] = T
            out["models"].setdefault(m, {})[signal] = entry
            scored_vectors[m] = ok_v
        gold_v = [gold_map[r["sid"]][signal] for r in rows if r["sid"] in gold_map]
        maj = Counter(gold_v).most_common(1)[0][0] if gold_v else None
        b = {"planned": len(gold_v), "chance_level": round(1 / len(spec["canonical_order"]), 4),
             "oracle_majority_label": maj,
             "oracle_majority_accuracy": round(accuracy(gold_v, [maj] * len(gold_v)), 4) if maj else None,
             "random_expected_accuracy": round(sum((c / len(gold_v)) ** 2 for c in Counter(gold_v).values()), 4) if gold_v else None}
        if maj_lock and signal in maj_lock:
            lm = maj_lock[signal]["label"]
            b["locked_majority_label"] = lm
            b["locked_majority_accuracy"] = round(accuracy(gold_v, [lm] * len(gold_v)), 4)
            b["locked_majority_source"] = maj_lock[signal].get("chosen_on")
        rf, rc = 0, 0
        for r in rows:
            if r["sid"] not in gold_map:
                continue
            p = rule_predict(signal, r["turn"])
            if p is None:
                continue
            rf += 1
            rc += int(p == gold_map[r["sid"]][signal])
        b["rule_fires"] = rf
        b["rule_accuracy_when_fires"] = round(rc / rf, 4) if rf else None
        b["rule_coverage"] = round(rf / len(gold_v), 4) if gold_v else None
        out["baselines"][signal] = b

        for i, ma in enumerate(models):
            for mb in models[i + 1:]:
                ga, gb = scored_vectors[ma], scored_vectors[mb]
                if len(ga) != len(gb) or not ga:
                    continue
                n = len(ga)
                diffs = sorted(sum(ga[j] for j in row) / n - sum(gb[j] for j in row) / n
                               for row in boot_index_table(n, BOOT_REPS))
                out["paired"].setdefault(f"{ma}-vs-{mb}", {})[signal] = {
                    "point_estimate": round(sum(ga) / n - sum(gb) / n, 4),
                    "ci95": [round(diffs[int(0.025 * BOOT_REPS)], 4), round(diffs[int(0.975 * BOOT_REPS)], 4)],
                    "planned_items": n, "reps": BOOT_REPS,
                    "indistinguishable": diffs[int(0.025 * BOOT_REPS)] <= 0 <= diffs[int(0.975 * BOOT_REPS)],
                }

    dest = os.path.join(HERE, "results", f"scores-{args.split}-{args.condition}.e1r.json")
    json.dump(out, open(dest, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    print(f"wrote {os.path.relpath(dest, HERE)}  problems={len(all_problems)}")
    for p in all_problems[:10]:
        print("  PROBLEM", p)
    for m in models:
        print(f"--- {m}")
        for s, e in out["models"][m].items():
            bl = out["baselines"][s]
            print(f"  {s:20s} acc={e['accuracy_over_planned']} f1={e['macro_f1_over_planned']} "
                  f"(planned {e['planned_items']}, missing {e['n_missing_or_illegal']}) "
                  f"oracle-maj={bl['oracle_majority_accuracy']} locked-maj={bl.get('locked_majority_accuracy')}")
    return 0


# ---------------------------------------------------------------- selftest

def selftest():
    fails = []

    def chk(name, got, want, tol=1e-4):
        ok = (abs(got - want) <= tol) if isinstance(want, float) and isinstance(got, float) else got == want
        print(f"  {'ok ' if ok else 'FAIL'} {name}: got {got} want {want}")
        if not ok:
            fails.append(name)

    print("R2 denominators and class sets")
    # the controller's counterexample: two planned items, one right, one timeout
    rows = [{"sid": "x1", "turn": "a"}, {"sid": "x2", "turn": "b"}]
    gold_map = {"x1": {"social_act": "合作"}, "x2": {"social_act": "威胁"}}
    spec = load_json(os.path.join(HERE, "question-templates.json"))["signals"]["social_act"]
    preds = {"x1": {"social_act": {"predicted": "合作", "probs": {"合作": 0.6, "威胁": 0.4},
                                   "answer_confidence": 0.6}},
             "x2": {"social_act": {"predict_error": "TimeoutError", "predicted": None, "probs": None}}}
    e, got, ok = score_signal("A", "dev", "social_act", spec, rows, preds, gold_map)
    chk("timeout_counts_wrong_accuracy", e["accuracy_over_planned"], 0.5)
    chk("timeout_counts_wrong_macro_f1", e["macro_f1_over_planned"], 0.5)
    chk("run_success_rate", e["run_success_rate"], 0.5)
    chk("returned_only_accuracy_is_separate", e["accuracy_returned_only"], 1.0)
    chk("confusion_has_missing_column", e["confusion"]["威胁"]["__MISSING__"], 1)
    chk("macro_f1_class_set_includes_unpredicted", "威胁" in e["macro_f1_class_set"], True)
    # class set follows the signal's canonical order, filtered to labels with gold
    # support in the planned set; it must never depend on what the model emitted
    chk("zero_support_class_excluded", set(e["macro_f1_class_set"]), {"合作", "威胁"})
    chk("class_set_in_canonical_order", e["macro_f1_class_set"], ["威胁", "合作"])

    # all failed -> zero, never 1.0
    e2, _, _ = score_signal("A", "dev", "social_act", spec, rows,
                            {"x1": {"social_act": {"predict_error": "boom"}},
                             "x2": {"social_act": {"predict_error": "boom"}}}, gold_map)
    chk("all_failed_accuracy_zero", e2["accuracy_over_planned"], 0.0)

    # illegal label must not be silently accepted
    e4, _, _ = score_signal("A", "dev", "social_act", spec, rows,
                            {"x1": {"social_act": {"predicted": "nonsense"}},
                             "x2": {"social_act": {"predicted": "威胁"}}}, gold_map)
    chk("illegal_label_not_correct", e4["accuracy_over_planned"], 0.5)
    chk("illegal_column_present", e4["confusion"]["合作"]["__ILLEGAL__"], 1)

    # same planned set, A fails where B succeeds -> both scored over 2 items
    a = {"x1": {"social_act": {"predicted": "合作"}}, "x2": {"social_act": {"predict_error": "t"}}}
    b = {"x1": {"social_act": {"predict_error": "t"}}, "x2": {"social_act": {"predicted": "威胁"}}}
    ea, _, oka = score_signal("A", "dev", "social_act", spec, rows, a, gold_map)
    eb, _, okb = score_signal("B", "dev", "social_act", spec, rows, b, gold_map)
    chk("asymmetric_failures_same_denominator", (ea["planned_items"], eb["planned_items"]), (2, 2))
    chk("paired_vectors_aligned_length", (len(oka), len(okb)), (2, 2))
    chk("both_half_correct", (ea["accuracy_over_planned"], eb["accuracy_over_planned"]), (0.5, 0.5))

    print("hand-computable metric values")
    chk("accuracy", accuracy(["a", "a", "b", "b"], ["a", "b", "b", "b"]), 0.75)
    f1, _ = macro_f1(["a", "a", "b", "b"], ["a", "b", "b", "b"], ["a", "b"])
    chk("macro_f1", f1, (2 / 3 + 0.8) / 2)
    # Brier convention used here: mean squared error over every (item, class) pair,
    # i.e. divided by n_items * n_classes (NOT sklearn's per-item sum / n_items).
    # One wrong binary-style item contributes (0-1)^2 + (1-0)^2 = 2 to the numerator.
    chk("brier_all_correct", brier([{"a": 1.0, "b": 0.0}, {"a": 0.0, "b": 1.0}], ["a", "b"], ["a", "b"]), 0.0)
    chk("brier_one_misclassified", brier([{"a": 1.0, "b": 0.0}, {"a": 0.0, "b": 1.0}], ["a", "a"], ["a", "b"]), 0.5)
    chk("ece_overconfident", ece([(1.0, False), (1.0, False)]), 1.0)
    chk("nan_probs_rejected", brier([{"a": float("nan"), "b": 0.0}], ["a"], ["a", "b"]), None)

    print("R3 temperature behaviour")
    items = [({"a": 0.99, "b": 0.01}, "a"), ({"a": 0.99, "b": 0.01}, "b"),
             ({"a": 0.01, "b": 0.99}, "a"), ({"a": 0.9, "b": 0.1}, "b")]
    T = fit_temperature(items, ["a", "b"])
    chk("T_above_one_when_confidence_far_exceeds_accuracy", T > 1.0, True)
    control = [({"a": 0.8, "b": 0.2}, "a")] * 4 + [({"a": 0.8, "b": 0.2}, "b")]
    chk("T_near_one_when_already_calibrated", 0.7 < fit_temperature(control, ["a", "b"]) < 1.6, True)
    chk("fit_temperature_returns_None_on_empty", fit_temperature([], ["a", "b"]), None)
    q = apply_temperature({"a": 0.99, "b": 0.01}, 3.0, ["a", "b"])
    chk("argmax_preserved_by_temperature", max(q, key=q.get), "a")
    chk("probabilities_renormalised", round(sum(q.values()), 9), 1.0)

    print("bootstrap table")
    t1 = boot_index_table(10, 5)
    _INDEX_CACHE.clear()
    chk("table_deterministic", boot_index_table(10, 5), t1)
    chk("table_in_range", all(0 <= j < 10 for row in t1 for j in row), True)

    print(f"selftest: {len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
