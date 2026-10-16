# D4E6 重要人物真实行为追踪：中控限定验收

更新时间：2026-10-16 18:30（Asia/Shanghai）。结论：**D4E6 冻结范围限定 PASS**。人物当前状态与最近事实可以在真实页面中分开追踪；不代表 NPC 新移动规则、完整人物传记、长期生存平衡或日常性能通过。D 整体仍进行中，性能 Issue #3 保持开放并暂停。

## 1. 对象、实现与职责

| 项目 | 精确对象 |
|---|---|
| 执行树 / 分支 | `D:/Narraverse-World-Map-person-tracking` / `codex/world-runtime-person-tracking` |
| 基准 D4E5 | `6ed72635185f4c828f7703473574f339833c6ce2` |
| 冻结合同 | `22c3dd370722f84fb67ce085adae021a3be35a05`，`tasks/D4E6-IMPORTANT-PERSON-TRACKING-TASK.md` |
| 被浏览器核验的实现 | `c7c213239911976ce45c6403c67f750e091e19b8` |
| 控制树 / 分支 | `D:/Narraverse-World-Map-control` / `codex/world-runtime-control` |
| 环境 | Windows，本机 Node.js v24.14.0，`C:/Program Files/nodejs/node.exe` |

执行者使用性价比子模型完成允许范围实现和唯一新测试；中控独立审查源码、保护已有服务/存档，并使用真实浏览器复核实际消费者。未使用 DSH 或外部模型服务。实现提交只改合同内九份文件：`runtime/service/world-activity.mjs`、`runtime-activity.mjs`、`runtime-map.html`、`runtime-map.mjs`、`runtime-map.css`、`Start-D4.cmd`、`README.md`、`docs/runtime/D4-EXPERIENCE-ENTRY.md` 与新增定向测试。

人物卡复用已有 selector，显示姓名、职业、当前位置、存活及同版 revision/tick；另列最近窗口内成功、拒绝、未行动、日结、等待结果的条数。统计覆盖该人物的全部近期条目，不随地点筛选变化。选“全部”隐藏卡片并显示选择提示。近期窗口沿用 v1 的最多 256 个来源、64 条活动与 65536 字节限制，不承诺完整历史。

NPC 日结直接读取同一 `SocietyDaySettled.payload.actors.rows` 的实际取食、药材、休息减疲劳、期初/期末健康饥饿疲劳及 closing.location；地点明确称“日结收尾地点”。0 值保留。玩家日结消费事件没有地点，继续显示未知，未跨事件拼接或用现址补历史。已有动作摘要可显示明确字段内的资产差值，未直接暴露原始 payload。

## 2. 执行命令、次数与时限

唯一新定向文件：

```powershell
node --test tests/simulation/important-person-tracking.test.mjs
```

两名成员实际 PASS：纯模型筛选/五状态/无记录/换人/版本不匹配 2.3571 ms；真实 owner/HTTP 创建默认 scene seed42、**一次** AdvanceTime 144 并核对正式 r144 日结及活动 API 34363.9208 ms。Node runner 34608.9043 ms，监督父进程墙钟 35.187 秒；PID 48244，exit 0，fail/skip/cancel/todo 均 0。外层硬限 120000 ms，watchdog 截止 114000 ms，未触发。原始 stdout/stderr/process 元数据随证据保留。测试内嵌 HTTP 服务使用系统分配端口，结束后关闭；不是启动日常入口。

**证据限制**：上述测试后，执行者还把玩家死亡日结分支中的重复取食文字删除，并做语法/diff 检查；因此不能称该 2/2 覆盖最终提交的死亡分支。中控对最终分支静态审查，最终提交的正常存活路径通过下述浏览器/API 重读。没有追加死亡、工作、买粮、卖药或正数减疲劳样本，相关分支仅静态核对，不冒称动态通过。

浏览器复用唯一世界，不再推进时间：

