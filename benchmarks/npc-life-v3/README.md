# life-v3 连续生活开发回归

fixture5，schema3，4场景28轮，最远tick576（4次日结）；前三场景各8轮，第四场景沿用4轮饥饿/库存反例。工作收入、重复购买/余额耗尽、赠粮暂停与恢复购买、工具损坏修复、换话题与短追问均由真实命令推进。

默认plan零模型调用：`node scripts/evaluate-npc-dialogue.mjs --suite life-v3 --out artifacts/npc16/life-v3-plan.json`。旧schema1/2仍每场景4轮、tick288以内，总预算仍最多32。任何live调用仍要求新的明确授权及足额显式预算。

逐轮expect是开发者检查表，不传模型；理由只核验本人已配对决策/结果。WAIT不证明缺钱、找工作或购买失败。模型原文与人工pending保留；协议检查/有限数值核查不等于整体语言正确。
