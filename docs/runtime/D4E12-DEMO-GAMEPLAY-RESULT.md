# D4E12-F1 Demo人物交互与行囊接线

2026-10-18（Asia/Shanghai）。用户要求先推进功能，性能独立对话处理，并选择“先结合demo完善现有功能”。**本轮现有玩法接线限定通过，未新增世界规则。**

## 用户可体验的变化

- 点击村长：从人物卡发起现有村庄工作，6小时成功领20金币；疲劳/工作冷却等继续由原规则裁决。
- 点击商人：打开真实粮食/药草买卖，输入1–10整数数量，显示实际价格、持有数；金币或物品不足时禁用相应入口。
- 猎人仍可从人物卡赠粮并查看真实收到记忆，沿用既有能力。
- 行囊：显示真实资产，可找附近商人交易、休整1小时。药草没有直接服用能力，页面明确说明，不制作假治疗或装备效果。
- 当前活动、断连、确认等待、战斗或距离变化会重新计算人物卡/交易面板可用状态。打开、关闭、切换面板不推进世界、不改资产；不提前显示交易成功。

## 源码与分工

- 基准 `63b3ddf3483b5486e3d9dc2c19fc2f0b1c4e4bef`；功能源码 `fee737ddd8861a37d0fe67886306561f90def25d`。
- 树 `D:/Narraverse-World-Map-demo-gameplay`，分支 `codex/world-runtime-demo-gameplay`。
- 性能已另建对话 `01a14d49-bc97-7ce3-a47e-18c4f92edea8`，独立cold-open分支/工作树；禁止写本功能树、中控脏摘要及看板。中控唯一状态由主线维护。原“world-map”自动化已经是PAUSED，本轮未重启或另建重复自动化。
- 唯一服务端改动：把新的展示层策略模块加入显式静态资源清单，未扩大为任意路径服务。
- `runtime/core/`、`runtime/service/`和持久化、format11/DTO5、时间/命令预算及审计机制无diff。新策略只是前端入口判断，不新增服务端“必须靠近商人才允许全局交易”的规则；原快捷入口与原交易规则保留。

## 最少必要验证

1. 新策略测试3/3 PASS：人物/动作对应、价格/数量/资产边界、距离/死亡/战斗/行军/不可写与冷却，不修改输入。先写测试，红灯MODULE_NOT_FOUND后实现转绿。
2. 最终真实Edge页面链：商人开窗不改状态 → 非法数量不发POST → 卖2粮 → 买1粮 → 村长工作 → 行囊休整 → 距离已变化的旧交易面板不能发命令 → 正常关闭 → 原公开完整审计 → 重开同一世界并重看行囊。49656.831ms，exit0；采集页面异常为空。
3. 四笔DTO依次为PlayerSell(quantity2)、PlayerBuy(quantity1)、PlayerWork、PlayerRest，全部succeeded；最终revision44/tick44、金币20、粮食19、疲劳50；五投影跨重开完全一致。
4. 5份正式文件跨重开SHA全部不变；最终r44 SHA `628da740ccbb21b17853db0a0c254bb758f4f7b37d71769073034952744b18d4`，五投影签名 `e6bf0905ccaa05c3fa3ff2e2881803053f363f8e7be0336a278a39474ecbe90c`。完整合成回执、逐阶段耗时与SHA见原始数据，不上传world目录。
5. 未重跑已有行军/战斗全链、全量测试或长档；该源码未改审计/世界规则，前序有效证据按原范围复用。无截图、录像或视觉/听感验收；未作性能A/B结论。

## 失败记录与修复

- r1：测试专用Edge没有在原12秒内提供CDP，页面尚未开始。测试辅助改为最多30秒并在进程提前退出时直接报告，单阶段120秒、总180秒没有放宽。
- r2：发现新模块缺少静态资源清单登记，页面无法完成加载；该旧进程达到open-demo阶段120秒，被外部Job终止（total120657.537ms，退出已确认）。已修复静态清单，并让新测试遇页面错误立即失败。确认PID72240不存在后，只删除此隔离目录中归属于该PID的单个owner锁；失败世界/原始日志完整保留。
- r3：页面导航完成前测试读取document.body.dataset，测试自身出现null错误；改为document.body?.dataset等待，未改生产规则。
- r4：以上修复后的最终源码通过；失败轮次没有改名成通过。原始退出记录均保留。

## 命令与保护

```powershell
python scripts/run-d4e12-check.py gameplay-actions-green 180 node --test tests/simulation/demo-interaction-actions.test.mjs
python scripts/run-d4e12-check.py gameplay-context-r4 180 --phase-file artifacts/d4e12/gameplay-context-r4-world/phase.json node scripts/verify-demo-context-actions.mjs artifacts/d4e12/gameplay-context-r4-world
```

所有新进程180秒外部硬限/阶段120秒，Windows Job保护、退出确认5秒。最终无自有进程/锁；三旧端口18338/18340/18342无监听，启停动作0；原八档、16依赖、旧88源码、107既有日常文件、原型与中控2行脏摘要保持。未启动日常入口，未合main/部署/迁移/上传私档/调用外部模型。

## 后续与Reference Review

本对话继续围绕demo补齐现有功能体验，地点/NPC扩容、消耗品使用、装备或新战斗规则需单独明确范围。长档冷开交给上述独立优化对话，不再阻塞功能分支。

复用原demo人物卡/交易/行囊样式与现有PlayerWork/Buy/Sell/Rest/Gift及单写者client；拒绝原型本地钱包/背包写入与未接入动作。前端策略不替代后端裁决。

[原始证据](../evidence/d4e12-demo-gameplay-20261018/context-r4-result.json)
