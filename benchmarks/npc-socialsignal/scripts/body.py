#!/usr/bin/env python3
"""Shared helpers for the E1 evaluator: body assembly, split loading, question
mapping. Kept separate so run_bench.py and the metric self-test use literally
the same input construction - the fairness contract depends on it.
"""
import glob
import json
import os

SPLIT_OF_FAMILY_CACHE = {}


def load_split_assignment(root):
    if not SPLIT_OF_FAMILY_CACHE:
        with open(os.path.join(root, "split-assignment.json"), encoding="utf-8") as fh:
            SPLIT_OF_FAMILY_CACHE.update({k: v["split"] for k, v in json.load(fh)["families"].items()})
    return SPLIT_OF_FAMILY_CACHE


def load_rows(root):
    """All authored scenarios, deduplicated by sid, deterministic order."""
    rows, seen = [], {}
    for path in sorted(glob.glob(os.path.join(root, "samples", "src-batch*.jsonl"))):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                if r["sid"] in seen:
                    raise ValueError(f"duplicate sid {r['sid']}")
                seen[r["sid"]] = True
                rows.append(r)
    return sorted(rows, key=lambda r: r["sid"])


def load_split(root, split):
    assign = load_split_assignment(root)
    return [r for r in load_rows(root) if assign.get(r["family"]) == split]


def build_body(row):
    """Actor-visible context only. hidden_truth / labels / basis / tags are never
    emitted here - that is the leakage boundary of the whole benchmark."""
    hist = row.get("history") or []
    lines = [
        f"【NPC】{row['persona']}",
        f"【已知边界】{row.get('boundary') or '无（该 NPC 从未被告知相关规矩）'}",
        "【既往】",
    ]
    lines += [f"- {h}" for h in hist] if hist else ["- 无"]
    lines.append(f"【此刻】{row['turn']}")
    return "\n".join(lines)


def load_questions(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def sdk_questions(q):
    """Only adaptation needed between our template file and the upstream SDK:
    our key is `options`, laya's choice questions take `criteria` (label ->
    description). Semantics, wording and order are untouched."""
    out = {}
    for name, spec in q.items():
        spec = dict(spec)
        if "options" in spec:
            spec["criteria"] = spec.pop("options")
        out[name] = spec
    return out


def paraphrase(row):
    """Deterministic equal-meaning rewrite used by the paraphrase condition.
    Only surface form changes; gold labels stay identical."""
    r = dict(row)
    t = r["turn"]
    swap = [("你", "阁"), ("我", "咱"), ("，", "、"), ("？", "吧？")]
    for a, b in swap:
        t = t.replace(a, b, 1)
    r["turn"] = t
    return r
