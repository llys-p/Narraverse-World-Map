# 当前状态与接手方向

更新时间：2026-10-11 23:32（Asia/Shanghai）。当前进度仅在本文件维护。
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

- 本轮只整理文档并准备边界方案；不开发生产功能、不启停服务、不处理存档或密钥。
- 下一步按 [D3-5 接入边界方案](tasks/D3-5-INTEGRATION-BOUNDARY-PLAN.md) 推进；方向方案已完成中控复核，具体字段、接口、版本号与白名单待冻结，尚未发布实施合同或派工。
- 方案候选命名为 `encounter-survival-village` / `d-encounter-survival-v1`，名称仍待合同冻结。
  保留旧 profiles 与旧存档行为，不自动迁移；集成基准候选为 `f335abf`。
  冻结后最多两份实施任务书：A 完整窄场景实现，B 独立验收。
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
- 本轮文档与接入方向主提交 `106defb86247194240c70d5e6b943773f16a0fd4` 已推送并读回。
  D卡与项目简介已同步为“D3-5方向已定，未实施”；D仍进行中，全部单选字段及其它61卡不变。
  文档/历史保全检查与看板读回索引：`artifacts/world-runtime-route-refresh-20261011/documentation-check.json`、`board-verification.json`。
