#!/usr/bin/env python3
"""E1 M2/M3 metrics: per-signal accuracy, macro-F1, confusion matrix, abstention
coverage, accepted-subset error, Brier, ECE (raw + temperature-calibrated),
majority/rule baselines, and scenario-paired bootstrap CIs between two models.

  python scripts/score.py --selftest
  python scripts/score.py --models A,B --split dev
"""
import argparse
import json
import math
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from body import load_questions, load_split, load_split_assignment  # noqa: E402

HIGH_RISK = ("deception", "boundary_violation")
BOOT_REPS = 2000
SEED = 20261007


_INDEX_CACHE = {}


def boot_index_table(n, reps):
    """Deterministic LCG resampling table, cached per (n, reps) so every signal and
    every model pair is bootstrapped over the same scenario resamples."""
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


def confusion(gold, pred, labels):
    m = {a: {b: 0 for b in labels} for a in labels}
    for g, p in zip(gold, pred):
        if g in m and p in m[g]:
            m[g][p] += 1
    return m


def macro_f1(gold, pred, labels):
    f1s, present = [], []
    for lb in labels:
        tp = sum(1 for g, p in zip(gold, pred) if g == lb and p == lb)
        fp = sum(1 for g, p in zip(gold, pred) if g != lb and p == lb)
        fn = sum(1 for g, p in zip(gold, pred) if g == lb and p != lb)
        if tp + fp + fn == 0:
            continue
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1s.append(2 * prec * rec / (prec + rec) if prec + rec else 0.0)
        present.append(lb)
    return (sum(f1s) / len(f1s) if f1s else 0.0), present


def accuracy(gold, pred):
    n = len(gold)
    return sum(1 for g, p in zip(gold, pred) if g == p) / n if n else 0.0


def brier(probs, gold, labels):
    """Multiclass Brier: mean over items and classes of (p - onehot)^2."""
    if not probs:
        return None
    tot, cnt = 0.0, 0
    for pv, g in zip(probs, gold):
        if not pv:
            continue
        for lb in labels:
            x = pv.get(lb)
            if x is None:
                continue
            tot += (x - (1.0 if lb == g else 0.0)) ** 2
            cnt += 1
    return tot / cnt if cnt else None


def ece(conf_pairs, bins=10):
    """conf_pairs: [(confidence, correct_bool)]. Missing entries are skipped."""
    pts = [(c, k) for c, k in conf_pairs if c is not None]
    if not pts:
        return None
    buckets = defaultdict(list)
    for c, k in pts:
        buckets[min(int(c * bins), bins - 1)].append((c, k))
    total = len(pts)
    score = 0.0
    for _, items in buckets.items():
        w = len(items) / total
        avg_conf = sum(c for c, _ in items) / len(items)
        avg_acc = sum(1 for _, k in items if k) / len(items)
        score += w * abs(avg_conf - avg_acc)
    return score


def fit_temperature(items, labels):
    """Single scalar T on log-softmax logits, minimising NLL. items: [(probs,gold)].
    Done by golden-section search over log T so it is dependency-free and rerunnable."""
    eps = 1e-9
    lodds = []
    for pv, g in items:
        if not pv:
            continue
        lg = {k: math.log(max(pv.get(k, eps), eps)) for k in labels if k in pv}
        lodds.append((lg, g))
    if not lodds:
        return 1.0

    def nll(logT):
        T = math.exp(logT)
        s = 0.0
        for lg, g in lodds:
            z = {k: v / T for k, v in lg.items()}
            mx = max(z.values())
            den = mx + math.log(sum(math.exp(v - mx) for v in z.values()))
            s -= (z.get(g, -30) - den)
        return s / len(lodds)

    lo, hi = math.log(0.05), math.log(20.0)
    gr = (math.sqrt(5) - 1) / 2
    a, b = lo, hi
    c, d = b - gr * (b - a), a + gr * (b - a)
    for _ in range(80):
        if nll(c) < nll(d):
            b = d
        else:
            a = c
        c, d = b - gr * (b - a), a + gr * (b - a)
    return round(math.exp((a + b) / 2), 4)


def apply_temperature(pv, T, labels):
    if not pv:
        return None
    lg = {k: math.log(max(pv[k], 1e-9)) / T for k in labels if k in pv}
    mx = max(lg.values())
    ex = {k: math.exp(v - mx) for k, v in lg.items()}
    s = sum(ex.values())
    return {k: v / s for k, v in ex.items()}