```powershell
node artifacts/d4e6-controller-20261016/browser-server.mjs artifacts/d4e6-person-tracking-tests/run-f36e66cf-0fe4-4664-975c-9af1e7e3baeb/world
node artifacts/d4e6-controller-20261016/inspect-world.mjs before-browser artifacts/d4e6-person-tracking-tests/run-f36e66cf-0fe4-4664-975c-9af1e7e3baeb/world
# 浏览器真实选择人物、地点、刷新
node artifacts/d4e6-controller-20261016/inspect-world.mjs after-browser artifacts/d4e6-person-tracking-tests/run-f36e66cf-0fe4-4664-975c-9af1e7e3baeb/world before-browser
# 向监督父进程输入 quit，正常关闭；恢复同一世界
node artifacts/d4e6-controller-20261016/browser-server.mjs artifacts/d4e6-person-tracking-tests/run-f36e66cf-0fe4-4664-975c-9af1e7e3baeb/world --reopen
node artifacts/d4e6-controller-20261016/inspect-world.mjs reopened artifacts/d4e6-person-tracking-tests/run-f36e66cf-0fe4-4664-975c-9af1e7e3baeb/world before-browser
# 再次 quit，保护终检
C:/Python311/python.exe artifacts/d4e6-controller-20261016/protect-final.py D:/Narraverse-World-Map-person-tracking/artifacts/d4e6-person-tracking-tests/run-f36e66cf-0fe4-4664-975c-9af1e7e3baeb/world
```

监督器实际启动：`node runtime-server.mjs --data-dir <上述隔离 world> --port 18332 --writable true --inspect-mind false --inspect-activity true`。两次 PID 46484 / 49436，各有 600000 ms 硬限和 5 秒强制退出后备，均正常 exit 0、未超时；服务存活墙钟 75899 / 180015 ms，包含浏览器交互和等待，**不是性能测量**。父进程脚本也随证据保存，原始产物留在 artifacts 下。

## 3. 独立页面与真实日结结果

中控以 Codex 浏览器的真实 DOM/语义控件核验 `http://127.0.0.1:18332/runtime-map.html`；未做截图、录屏、视觉或布局验收。最后关闭临时页。实际 tick/revision 均 144，四人存活且当前都在村庄；现有规则固定三名 NPC 在村庄，玩家旅行保持原有能力。

| 人物 | 成功 / 拒绝 / 未行动 / 日结 / 等待结果 | 实际日结摘要 |
|---|---|---|
| 村长 | 1 / 0 / 0 / 1 / 0 | 私粮消耗 1，药 0；健康 1000→1000，饥饿 0→0，疲劳 0→0；减疲劳 0；收尾村庄 |
| 猎人 | 0 / 0 / 1 / 1 / 0 | 私粮消耗 **0**，药 0；健康 1000→1000，饥饿 **200→300**，疲劳 0→0；减疲劳 0；收尾村庄 |
| 商人 | 0 / 0 / 1 / 1 / 0 | 私粮消耗 1，药 0；健康 1000→1000，饥饿 0→0，疲劳 0→0；减疲劳 0；收尾村庄 |
| 玩家 | 1 / 0 / 0 / 1 / 0 | 消耗本人私粮 1；消费事件地点仍未知 |

村长唯一实际行动为 Rest；猎人和商人是 NoAction。玩家“成功 1”是 AdvanceTime，不是购买或工作。没有为了展示字段强行制造工作/取食成功，不能把本样本当成生存策略改善。

页面逐项结果：

- 四人切换，卡片、活动 ID 与摘要对应本人；“全部”回到 10 条，卡片隐藏、提示可见。
- 猎人列表为 `event-8-item-0` 与 `event-10-item-1`；筛森林后列表为空，但卡片仍未行动 1 / 日结 1；筛未知后只剩 NoAction，日结的已知收尾地点不混入未知。
- 复位地点并刷新，猎人卡与两条记录保持；刷新前后 API 五读数及两份档哈希相同。
- 正常关闭/恢复同一样本，页面默认选择重置为全部；重新选猎人，卡片与两条记录与关闭前一致；选择持久化不是本任务承诺。
- 本轮页面控制台 error 两次读取均为空。失败保留旧同版组与过期提示路径做了源码审查，未另做断网注入动态测试。

