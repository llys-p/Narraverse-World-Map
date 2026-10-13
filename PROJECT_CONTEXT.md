# 当前状态与接手方向

更新时间：2026-10-13 12:48（Asia/Shanghai）。当前进度仅在本文件维护。
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

- 控制文档树：`D:\Narraverse-World-Map-control`，分支 `codex/world-runtime-control`；
  本轮改写前 HEAD `32f98e27360cbe2d22b227713d5a82362d402ee7`；改写前完整状态见上方保留的 `3361d653` 快照链接。
- D3 施工树：`D:\Narraverse-World-Map\hds-reservation`，分支 `codex/world-runtime-d3-reservation`；A生产冻结为 `d22c730707646eabe8c68b4d2c739e09f942fbab`（主体祖先 `2ecfc0cd5c8991d57053e2e04c17a312469ef96f`，仅含 owner 队列修复和A回归测试）。B测试提交为 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb`（父3c、仅新增/扩展B2测试）；源码未推送、未合入main、未部署。
- 新遭遇规则使用隔离的 profile/schema，旧 profile 与存档行为保持；M4 正式实现和生产边界不变。M4 独立体验对话 `01a12aff-2703-71c2-ab00-cc7ae733ca2a` 使用 `http://127.0.0.1:18324/`；控制文档工作不得启停该实例。

## 活动工作、阻塞与下一步

- D3-5A 生产候选在 `2ecfc0c` 主体上已有真实服务、CLI、持久化预算及浏览器消费者证据：服务6/6、旧parser窄回归3/3；CLI窄测4/4、旧clock-smoke 1/1、有界reader 1/1；Edge组合1/1（92.5秒）；新profile metadata负例1/1。format8 128输入/129正式service文件边界1/1（269秒）；旧profile 128文件上限1/1（127条真实命令，887.98秒）。这些是既有定向回执，不代表新候选整体验收。
- B1 15项、B2 7项（2+3+2）、B3 6项共28个独立成员已分批通过、无skip；并非一次28/28。B2新增 owner durable-failure 与G7共11种checkpoint变体均通过。原失败记录与定向补验保留，见[D3-5B复核](docs/runtime/D3-5B-REVIEW-20261013.md)。A唯一源码行为修复为 `d22c730` 的 owner queue 幂等优先级及回归；B测试候选提交 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb` 仅改B2测试。源码未推送、未合入main、未部署；D3整体未验收。
- D4 合同 `d4-scene-continuity-v1` 已冻结：基准 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb`；[A 村庄赠粮与本人记忆](tasks/D4A-SCENE-GIFT-MEMORY-TASK.md)、[B 独立验收](tasks/D4B-SCENE-CONTINUITY-ACCEPTANCE-TASK.md)。A 待派发、B 等待 A 精确交付；尚无 D4 生产实现或验收证据。任务书共同发布提交见本轮控制 Git 及看板链接，不引用未提交源码。
- D4 体验目标：给同村猎人一份私粮→立即记得本人收粮→日结实际吃粮→去森林完成遭遇→返回/刷新/关闭重开仍是同一人。局部知识展示同地点公开人物，不泄漏他人私账，不加信任或模型。合同版本、文件范围与手算见任务书，D 整体仍待体验收口。
- DSH 已停工；本轮只完成合同准备和发布。后续施工可交现有包工头或外部执行者；经济型子代理负责有界辅助，复杂核心升级 Astra 需用户授权。A 内按短检查点推进，最多两名写入者且共享核心单一所有权；不把任务书发布计作开工。
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
- 本轮合同 rev3 勘误 `c83492dfb56b98bfdd1976196929c2d97f1f35db` 已推送并读回；D4 原预规划 `cb0067a` 保留为历史；本轮发布两份冻结任务书，尚未开工。
  D卡正文保留D3-5限定PASS并登记D4发布；D仍进行中。新增D4A/B两张待派发卡，原61张其它卡不变，项目简介本轮未改。
  最新看板读回：`artifacts/world-runtime-d4-contract-20261013/board-verification.json`；同目录保存反例与原生修正回执。
  旧接入边界方案标为冻结前历史，不以其“待冻结”措辞阻塞正式A/B合同；源任务副本与控制树逐文件指纹相等。
