# M1B：只读心智检查器与服务接入

合同：`m1-contract-v1`；2026-10-08（Asia/Shanghai）。状态：待派发，未开工。公共 API、错误码与 DTO 只读 [M1 共同合同](M1-CHARACTER-MIND-CONTRACT.md) §8，不能自行改版。

## 给用户看

在开发者页面看清 NPC 收到了什么、相信什么、当时为何行动，以及最终成功还是失败。页面将世界事实与人物主观判断分开显示；刷新和切换人物都不会推进世界或修改心理状态。

## 开工与停止

- 计划目录/分支：`D:\Narraverse-World-Map-m1-service @ codex/world-runtime-m1-service`，当前尚未创建。
- 代码基准 `feb2856910bf8a9a6757aba892128d00d795bc15`；四份 M1 文档须从同一 M0 最终交付提交导入，派发时记录 SHA。保护现有 worktree/旧实例，不从 main 当作 runtime 起点。
- 可在 A 交付前用本路 test fixture 开发页面；明确标注模拟读数，默认生产路由不能悄悄 fallback 成 mock。实际依赖 A 的 §8.1 导出，由中控导入其交付，不在本路复制核心实现。
- 当前范围完成即交付；中控集成、独立验收和看板收口，不自行合并 main、做战斗/对话或调用模型。

## 文件白名单

新增：`runtime-mind.html`、`runtime-mind.mjs`、`runtime-mind.css`、`tests/simulation/mind-service.test.mjs`、`tests/mind-inspector.test.mjs`。

允许必要修改：`runtime/service/http-contract.mjs`、`runtime/service/service-commit.mjs`、`runtime/service/runtime-owner.mjs`、根目录 `runtime-server.mjs`、`runtime-map.html`、`runtime-map.mjs`。

禁止修改：整个 `runtime/core/**`、`runtime/knowledge/**`、`runtime/fixtures/**`、`runtime/persistence/**`、`simulation-runner.mjs`、A/C 的测试和原测试断言/预算。不批量整理旧地图 CSS、错误处理或浏览器存档。状态文档/看板由中控更新，不另建交付日志。

## 实现顺序

1. 按 §8.2 显式注册 mind-village/service format4；保留格式1/2/3、时间 DTO1、玩家 DTO2。M 的玩家执行/动作说明调用 A 提供的 M 适配，不将新版 world 伪装成 d-player-v2，也不在服务重做人物规则。
2. owner 接入 createMindVillage/mindSystems 和真实投影；明确加载 M checkpoint。getMindInspector 只读克隆缓存；提交时先构造并验证所有候选投影，再保存，再一起发布；故障保持旧状态。保留锁丢失、空目录、临时文件与冲突保护。
3. 增加默认关闭的 `inspectMind` / `--inspect-mind true|false`。只在显式开启且支持 M 时暴露 `/api/runtime/minds` 和三份检查器静态文件；普通页面 capabilities.mindAvailable 控制入口。GET/HEAD只读，其他方法/查询串/无能力按合同拒绝。
4. 页面初始无决定、当前未知、已经纠正、成功/拒绝、死亡封存和断连均有清楚状态。两人选择本地切换，手动刷新；每份读数绑定单一 revision，迟到读取不得覆盖新读数。用 textContent 等安全呈现数据，不将配置名称/字符串作 HTML。
5. 与 A 实交付集成后替换 mock 路径，完成真实 HTTP 与浏览器消费者。界面不提供编辑心理字段、发送实验发言、隐式推进时间或真实模型按钮。

## 定向验证与演示

```powershell
node --test --test-concurrency=2 tests/simulation/mind-service.test.mjs tests/mind-inspector.test.mjs
node --test --test-concurrency=2 tests/simulation/player-play-service.test.mjs tests/simulation/runtime-boundary-recovery.test.mjs tests/simulation/time-http.test.mjs
git diff --check
```

使用自己新建的 artifacts 目录和确认空闲端口；程序化测试用 port0；禁止启停原18212/18302/18312等实例。手动演示命令在本路实现完成后才成立：

```powershell
node runtime-server.mjs --data-dir artifacts/world-runtime-m1/demo --profile mind-village --writable true --inspect-mind true --port 18316
```

端口占用时换已确认空闲值，不清理他人服务。真实浏览器打开原地图与 `/runtime-mind.html`：键盘选择人物/刷新、空态、推进24→144后当前判断与旧决定分开、双页签/断连读取、关闭开关404。推进24/120可用冻结 HTTP DTO 精确提交，页面现有时间预设不提供此值时不要扩大游戏控制 UI。

只读检查：重复读取的 tick/revision/输入与所有已发布状态文件字节不变。写消费：同一组服务时间/玩家动作所得完整 bundle 与核心直接执行一致，跨重启同 ID 重试只执行一次；service4 保存失败前后检查器与公共/player投影必须一致。补 profile3 的直接兼容，不重跑全部模拟或生态长程。

页面 mock 检查、真实服务检查和浏览器检查分别报告；未接 A 时只能交付前两者中实际完成的 mock 部分，不能报 M1B 完整通过。最后关闭本路启动的临时服务，保留可定位证据；不删除其他树或运行数据。

## 交付回执

给用户说明检查器入口、能看到什么和未完成项；给中控提供基准/A依赖/本路 SHA、文件范围、实际命令结果、真实浏览器证据、读零写与恢复证明、临时目录/进程归属。独立复验前状态为待验收，不自行更新阶段结论。
