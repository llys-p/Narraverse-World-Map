# 当前状态与接手方向

更新时间：2026-10-13 09:40（Asia/Shanghai）。当前进度仅在本文件维护。
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
- D3-5 候选已接入真实世界推进、M4 生存规则、服务持久提交、CLI 保存/恢复及页面消费者；真实 Edge 组合链和128输入服务预算边界均有定向证据。A内部施工已结束，但独立B验收未通过，故不称D3-5已验收或正式产品接入。

## 集成基准与实际位置

- 控制文档树：`D:\Narraverse-World-Map-control`，分支 `codex/world-runtime-control`；
  本轮改写前 HEAD `9baf3d636b0c6e30e678aeacf754904e93225e35`；改写前完整状态见上方保留的 `3361d653` 快照链接。
- D3 施工树：`D:\Narraverse-World-Map\hds-reservation`，分支 `codex/world-runtime-d3-reservation`；A基准 `f335abf30e3eef9d1b40a99a791a6c3c6ae962ab`，当前冻结源码 HEAD `2ecfc0cd5c8991d57053e2e04c17a312469ef96f`，未推送、未合入 main、未部署。
- 新遭遇规则使用隔离的 profile/schema，旧 profile 与存档行为保持；M4 正式实现和生产边界不变。M4 独立体验对话 `01a12aff-2703-71c2-ab00-cc7ae733ca2a` 使用 `http://127.0.0.1:18324/`；控制文档工作不得启停该实例。

## 活动工作、阻塞与下一步

- D3-5A 生产候选在冻结源码 `2ecfc0c` 上已有真实服务、CLI、持久化预算及浏览器消费者证据：服务6/6、旧parser窄回归3/3；CLI窄测4/4、旧clock-smoke 1/1、有界reader 1/1；Edge组合用例1/1（92.5秒）；新profile metadata负例1/1。format8 128条输入/129个正式service文件边界1/1（269秒），第129个新ID拒绝、幂等重试与关闭重开通过；旧profile 128文件上限1/1（127条真实命令，887.98秒）。相关源文件哈希和原始证据在各执行回执与测试文件中核验。
- A 服务/CLI/UI内部施工已结束；B1完整独立验收15项中10通过、5失败、0跳过（503.788秒）；五个失败正在核对测试构造与字段口径，当前仍未通过。B2仍在运行，B3只有helper语法准备，尚未验收。下一步为定向补验B1五红，再完成B2、B3及整体门槛；D3-5和D3整体均未验收，源码未推送、未合入main、未部署。
- D4仍是预规划：村庄赠粮→本人立即记忆→保存/返回→双页签验收；仅有未来A实现/B独立验收任务构想，未发布、未开工。须等D3-5验收后再钉定SHA与版本，见[架构 D4 预规划](WORLD-RUNTIME-ECOLOGY-ARCHITECTURE.md#d4-scene-continuity-plan)。
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
- 本轮合同 rev3 勘误 `c83492dfb56b98bfdd1976196929c2d97f1f35db` 已推送并读回；D4 预规划 `cb0067a` 已保存，未派发。
  D卡正文同步A冻结与B待验状态；D仍进行中，全部单选字段及其它61卡不变，项目简介本轮未改。
  最新看板读回：`artifacts/world-runtime-d35-r3-review-20261012/board-b-start-verification.json`；同目录保存反例与原生修正回执。
  旧接入边界方案标为冻结前历史，不以其“待冻结”措辞阻塞正式A/B合同；源任务副本与控制树逐文件指纹相等。
