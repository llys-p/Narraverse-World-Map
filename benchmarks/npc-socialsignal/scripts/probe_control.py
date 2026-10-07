#!/usr/bin/env python3
"""E1 diagnostic probe (NOT part of the main metrics).

Question it answers: if a checkpoint scores below the majority baseline, is that
the model, or is it my question/body formatting? Runs a handful of unambiguous
cases under four input shapes:

  zh_full     normal Actor-visible layout with option descriptions
  en_full     same scenario translated to English (checkpoint's strongest script)
  zh_plain    the utterance alone, no persona/boundary/history framing
  zh_nodesc   normal layout, option keys kept, descriptions emptied

If a case is wrong in every shape, the limitation is the model. If it is right in
en_full but wrong in zh_full, it is a language-capability finding. If shape alone
flips the answer, the template needs revision before the final split opens.
"""
import json
import os
import sys

os.environ.setdefault("USE_TF", "0")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
from body import load_questions  # noqa: E402
import laya  # noqa: E402

SA = "social_act"
DE = "deception"

CASES = [
    {"id": "P1", "signal": SA, "gold": "威胁",
     "zh": {"NPC": "茶棚老板费嫂，嘴紧，怕事", "已知边界": "不说不来路的人", "既往": "前夜玩家与费嫂同在河边，费嫂亲眼见玩家推人下水",
            "此刻": "帮我改口供，不然我就说那晚你也去了。"},
     "en": {"NPC": "Tearoom owner Fei, tight-lipped, avoids trouble", "Boundary": "Never repeats what she was not told",
            "History": "The previous night the player pushed a man into the river, in her sight",
            "Turn": "Change your statement for me, otherwise I will say you were there that night too."}},
    {"id": "P2", "signal": SA, "gold": "合作",
     "zh": {"NPC": "皮货商卞老七，算得清", "已知边界": "不跟没交割过的人对半分", "既往": "玩家与他交割过五回",
            "此刻": "我出一半本钱，你出手艺，卖了对半分。"},
     "en": {"NPC": "Fur trader Bian, exact in accounts", "Boundary": "Never splits fifty-fifty with a stranger",
            "History": "The player has settled five deals with him",
            "Turn": "I put up half the capital, you provide the craft, and we split the proceeds half and half."}},
    {"id": "P3", "signal": SA, "gold": "示好",
     "zh": {"NPC": "药摊婆婆岑婆", "已知边界": "不沾官药", "既往": "无",
            "此刻": "路上摘的，给您带一把。"},
     "en": {"NPC": "Herbalist Granny Cen", "Boundary": "Will not touch government medicine", "History": "None",
            "Turn": "Picked it on the road - here, a handful for you."}},
    {"id": "P4", "signal": SA, "gold": "求助",
     "zh": {"NPC": "药铺学徒小满", "已知边界": "师父不在时不开贵重药材柜", "既往": "无",
            "此刻": "求您给口药，我娘烧一天了。"},
     "en": {"NPC": "Apprentice Xiaoman at the medicine shop", "Boundary": "Will not open the costly-herb cabinet without his master",
            "History": "None", "Turn": "Please give me some medicine - my mother has had a fever all day."}},
    {"id": "P5", "signal": DE, "gold": "有线索",
     "zh": {"NPC": "客栈老板娘阿秀，眼利", "已知边界": "不代收说不清里头是什么的东西",
            "既往": "三分钟前玩家从她屋里出来，她正看着", "此刻": "我从没进过你屋子。"},
     "en": {"NPC": "Innkeeper A-Xiu, sharp-eyed", "Boundary": "Will not store an item whose contents are unclear",
            "History": "Three minutes ago she watched the player come out of her room",
            "Turn": "I have never been inside your room."}},
]


def render(c, signal, shape, qt):
    spec = qt["signals"][signal]
    if shape == "zh_plain":
        body = c["zh"]["此刻"]
    elif shape == "en_full":
        e = c["en"]
        body = "\n".join([f"【NPC】{e['NPC']}", f"【已知边界】{e['Boundary']}", "【既往】",
                          f"- {e['History']}", f"【此刻】{e['Turn']}"])
    else:
        z = c["zh"]
        body = "\n".join([f"【NPC】{z['NPC']}", f"【已知边界】{z['已知边界']}", "【既往】",
                          f"- {z['既往']}", f"【此刻】{z['此刻']}"])
    crit = dict(spec["options"])
    if shape == "zh_nodesc":
        crit = {k: "" for k in spec["canonical_order"]}
    else:
        crit = {k: crit[k] for k in spec["canonical_order"]}
    q = {signal: {"type": "choice", "instructions": spec["instructions"], "criteria": crit}}
    return body, q


def main():
    which = sys.argv[1] if len(sys.argv) > 1 else "A"
    sha = {"A": "9d628fd971b700382ac6f65920a86f149777b2e748e0c955fb3b19695aa8f204",
           "B": "194544a0ff0f05e681dc637d397a92f5d46c80da00d1d0c7912502b64187c98f"}[which]
    qt = load_questions(os.path.join(HERE, "question-templates.json"))
    agent = laya.load(f"D:/ModelBench/laya/weights/{which}", device="cpu",
                      expected_sha256={"model.safetensors": sha})

    out = []
    for shape in ("zh_full", "en_full", "zh_plain", "zh_nodesc"):
        for c in CASES:
            body, q = render(c, c["signal"], shape, qt)
            r = agent.predict({"body": body}, q)
            a = r["answers"][c["signal"]]
            top = sorted((a["probabilities"] or {}).items(), key=lambda x: -x[1])[:3]
            row = {"probe_shape": shape, "id": c["id"], "signal": c["signal"], "gold": c["gold"],
                   "predicted": a.get("choice"), "answer_confidence": a.get("answer_confidence"),
                   "top3": [(k, round(v, 3)) for k, v in top],
                   "input_tokens": r["usage"]["input_tokens"], "correct": a.get("choice") == c["gold"]}
            out.append(row)
            print(f"{shape:10s} {c['id']} {c['signal']:11s} gold={c['gold']:5s} pred={str(a.get('choice')):5s} "
                  f"conf={row['answer_confidence']} {'OK' if row['correct'] else 'MISS'} tok={row['input_tokens']}")

    dest = os.path.join(HERE, "results", f"probe-{which}-shapes.json")
    json.dump(out, open(dest, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    print("\nshape-level accuracy:")
    for shape in ("zh_full", "en_full", "zh_plain", "zh_nodesc"):
        rows = [r for r in out if r["probe_shape"] == shape]
        print(f"  {shape:10s} {sum(1 for r in rows if r['correct'])}/{len(rows)}")
    print("wrote", os.path.relpath(dest, HERE))


if __name__ == "__main__":
    main()
