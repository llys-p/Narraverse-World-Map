# 当前状态与接手方向

更新时间：2026-10-14 15:38（Asia/Shanghai）。当前进度仅在本文件维护。
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
- D3-5 候选已接入真实世界推进、M4 生存规则、服务持久提交、CLI 保存/恢复及页面消费者。A施工及 B1/B2/B3 共28个独立验收成员已分批覆盖：B2按2项既绿+原3红补验+本轮2项新增/扩展门=7项；root限定裁定D3-5 G1–G8 PASS。非一次28/28运行，不代表D3整体或正式平台接入。见[D3-5B复核](docs/runtime/D3-5B-REVIEW-20261013.md)。

## 集成基准与实际位置

- GitHub 分支 `codex/world-runtime-d4-cp1a-review` 当前已读回提交 `ba43118f096dabdc877a5ac39f7af3fa154becea`；CP1c/CP1d及其祖先可达。其后 CP2a、CP2b、CP2c 提交仅在本地源码树，尚未推送；均未合入 main 或部署。执行树 `origin` 仍指本机clone。

- 控制文档树：`D:\Narraverse-World-Map-control`，分支 `codex/world-runtime-control`；
  本轮CP2c改写前 HEAD `ae8abf0f931baba2a7100e58d7dcd56d0e7370a4`；改写前完整状态见上方保留的 `3361d653` 快照链接。
- D3 施工树：`D:\Narraverse-World-Map\hds-reservation`，分支 `codex/world-runtime-d3-reservation`；A生产冻结为 `d22c730707646eabe8c68b4d2c739e09f942fbab`（主体祖先 `2ecfc0cd5c8991d57053e2e04c17a312469ef96f`，仅含 owner 队列修复和A回归测试）。B测试提交为 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb`（父3c、仅新增/扩展B2测试）；源码未推送、未合入main、未部署。
- 新遭遇规则使用隔离的 profile/schema，旧 profile 与存档行为保持；M4 正式实现和生产边界不变。M4 独立体验对话 `01a12aff-2703-71c2-ab00-cc7ae733ca2a` 使用 `http://127.0.0.1:18324/`；控制文档工作不得启停该实例。

## 活动工作、阻塞与下一步

- D3-5A 生产候选在 `2ecfc0c` 主体上已有真实服务、CLI、持久化预算及浏览器消费者证据：服务6/6、旧parser窄回归3/3；CLI窄测4/4、旧clock-smoke 1/1、有界reader 1/1；Edge组合1/1（92.5秒）；新profile metadata负例1/1。format8 128输入/129正式service文件边界1/1（269秒）；旧profile 128文件上限1/1（127条真实命令，887.98秒）。这些是既有定向回执，不代表新候选整体验收。
- B1 15项、B2 7项（2+3+2）、B3 6项共28个独立成员已分批通过、无skip；并非一次28/28。B2新增 owner durable-failure 与G7共11种checkpoint变体均通过。原失败记录与定向补验保留，见[D3-5B复核](docs/runtime/D3-5B-REVIEW-20261013.md)。A唯一源码行为修复为 `d22c730` 的 owner queue 幂等优先级及回归；B测试候选提交 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb` 仅改B2测试。源码未推送、未合入main、未部署；D3整体未验收。
- D4 合同 `d4-scene-continuity-v1` 已冻结，基准 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb`；任务书见[A](tasks/D4A-SCENE-GIFT-MEMORY-TASK.md)与[B](tasks/D4B-SCENE-CONTINUITY-ACCEPTANCE-TASK.md)。CP1a、CP1b历史候选的修正与限定PASS记录保留；当前A完整施工候选已形成，CP1/CP2/CP3内部门完成。仍需B独立验收，D4及母合同整体尚未验收。
- D4A 当前基准树 `D:\Narraverse-World-Map\hds-d4-cp1a-review` @ `codex/world-runtime-d4-cp1a-review`，CP1a检查点 `c84d57d5b5fc4628fe5cb59986528574e924c4de`（父f7699fb，恰3core+1A测试，未push/main/deploy）。修复收粮库存恒等式/非actor-2接收限制/ownership预检；新14/14、hunter9/9、society8/8及旧6组初态/日结完整组件字节配对通过。见[D4A CP1a复核](docs/runtime/D4A-CP1A-REVIEW-20261013.md)。
- CP1b记忆层、CP1c、CP1d、CP2a、CP2b、CP2c各自限定PASS，见对应[D4A复核](docs/runtime/D4A-CP1B-REVIEW-20261013.md)及[CP2c复核](docs/runtime/D4A-CP2C-REVIEW-20261014.md)。A最终施工树 `D:\Narraverse-World-Map\hds-d4-cp1a-review` @ `codex/world-runtime-d4-cp1a-review`，提交 `254c27d143f735dfff2051f561dee129012b5a99`（父 `970471ab38b196c4f2f1e39d0bed026006ce2ff8`，仅两项A测试及478行，工作区干净）；90个生产文件hash不变。仅本地，未push/main/deploy。CP3结果及实测/交付UI字节差异见[D4A CP3复核](docs/runtime/D4A-CP3-REVIEW-20261014.md)。
- 流程优化已分给独立Codex对话 `01a133e5-db80-7e81-af05-941188b1598e`（DSH｜流程优化与中断恢复）；任务书/修复/实验全部在 `E:\codex\2026-10-13\dsh-workflow-optimization`，本项目仅只读参考，禁止改活动STATE/源码/合同/看板或续派业务。当前对话继续业务派工验收；两路不得共用包工头写入会话。
- D4 体验目标：给同村猎人一份私粮→立即记得本人收粮→日结实际吃粮→去森林完成遭遇→返回/刷新/关闭重开仍是同一人。局部知识展示同地点公开人物，不泄漏他人私账，不加信任或模型。合同版本、文件范围与手算见任务书，D 整体仍待体验收口。
- DSH 流程优化已落地：原包工头会话 `session-2564efe0-949b-48ed-90a5-f7f7feb9cbce` 使用Global DeepSeek Flash完成复盘与两名顺序工人接续演练；Codex独立核对并修正停止证明/证据归属。运行册 `D:\Narraverse-World-Map\docs\operations\DSH-TEAM-RUNBOOK.md`，持久检查点 `.dsh-team/STATE.json`；原生任务task-24/25为历史演练完成；当前业务状态以CP2c复核及A/B验收记录为准。
- 流程默认短工单/并发1、额度与502分流、最多一次重试及一个获准免费备选探测、工人和包工头各自落盘检查点；同文件换写者须有停止证据。CP2c门与上一轮真实128 journal/129档预算门均限定PASS。用户明确继续后，CP3严格day144续接1/1 PASS，与首轮已确认Gift/day144合并形成CP3功能门PASS；不是一次fresh完整全绿，首轮1 fail仍保留。A候选 `254c27d` 已就绪；完整合同需B独立验收，B未开始，D4及母合同未通过。细节、性能耗时及字节差异见[D4A CP3复核](docs/runtime/D4A-CP3-REVIEW-20261014.md)。
- 更早的R3、DSH停工与接管过程、旧候选拒收和上下文恢复等活动流水压缩为历史；本地证据相对路径：`artifacts/world-runtime-d35-hour-review-20261012/repair-workers-latest.json`、`artifacts/world-runtime-d35-r3-review-20261012/`。历史状态不代表当前验收结论。

