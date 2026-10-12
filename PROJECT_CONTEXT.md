# 当前状态与接手方向

更新时间：2026-10-12 13:37（Asia/Shanghai）。当前进度仅在本文件维护。
本轮改写前的完整版本固定于控制仓库远端提交 `3361d653a61d0ee7901426f3edd41b951017e2d6`，Git blob `c07b928553f57c5a9fab1d55280a84504e0b1ddb` 已核实与旧字节哈希相符，可从远端链接恢复：
[旧版 PROJECT_CONTEXT](https://github.com/llys-p/Narraverse-World-Map/blob/3361d653a61d0ee7901426f3edd41b951017e2d6/PROJECT_CONTEXT.md)。
旧字节 SHA256：`9adb3accdd3a31261f2e60dd2f117da537813b79ac0dae8b2a3e0c8d81f77777`。

## 当前能力

- 本项目是独立 World Map 原型，不属于 Narraverse 正式平台；没有生产接入或真实存档迁移。
- M4 有界自主生存合同已限定 PASS，源码 `115e256` 已推送并读回。
  最终证据见 [M4B 复核](docs/runtime/M4B-REVIEW-20261011.md) 和
  `artifacts/world-runtime-m4b-review-20261011/final-acceptance-index.json`；
  证据按合同分次覆盖，非旧全量重跑。
- D3-1、D3-2、D3-3、D3-4 各自限定 PASS；D3 整体未验收。
  现有范围仅含遭遇预留内核、世界候选适配、命令会话和单狼战斗内核。
- 当前半成品体验主要集中于旅行、买卖、休整与时间推进，以及检查器；遭遇仍没有完整的真实消费者链。
  D3 候选尚未接入权威世界提交、事件、磁盘存档、服务、页面或 M4 生存规则；
  不得称为完整世界遭遇、存档或 UI 接入。

## 集成基准与实际位置

- 控制文档树：`D:\Narraverse-World-Map-control`，分支 `codex/world-runtime-control`；
  本轮起始 HEAD `3361d653a61d0ee7901426f3edd41b951017e2d6`。
- D3 施工树：`D:\Narraverse-World-Map\hds-reservation`，
  分支 `codex/world-runtime-d3-reservation`。
  源码提交 `cb03e1afd3900b6748d729aaa345bfed590f90e9`；
  交接基准 `f335abf30e3eef9d1b40a99a791a6c3c6ae962ab`。
  源码未推送、未合入 main。
- `f335abf` 的历史祖先关系包含 M4 最终提交 `115e256`；只读核对发现相对 M4 基线新增四个 `runtime/core/encounter*.mjs` 文件，M4 生产 Git blob 相同。
  部分检出文件因 CRLF 无法直接比较原始字节，三模块 normalized-LF 指纹相符；这仍是候选基线，不代表 D3 已接入或整体验收。
  当前接入缺口是规则/快照版本不兼容：D3-3 使用 `PLAY_RULES` / `d-player-v2`，
  frame 使用 `memory-config-v4`、`player-state-v2`；M4 服务使用
  `SURVIVAL_RULES` / `m-survival-v1`。

## 活动工作、阻塞与下一步

- 最新R2：真实创建链已核schema3/14狼，执行者报29/29与旧回归41/41，未机械重跑；中控五条独立探针揭示session未注册、Travel未调度、RNG篡改接受、旧规则接新配置。仅创建链限定通过，整A未验收。已准备[R3真实引擎与重演短工单](tasks/D3-5-R3-ENGINE-CARD.md)，包工头13:35核为空闲，待实际派发；证据artifacts/world-runtime-d35-r2-review-20261012/review.json。下列早期阻塞/在途记录为此前快照，不作为当前活动状态。

- 用户反馈核心任务陷入反复读取/压缩后的重新分析；已准备[上下文恢复短卡](tasks/D3-5-RECOVERY-CARD.md)，只作为既有A内部指令，尚未确认送达。优先新短上下文工人和最小真实依赖闭包，旧写者终态前不重派；完整集成范围与B门不减。最新深层探针确认v4玩家tick6死亡已接受、旧v3仍拒绝；顶层与真实遭遇未验。

- 观察在途施工：用户已确认包工头仍在输出或使用工具，继续原会话/原工人，目标保持active，不因等待重启未知写者。Relay仍无该会话的活动run（旧67fc8b67已终态），无法追加管理消息；这是受管接口缺口，不证明工人停止。自动审批拒绝将目标blocked，故只作有界观察，待真实finished/可接回管理轮后再续派。核心fixture仍缺，A/B未交付/未验收。模型目录复核Global DeepSeek V4.1 Flash标注x0.00，实际工人费用仍未返回。
  本地接手证据：`artifacts/world-runtime-d35-hour-review-20261012/repair-workers-latest.json`；新增旧五配方初始化边界5/5通过仅覆盖tick0，证据`legacy-five-recipe-initialization.json`，不代替D3-5验收。
- D3-5当前核心段需内部修正（2026-10-12）：初版新runtime及30项绿测采用简化影子世界，未消费真实snapshot/actorModel/日结/重演；中控拒绝将其记为核心接入PASS，包工头已亲核P0属实。先修正为真实消费者再对接service/UI，合同d13a897不降低；具体审查 artifacts/world-runtime-d35-hour-review-20261012/core-review.json。 追加深层反例：v4玩家tick6死亡仍被旧日界上界误拒，证据actor-v4-midday-probe.json；预留狼日结边界探针通过。A合同rev3只勘误总活狼路径为ecologyModel.populations.wolves并明确死亡约束，未改源码或验收门。

- D3-5实施与独立验收两份任务已发布，合同d3-playable-encounter-v1；现有DSH包工头已派首波两路，当前尚无完整交付/验收。
  精确任务发布SHA `d13a89768c652f74c0c4278eea4f227cf4660a98`，代码基准 `f335abf`；完整窄场景A内部三消费者检查点，B独立验收。
- [D3-5A 实现与公共合同](tasks/D3-5A-PLAYABLE-ENCOUNTER-TASK.md) · [D3-5B 独立验收](tasks/D3-5B-INDEPENDENT-ACCEPTANCE-TASK.md)。
  字段、接口、版本号、白名单与跨日/幂等/发布边界已冻结；B真实运行等待中控给出A精确交付SHA，不使用浮动HEAD。
- D4：预规划已细化为村庄赠粮→本人立即记忆→保存/返回→双页签验收；只有 A 实现/B 独立验收两份未来任务。补充同地点可见性、赠粮不自动涨 trust、双边资产来源账与六检查点，未发布、未开工；待 D3-5 完整验收后钉定 SHA 与版本，见[架构 D4 预规划](WORLD-RUNTIME-ECOLOGY-ARCHITECTURE.md#d4-scene-continuity-plan)。
- 本轮冻结新profile `encounter-survival-village` / rules `d-encounter-survival-v1`；snapshot3/服务format8/DTO3/receipt3，尚未实现或验收。
  保留旧 profiles 与旧存档行为，不自动迁移；集成基准候选为 `f335abf`。
  两份实施任务书已发布；旧版本行为/存档保持，M4当前体验实例不改动。
- 按包工头 2026-10-12 07:42 原生回执，旧首波工人已结束；修正工人 `e617810b` 负责真实 fixture/Runtime 六文件，`7d81bbbe` 负责真实消费者测试，尚未收到 finished；这不是当前整单交付。
  父 run `fa0a5038-382b-468e-ae92-9bb7348e10b9` 已结束且全文已消费；后台工人状态不能由父 run succeeded 推定。
  范围补充发布 SHA `f667adfcc47e1c470df9687eb2053906d83c3230` 仅增加 mind-runtime 对新 memory v5 的兼容；旧 ACTOR/HUNTER 规则版本门仍冻结。
- 旧候选 `520e838` 不作为当前 M4 反例。
  最终证据还需确认“已承诺购粮计划与紧急休息相遇”的跨规则覆盖；
  此前两条相邻用例不能单独证明组合场景通过。
- D3-4 冻结 HP 与 M4 角色死亡日界规则还有边界：现 validator 只允许
  `deathTick % 144 === 0`；接入方案需隔离新规则 profile，不能把当前冻结 HP
  状态直接用于跨日权威状态。
- 体验对话 `01a12aff-2703-71c2-ab00-cc7ae733ca2a` 使用 M4 独立实验入口
  `http://127.0.0.1:18324/`。端口运行状态可能变化，由体验线现场核实；
  控制文档工作不启停该入口。

## 证据入口

- [M4A 公共合同](tasks/M4A-BOUNDED-SURVIVAL-TASK.md) ·
  [M4B 独立验收](tasks/M4B-SURVIVAL-ACCEPTANCE-TASK.md) ·
  [M4B 最终复核](docs/runtime/M4B-REVIEW-20261011.md)
- [D3-1 预留内核](tasks/D3-1-ENCOUNTER-RESERVATION-TASK.md) ·
  [D3-2 世界候选](tasks/D3-2-ENCOUNTER-WORLD-TASK.md) ·
  [D3-3 命令会话](tasks/D3-3-ENCOUNTER-SESSION-TASK.md) ·
  [D3-4 战斗内核](tasks/D3-4-ENCOUNTER-COMBAT-TASK.md)
- 本轮前旧版完整历史与细节：控制仓库快照 [3361d653](https://github.com/llys-p/Narraverse-World-Map/blob/3361d653a61d0ee7901426f3edd41b951017e2d6/PROJECT_CONTEXT.md)。
  历史日期结论只代表当时证据范围，不替代当前合同或源码核验。

## 角色与看板

- 总方向与架构由“GPT6 Astra world Map总负责人”对话负责；
  日常派工、回执与验收由“世界运行 主线 发布任务”对话负责。
  具体交接使用当前源码 SHA、合同和证据索引。
- DSH 沿用既有包工头会话：[包工头](http://127.0.0.1:19387/?sessionId=session-2564efe0-949b-48ed-90a5-f7f7feb9cbce)。
  体验结论由上列体验对话核实。
- 专用看板：[World Map 项目进度](https://github.com/users/llys-p/projects/2)，
  owner `llys-p`，project #2；状态变化需读回并链接证据。
  正式平台 Project #1 独立维护。
- 本轮合同 rev3 勘误 `c83492dfb56b98bfdd1976196929c2d97f1f35db` 已推送并读回；D4 预规划 `cb0067a` 已保存，未派发。
  D卡正文已同步核心内部修正、v4死亡反例与D4预规划；D仍进行中，全部单选字段及其它61卡不变，项目简介本轮未改。
  最新看板读回：`artifacts/world-runtime-d35-hour-review-20261012/board-wording-verification.json`；同目录保存反例与原生修正回执。
  旧接入边界方案标为冻结前历史，不以其“待冻结”措辞阻塞正式A/B合同；源任务副本与控制树逐文件指纹相等。