## 4. 散列与保护

五项读取的原始 HTTP 响应正文按 SHA256 计算（不上传完整正文）；`before-browser.json`、`after-browser.json`、`reopened.json` 的整个核对对象深相等，包含世界身份、144/144、人物计数、日结摘要、以下五签名与正式文件签名。

| 对象 | SHA256 |
|---|---|
| snapshot | `87012c5ce0bb0f9ac988e89f67b654fe26b4936a17eca1da914ea1a6776ffca9` |
| player | `c4007efa3b4cda9adcaa961089432ea20d9d4c799aafdd3413611e18332edc58` |
| scene | `9327b4fa282af1cbdc087edafffb3ed506479eaceef0c7c9c985c45d4ddf01ef` |
| encounter | `151685207749dcedd0041b1ef15d4878f119c15e0cc309dc472a93c086ba06ba` |
| activity | `0593aaa95f627c8af1e7f97c3d67b353c7d253a3f8eb1003f608275b3d8b1711` |
| sample service-commit-r0.json 原字节 | `85e64edf68191c897831d01abc5edadbaac278f8c92f1f85cac3d86d15cd3b7b` |
| sample service-commit-r144.json 原字节 | `58d1eb49f9366f0819826d8b92fbd14d18878d25fe0f24a4ad3d5ddf6c6dcd5d` |

18:27:58+08 保护终检确认：原八份私档逐字节未变；除允许的 world-activity 以外其余 77 份 runtime 文件均与基准相同；控制树五份既有未跟踪文件不变；用户服务 **18325 PID2592** 与 **18327 PID4432** 的进程身份、源码状态和已有 9/3 份正式档不变。两次本轮 CLI 测试进程均退出，无匹配测试 Node、无测试锁。候选 18331 的默认日常世界未创建，未启动默认入口。

core、Knowledge、owner、Runtime Server、持久化、历史重演、存档 schema 与 API/DTO v1 结构均未改；活动读取仍经原完整 validateBundle，默认 inspect-activity 关闭。旧 D4E3/E4/E5 的输入、篡改拒绝、失败回滚等同源有效证据按未变职责复用，**不计入本轮 2 项测试**；未重跑全量、旧 H7、180 tick 或 128 命令链。

## 5. 参考复用、交付与停止点

Reference Review：复用现有事实事件、公开只读活动 DTO、人物 selector、原同版刷新机制及确定性日结。不新增通用人物数据库、轨迹猜测、知识注入或第三方依赖；将可重建展示留在派生层。本轮未做互联网调研。

证据在 [docs/evidence/d4e6-20261016](../evidence/d4e6-20261016/)；保留原始测试 stdout/stderr 与进程/超时元数据、浏览器 DOM 读数摘要、三次同版读取签名、前后保护、两次正常退出和 Projects 状态读回。`SHA256SUMS.json` 覆盖同目录其他证据原字节，`.gitattributes` 禁止换行归一化；暂存后逐份核对 Git blob 字节。仅上传测试/保护元数据与公开展示摘要，没有原私档、测试 service-commit 正文或完整世界投影。

实现先交付推送并进入待验收；中控完成上述核验后，将 D4E6 标 Done/已验收并读回正文与两个字段，D 整体保持 In Progress/进行中。报告、证据、控制状态与指导书同步各自独立分支；远端精确 SHA 读回作为本次交付收尾。未合 main、部署、迁移、启停现有用户服务或扩图。

本片结束停止。下一步先结合现有体验暴露的具体卡点确定最小任务；NPC 新移动/工作安排、生存策略、更多地点与性能优化均未因此自动开工。