## 证据入口

- [M4A 公共合同](tasks/M4A-BOUNDED-SURVIVAL-TASK.md) ·
  [M4B 独立验收](tasks/M4B-SURVIVAL-ACCEPTANCE-TASK.md) ·
  [M4B 最终复核](docs/runtime/M4B-REVIEW-20261011.md)
- [D3-1 预留内核](tasks/D3-1-ENCOUNTER-RESERVATION-TASK.md) ·
  [D3-2 世界候选](tasks/D3-2-ENCOUNTER-WORLD-TASK.md) ·
  [D3-3 命令会话](tasks/D3-3-ENCOUNTER-SESSION-TASK.md) ·
  [D3-4 战斗内核](tasks/D3-4-ENCOUNTER-COMBAT-TASK.md)
- [D3-5A 实现与公共合同](tasks/D3-5A-PLAYABLE-ENCOUNTER-TASK.md) · [D3-5B 独立验收](tasks/D3-5B-INDEPENDENT-ACCEPTANCE-TASK.md)；发布SHA：A `d13a89768c652f74c0c4278eea4f227cf4660a98`、范围补充 `f667adfcc47e1c470df9687eb2053906d83c3230`、合同rev3 `c83492dfb56b98bfdd1976196929c2d97f1f35db`。
- 本轮前旧版完整历史与细节：控制仓库快照 [3361d653](https://github.com/llys-p/Narraverse-World-Map/blob/3361d653a61d0ee7901426f3edd41b951017e2d6/PROJECT_CONTEXT.md)。
  历史日期结论只代表当时证据范围，不替代当前合同或源码核验。

## 角色与看板

- 总方向与架构由“GPT6 Astra world Map总负责人”对话负责；
  日常派工、回执与验收由“世界运行 主线 发布任务”对话负责。
  具体交接使用当前源码 SHA、合同和证据索引。
- DSH 包工头链接仅作历史交接入口，当前 D3-5 施工已由授权的 Codex 子代理完成；体验结论仍由对应体验对话核实。
- 专用看板：[World Map 项目进度](https://github.com/users/llys-p/projects/2)，
  owner `llys-p`，project #2；状态变化需读回并链接证据。
  正式平台 Project #1 独立维护。
- 本轮合同 rev3 勘误 `c83492dfb56b98bfdd1976196929c2d97f1f35db` 已推送并读回；D4 原预规划 `cb0067a` 保留为历史；历史发布时A/B任务待派。
  D卡正文保留D3-5限定PASS并登记D4发布；D仍进行中。当前A施工的CP1至CP3内部门均完成，候选提交 `254c27d` 已就绪；B独立验收未开始，D4整体仍未验收。原D4状态卡与证据保留，项目简介未改。
  CP2b看板读回入口：`artifacts/world-runtime-d4-cp2b-review-20261014/board-verification.json`；CP2c看板验证预定 `artifacts/world-runtime-d4-cp2c-review-20261014/board-verification.json`，须以root完成后的读回为准；此前合同发布证据保留于 `artifacts/world-runtime-d4-contract-20261013/`。
  旧接入边界方案标为冻结前历史，不以其“待冻结”措辞阻塞正式A/B合同；源任务副本与控制树逐文件指纹相等。