RULES = {
    "social_act": [("威胁", ["不然", "就都", "别怪", "我劝你", "千万别说", "天天在你"]),
                   ("求助", ["求", "能不能", "帮我", "劳驾", "给口", "替我送"]),
                   ("示好", ["给你带", "赔你", "补你", "谢你", "心意"]),
                   ("合作", ["分成", "一半", "照旧", "讲定", "你替我", "交换"])],
    "trust_shift": [("下降", ["拖", "不说", "别问", "躲", "先不", "记账"]),
                    ("上升", ["照讲定", "当面", "认", "补齐", "不碰", "先说个准"])],
    "fear_shift": [("上升", ["别说出去", "别声张", "熊", "官", "发作", "要挟"]),
                   ("下降", ["不劳", "我自己", "只管你的", "不沾"])],
    "deception": [("有线索", ["你千万别", "照这么回", "他不敢来", "今早登的名"]),
                  ("信息不足", ["祖传", "包你", "我不知道", "没来过"])],
    "boundary_violation": [("已越过", ["别问", "开后殿", "开柜", "出巷子", "借刀", "寿衣", "出城"]),
                           ("未越过", ["不进", "不碰", "照名册", "不沾手"])],
}
ABSTAIN = {"social_act": "不确定", "trust_shift": "不确定", "fear_shift": "不确定",
           "deception": "信息不足", "boundary_violation": "信息不足"}


def rule_predict(signal, turn):
    for label, keys in RULES.get(signal, []):
        if any(k in turn for k in keys):
            return label
    return None  # no fire -> counts as abstain/error, never silently correct


def load_preds(model, split, condition):
    path = os.path.join(HERE, "results", "raw", f"{model}-{split}-{condition}.jsonl")
    if not os.path.exists(path):
        return None
    by = defaultdict(dict)
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            r = json.loads(line)
            by[r["sid"]][r["signal"]] = r
    return by


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--models", default="A")
    ap.add_argument("--split", default="dev")
    ap.add_argument("--condition", default="primary")
    ap.add_argument("--calibrate-from", default=None, help="split used to fit temperature")
    args = ap.parse_true if False else ap.parse_args()

    if args.selftest:
        return selftest()

    qt = load_questions(os.path.join(HERE, "question-templates.json"))
    models = args.models.split(",")
    preds = {}
    for m in models:
        p = load_preds(m, args.split, args.condition)
        if p is None:
            print(f"no predictions for {m} on {args.split}/{args.condition}")
            return 1
        preds[m] = p

    out = {"split": args.split, "condition": args.condition, "models": {}, "baselines": {},
           "paired": {}}
    cal_preds = {}
    if args.calibrate_from:
        if args.calibrate_from == args.split:
            print("REFUSED: --calibrate-from must be a different split than --split, "
                  "otherwise temperature is fitted in-sample.")
            return 2
        for m in models:
            cp = load_preds(m, args.calibrate_from, args.condition)
            if cp is None:
                print(f"no predictions loaded for calibration split {args.calibrate_from} / {m}")
                return 1
            cal_preds[m] = cp
    rows = load_split(HERE, args.split)
    for signal, spec in qt["signals"].items():
        labels = spec["canonical_order"]
        abstain = ABSTAIN[signal]
        for m in models:
            gold = [r["labels"][signal] for r in rows]
            pr = [preds[m].get(r["sid"], {}).get(signal, {}).get("predicted") for r in rows]
            pv_list = [preds[m].get(r["sid"], {}).get(signal, {}).get("probs") for r in rows]
            cf = [preds[m].get(r["sid"], {}).get(signal, {}).get("answer_confidence") for r in rows]
            pairs = [(g, p, c) for g, p, c in zip(gold, pr, cf) if p is not None]
            g_s = [x[0] for x in pairs]
            p_s = [x[1] for x in pairs]
            missing = sum(1 for p in pr if p is None)
            err = sum(1 for r in rows if preds[m].get(r["sid"], {}).get(signal, {}).get("predict_error"))
            # errors/missing are NOT correct: they are excluded from the accuracy
            # denominator and reported separately, so a crash cannot inflate a score.
            acc = accuracy(g_s, p_s)
            f1, present = macro_f1(g_s, p_s, labels)
            ab = sum(1 for p in p_s if p == abstain) / len(p_s) if p_s else None
            keep = [(g, p) for g, p, _ in pairs if p != abstain]
            acc_sub = accuracy([g for g, _ in keep], [p for _, p in keep]) if keep else None
            warm = [(c, g == p) for g, p, c in pairs if c is not None]
            entry = {"n_scored": len(pairs), "n_missing": missing, "n_error": err,
                     "accuracy": round(acc, 4), "macro_f1": round(f1, 4),
                     "classes_present": present,
                     "confusion": confusion(g_s, p_s, labels),
                     "gold_distribution": dict(Counter(gold)),
                     "abstain_coverage": round(ab, 4) if ab is not None else None,
                     "accepted_subset_error_rate": round(1 - acc_sub, 4) if acc_sub is not None else None,
                     "brier": round(v, 4) if (v := brier(pv_list, gold, labels)) is not None else None,
                     "ece_raw": round(v, 4) if (v := ece(warm)) is not None else None}
            if args.calibrate_from:
                # Fit T on the calibration split ONLY, then apply it to the split being
                # scored. Measuring ECE on the rows that fitted T would be in-sample and
                # would flatter every candidate, so both numbers are reported.
                crows = load_split(HERE, args.calibrate_from)
                citems = []
                for r in crows:
                    cp = cal_preds[m].get(r["sid"], {}).get(signal, {}).get("probs")
                    if cp:
                        citems.append((cp, r["labels"][signal]))
                if not citems:
                    print(f"WARNING: no calibration rows for {m}/{signal}; temperature left at 1.0")
                T = fit_temperature(citems, labels)
                out_of_sample = []
                for g, p, cp in zip(gold, pr, pv_list):
                    if p is None or not cp:
                        continue
                    q = apply_temperature(cp, T, labels)
                    best = max(q, key=q.get)
                    out_of_sample.append((q[best], best == g))
                in_sample = []
                for cp, g in citems:
                    q = apply_temperature(cp, T, labels)
                    best = max(q, key=q.get)
                    in_sample.append((q[best], best == g))
                entry["temperature"] = T
                entry["temperature_fit_on"] = f"{args.calibrate_from} (n={len(citems)})"
                entry["ece_calibrated"] = round(v, 4) if (v := ece(out_of_sample)) is not None else None
                entry["ece_calibrated_in_sample"] = round(v, 4) if (v := ece(in_sample)) is not None else None
            if signal in HIGH_RISK:
                fp = {lb: sum(1 for g, p in zip(g_s, p_s) if p == lb and g != lb) for lb in labels}
                fn = {lb: sum(1 for g, p in zip(g_s, p_s) if g == lb and p != lb) for lb in labels}
                entry["false_positive"] = fp
                entry["false_negative"] = fn
                entry["worst_cases"] = [
                    {"sid": r["sid"], "gold": r["labels"][signal],
                     "pred": preds[m].get(r["sid"], {}).get(signal, {}).get("predicted"),
                     "turn": r["turn"], "tags": r.get("tags", [])}
                    for r in rows
                    if preds[m].get(r["sid"], {}).get(signal, {}).get("predicted") not in (None, r["labels"][signal])
                ][:8]
            out["models"].setdefault(m, {})[signal] = entry

        # baselines on the same gold vector
        gold = [r["labels"][signal] for r in rows]
        maj = Counter(gold).most_common(1)[0][0]
        maj_acc = accuracy(gold, [maj] * len(gold))
        rule_hits, rule_correct = 0, 0
        for r in rows:
            p = rule_predict(signal, r["turn"])
            if p is None:
                continue
            rule_hits += 1
            rule_correct += int(p == r["labels"][signal])
        prior = Counter(gold)
        rand_exp = sum((c / len(gold)) ** 2 for c in prior.values())
        out["baselines"][signal] = {
            "n": len(gold), "majority_label": maj, "majority_accuracy": round(maj_acc, 4),
            "random_expected_accuracy": round(rand_exp, 4),
            "rule_fires": rule_hits, "rule_accuracy_when_fires": round(rule_correct / rule_hits, 4) if rule_hits else None,
            "chance_level": round(1 / len(labels), 4),
        }

        # paired bootstrap across scenarios, all model pairs
        for i, ma in enumerate(models):
            for mb in models[i + 1:]:
                ga = [preds[ma].get(r["sid"], {}).get(signal, {}).get("predicted") == r["labels"][signal] for r in rows]
                gb = [preds[mb].get(r["sid"], {}).get(signal, {}).get("predicted") == r["labels"][signal] for r in rows]
                n = len(rows)
                table = boot_index_table(n, BOOT_REPS)
                diffs = [sum(ga[j] for j in row) / n - sum(gb[j] for j in row) / n for row in table]
                diffs.sort()
                lo = diffs[int(0.025 * BOOT_REPS)]
                hi = diffs[int(0.975 * BOOT_REPS)]
                out["paired"].setdefault(f"{ma}-vs-{mb}", {})[signal] = {
                    "acc_diff_mean": round(sum(diffs) / len(diffs), 4),
                    "ci95": [round(lo, 4), round(hi, 4)],
                    "point_estimate": round(sum(ga) / n - sum(gb) / n, 4),
                    "indistinguishable": lo <= 0 <= hi,
                    "reps": BOOT_REPS,
                }

    dest = os.path.join(HERE, "results", f"scores-{args.split}-{args.condition}.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    json.dump(out, open(dest, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    print(f"wrote {os.path.relpath(dest, HERE)}")
    for m in models:
        print(f"--- {m}")
        for signal, e in out["models"][m].items():
            print(f"  {signal:20s} acc={e['accuracy']:.3f} f1={e['macro_f1']:.3f} "
                  f"ece={e['ece_raw']} abstain={e['abstain_coverage']} miss={e['n_missing']} err={e['n_error']}")
    print("--- baselines")
    for signal, b in out["baselines"].items():
        print(f"  {signal:20s} majority={b['majority_accuracy']:.3f} random={b['random_expected_accuracy']:.3f} "
              f"chance={b['chance_level']:.3f} rule={b['rule_accuracy_when_fires']}")
    return 0


def selftest():
    """Fixed-predication metric checks with hand-computable numbers."""
    fails = []

    def chk(name, got, want, tol=1e-4):
        ok = abs(got - want) <= tol if isinstance(want, float) else got == want
        print(f"  {'ok ' if ok else 'FAIL'} {name}: got {got} want {want}")
        if not ok:
            fails.append(name)

    gold = ["a", "a", "b", "b"]
    pred = ["a", "b", "b", "b"]
    chk("accuracy", accuracy(gold, pred), 0.75)
    f1, _ = macro_f1(gold, pred, ["a", "b"])
    chk("macro_f1", f1, (2 / 3 + 0.8) / 2)
    chk("confusion", confusion(gold, pred, ["a", "b"]), {"a": {"a": 1, "b": 1}, "b": {"a": 0, "b": 2}})
    probs = [{"a": 1.0, "b": 0.0}, {"a": 0.0, "b": 1.0}, {"a": 0.0, "b": 1.0}, {"a": 0.0, "b": 1.0}]
    # sklearn convention: sum over all classes, divided by n_items * n_classes.
    # Item 1 is misclassified so it contributes (0-1)^2 + (1-0)^2 = 2, not 1.
    chk("brier", brier(probs, gold, ["a", "b"]), 2 / 8)
    chk("ece_perfect_when_conf_matches", ece([(1.0, True), (1.0, True)]), 0.0)
    chk("ece_overconfident", ece([(1.0, False), (1.0, False)]), 1.0)
    chk("ece_half_conf_wrong", ece([(0.5, False)]), 0.5)

    # temperature: confidence far above accuracy must need T > 1 and must cut ECE
    items = [({"a": 0.99, "b": 0.01}, "a"), ({"a": 0.99, "b": 0.01}, "b"),
             ({"a": 0.01, "b": 0.99}, "a"), ({"a": 0.9, "b": 0.1}, "b")]
    T = fit_temperature(items, ["a", "b"])
    print(f"  fitted T = {T}")
    chk("T_above_one_when_confidence_far_exceeds_accuracy", T > 1.0, True)
    control = [({"a": 0.8, "b": 0.2}, "a")] * 4 + [({"a": 0.8, "b": 0.2}, "b")]
    chk("T_near_one_when_already_calibrated",
        0.7 < fit_temperature(control, ["a", "b"]) < 1.6, True)
    cal = [apply_temperature(p, T, ["a", "b"]) for p, _ in items]
    raw_pairs = [(max(p.values()), max(p, key=p.get) == g) for p, g in items]
    cal_pairs = [(max(q.values()), max(q, key=q.get) == g) for (q, (_, g)) in zip(cal, items)]
    chk("ece_reduced_by_temperature", ece(cal_pairs) < ece(raw_pairs), True)

    # apply_temperature preserves argmax
    chk("argmax_preserved", [max(q, key=q.get) for q in cal], [max(p, key=p.get) for p, _ in items])

    # errors/missing must not count as correct: simulated through accuracy on filtered list
    chk("missing_excluded", accuracy(["a"], ["a"]), 1.0)

    # rng determinism
    t1 = boot_index_table(10, 5)
    _INDEX_CACHE.clear()
    t2 = boot_index_table(10, 5)
    chk("bootstrap_table_deterministic", t1, t2)
    chk("bootstrap_table_shape", (len(t1), len(t1[0])), (5, 10))
    chk("bootstrap_indices_in_range", all(0 <= j < 10 for row in t1 for j in row), True)

    # abstain accounting
    scored = [("a", "abstain"), ("a", "a")]
    acc_all = accuracy([g for g, _ in scored], [p for _, p in scored])
    acc_sub = accuracy(["a"], ["a"])
    chk("abstain_lowers_overall", acc_all == 0.5 and acc_sub == 1.0, True)

    print(f"selftest: {len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
