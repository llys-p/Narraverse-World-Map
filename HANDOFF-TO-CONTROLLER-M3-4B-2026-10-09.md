# HANDOFF — M3-4B（B 路：独立验收与完整 M3 收口）2026-10-09 23:40

> 本文件是给**下一个接手 AI / 中控审核 AI** 的自包含交接件。只写事实与出处，不覆盖任何人的文件。
> 我（小Q，B 路执行者）在此停止推进。接手方请先读完 §1、§5、§7 三节再动手。
> 本目录不是本路的交付仓库；本文件刻意保持 untracked（与同区 `ADVISORY-TO-CONTROLLER-2026-10-09-ROUND2.md` 同规则）。

## 1. 任务与当前总口径（一句话）

执行 `D:\Narraverse-World-Map-control\tasks\M3-4B-M3-CLOSEOUT-ACCEPTANCE-TASK.md`（控制提交 `6c9ace5`），
按 `m3-closeout-contract-v1` 完成 G0–G5 独立验收。**G0–G4 成员级已验并本地提交；G5 只跑了 77/81 个文件 + 1 个文件的 9/15 条成员，且已有 3 条红。因此 M3 全阶段不能宣布 PASS，本路只能给"待裁决 + 待补跑"的中间态。**

约束（仍然有效，别绕）：本地精确提交即可，**不 push、不合并 main、不部署**；不修改控制状态文档/看板；不修改 A 路与 oracle；**不得为了让成员变绿而放宽期望值、预算或业务输入**；不跑旧的 100/500/1000 天长程实验。

## 2. 关键路径（绝对路径，别猜）

| 用途 | 路径 |
|---|---|
| 本路工作树（交付物） | `D:\Narraverse-World-Map-m3-closeout`，分支 `codex/world-runtime-m3-closeout` |
| 任务书/合同唯一权威 | `D:\Narraverse-World-Map-control`（分支 `codex/world-runtime-control`，tip `6c9ace5`） |
| A 路依赖树（**只读**） | `D:\Narraverse-World-Map-m3-inspector-review`，tip `ad4691f` |
| 旧代码基准 | `D:\Narraverse-World-Map-m1-integration`，SHA `87aa9b605f5f509ce3b0daa97e34ded004d22f33` |
| 历史 oracle（**只读，禁改/禁移/禁提交**） | `D:/Narraverse-World-Map-m2-acceptance/artifacts/world-runtime-m2-acceptance-repair-20261008/legacy-oracle-87aa9b6-v2.json` |
| 本路全部原始 TAP/日志证据 | `C:\Users\11\AppData\Local\Temp\m34b-g5\`（`all.txt` 81 成员清单、`rest_*` 分段清单、`seg1..seg5c.tap`） |
| G4 诊断脚本（临时，非交付物） | `%TEMP%\m34g4diag.mjs`、`%TEMP%\m34g4diag2.mjs` |
| ⚠ 遗留脚本，会**自己接着跑 G5** | `%TEMP%\m34b-run.sh`（G4→G5 串行；22:13 曾自动起过一次不合规 G5）——接手前建议先删或改名 |

环境实测：`node -v` = **v24.14.0**，win32，Git Bash（`C:\Program Files\Git\bin\bash.exe`），控制台 GBK，系统时区 +08。
Playwright 驱动：`C:/Users/11/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`；浏览器用本机 Edge `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。**无需安装任何东西**（任务书已核实）。

## 3. 提交链（本路，全部只在本地）

```
aa473a7 chore(integration): import M3-4A ad4691f for independent closeout acceptance   # blob 级等价已证
f1bb8c0 test: accept the cognition service6 gate independently                          # G1 初版
c1caa4a test: close the remaining G1 service gaps and harden cleanup                    # G1 补挂起期 GET 保旧/篡改/格式2/HEAD
97a080f test: run the real M2 learning and continuation chains                          # G2/G3（15 条成员）
720a58f test: add the browser consumer gate with two members verified                   # 诚实标注：当时只 2/4 验过
c5284c9 test: make the browser gate report failures instead of hanging                  # ★ 当前冻结字节，G4 四条成员全绿
```
起点是 B 准备修正版 `caf7b12`。`git status` 在 `c5284c9` 上为干净；远端**没有** `m3-closeout` 分支（`git ls-remote` 已核）。

## 4. 门状态（通过 / 失败 / 未验 分开写）

| 门 | 状态 | 证据 |
|---|---|---|
| G0 必备证据实体与门禁补丁 + 负例 | **通过** | `tests/simulation/m3-required-evidence.test.mjs` 9 条成员全绿；负例走真子进程：缺实体→`REQUIRED_EVIDENCE_MISSING`，截断 RAW/EISDIR/payload 漂移→`EVIDENCE_INTEGRITY_FAILED`，schema=3 或外来 baseline→`UNSUPPORTED_EVIDENCE_VERSION`；忠实副本经 `M34_ORACLE_FILE` 通过 |
| G1 服务 service6（12 条成员） | **通过** | `f1bb8c0`+`c1caa4a`；含 io.link 故障全回滚、挂起发布期 GET 保旧、config/cursor/mode/样本篡改、HEAD/GET 头一致 |
| G2 真实工作学习链 + G3 低频延续（15 条成员） | **部分**（9/15 在 G5 里重跑过，见 §5） | `97a080f`；手算表独立复算（710/700/650、窗口 F/S 序列、惩罚 100→0、日11=730） |
| G4 真实浏览器消费者 | **成员级通过 4/4** | 单条前台：断连 5.0s、M1/M2 回归 14.7s、日2/日3 53.0s、十日后 529.4s。**未验**：整文件一次调用跑绿（4 条合计 ~602s > 单条前台 600s 上限） |
| G5 冻结字节后集中一次完整套件 | **未完成** | §5 |

## 5. G5 实测数据（全部 `c5284c9`，串行、不重叠；每段一次前台调用）

| 段 | 覆盖 | tests | pass | fail | 时长 | 备注 |
|---|---|---|---|---|---|---|
| seg1 | `rest_00` 20 文件 | 309 | 307 | **2** | 435.5s | `--test-concurrency=2` |
| seg2 | `rest_01` 20 文件 | 177 | 177 | 0 | 266s | |
| seg3 | `rest_02` 20 文件 | 172 | 171 | **1** | 294s | |
| seg4 | `rest_03` 17 文件（含 3 个根检查器 + export-boundaries） | 120 | 120 | 0 | 103s | |
| seg5a | `m3-closeout-acceptance` 非链 7 条 | 7 | 7 | 0 | <1s | `--test-concurrency=1` |
| seg5b | 同上「ON 链前段」 | 1 | 1 | 0 | 34.5s | 写 `m34b-g2-evidence.json` |
| seg5c | 同上「ON 链后段」 | 1 | 0 | 1 | 570s | **⚠ 未验，不是红**：TAP `exitCode: 143` = 我的 `timeout 570` 发的 SIGTERM |

合计已记录 **786 条断言级 test**：**783 pass / 3 真红 / 1 超时未验**。文件覆盖 **77/81**。

尚未跑过：`experience-runner-acceptance`(11)、`cognition-service-acceptance`(12)、`cognition-inspector-acceptance`(4，整文件一次)、`m3-closeout-acceptance` 剩余 6 条成员（OFF 对照链 / 独立离线直跑链 / G3 低频延续 / 读数语义 / 纯推进反例 / A 路固定场景实体）+ 后段需重跑。

## 6. 三条真红（都不是本路字节造成的，且已在 A 树复现）

1. `tests/simulation/cognition-planner.test.mjs`（A 文件，`git diff ad4691f HEAD -- <file>` 为空）：42 条中 2 条红
   - `§1: model rejections — version, identity, fingerprint, anchors and baselines`（该文件 :277）
   - `C1: the result shares no mutable sub-object with its arguments`（该文件 :620-623）
   - 报错原文 `Invalid cognition signal baseline JSON`。根因：`runtime/core/cognition-state.mjs:39-49` 要求 `keyEvidenceFingerprint` 必须是 `{value, confidenceEnough, penaltyPermille}` 的 **canonical JSON**（还要求 `fingerprint === canonicalJson(semantic)`），而这两条测试传的是 `'fp-1'` / `'seed'` 这种随意串并期望被接受。**A 自己的测试与 A 自己的校验器矛盾。**
   - 复现（只读，不写）：`cd /d/Narraverse-World-Map-m3-inspector-review && node --test --test-concurrency=1 tests/simulation/cognition-planner.test.mjs` → 同样 `pass 40 / fail 2`。
2. `tests/simulation/motivation-state.test.mjs:337` `state surface is data-only: no world, memory, mind, runner or service export leaks in`（我 M2A1 路文件的**导出面冻结清单**过期）
   - 实际多出 5 个符号：`COGNITION_MAINTAIN_GATES`、`validateCognitionMotivationDecision`、`validateCognitionMotivationModel`、`validateExperienceMotivationDecision`、`validateExperienceMotivationModel`；期望 `[]`。
   - 出处：这 5 个由 `1b117d8 M3-3A`（A 的祖先、控制已收）加进 `runtime/core/motivation-state.mjs`，且 **M3-4B 任务书自己要求它们存在**（本路 `experience-runner-acceptance` 的 gate 就在检查 `validateExperienceMotivationDecision/Model`）。行为没坏，是清单没跟着更新。
   - 同样在 A 树复现红。

**接手 AI 注意**：这两处我都没动。①②的处置需要中控裁决（见 §8），不要自行"顺手修绿"。

## 7. 剩余待办（按顺序，含命令与预计时长）

单条前台 Bash **上限 600 秒**，本项目 service6 每笔提交都要重放整条 journal（O(n²)）：实测第 1 笔 6.6s → 第 12 笔 **100.5s**；12 笔串完 ≈ **530s**。所以"一次跑完 G5"在这台机器上物理不可能，只能**串行分段**，且**浏览器门不能和重段并发**（页面 `AbortSignal.timeout(6000)`，`runtime-mind.mjs:236`，满套件并发会被拖成假红）。

```bash
cd /d/Narraverse-World-Map-m3-closeout
G=/c/Users/11/AppData/Local/Temp/m34b-g5
# 1) 重跑 ON 链后段（上次被 570s 杀掉）。先删/换掉前段刚写的证据文件让它从头重建，或给它 >700s
rm -f "$G/../m34b-g2-evidence.json"   # 实为 %TEMP%\m34b-g2-evidence.json；旧的已改名 m34b-g2-evidence.preG5.json
timeout 590 node --test --test-concurrency=1 --test-reporter=tap --test-name-pattern="ON 链后段" \
  tests/simulation/m3-closeout-acceptance.test.mjs > $G/seg5c2.tap 2>&1; echo exit=$?
# 2) 其余 5 条成员逐条（每条单独一次调用；离线直跑/低频延续需要重开目录，本身就是重启证据）
for pat in "OFF 对照链" "独立离线直跑链" "低频延续" "读数语义" "纯推进不是合同反例" "A 路固定场景"; do ... --test-name-pattern="$pat" ...; done
# 3) 两个重 acceptor 文件按成员跑：cognition-service-acceptance（12 条）、experience-runner-acceptance（11 条，依赖 §oracle 指纹门）
# 4) 浏览器门整文件一次：>600s，必须分两次前台调用（成员 1/3/4 ≈75s；成员 2 ≈535s），并如实写"未单次整跑"
# 5) 汇总 manifest：SHA / node -v / 每段 TAP 路径+计数+退出码 / 前后目录指纹，然后本地精确提交
```

`m3-closeout-acceptance` 的可续跑机制：`EVIDENCE = process.env.M34B_EVIDENCE || %TEMP%\m34b-g2-evidence.json`（该文件 :217），前段写、后段读同一目录。**注意**：`t.after` 会删临时目录，跨调用续跑依赖这个 json 里记的目录仍存活——`mv` 走旧的 `m34b-g2-evidence.preG5.json` 是我留下的可逆副本，别当垃圾删。

## 8. 两个待裁决问题（我已停止，等回话）

1. **M2 导出面冻结清单**：那 5 个符号算不算合法扩展？若判合法，改法是给 `tests/simulation/motivation-state.test.mjs` 的 allowed 白名单加这 5 行并重跑该文件（只加白名单，不放宽任何断言）。
2. **A 的 2 条 vs `cognition-state.mjs`**：判 A 路退回自修（推荐，因为矛盾在 A 的交付内部），还是 B 路另起独立负例只记录不改？B 路白名单不含 A 的文件。

## 9. 本路已踩并修复的 G4 harness 坑（避免重复排查）

- **teardown 顺序**：`t.after` 按注册顺序执行。原先 `server.close()` 先注册 → Node 的 `server.close()` 要等浏览器那条连接释放 → 实测标签页开着时 **>15s 不返回**，先关浏览器则 3ms ok。结果：**任何断言失败都表现为整文件 300s+ 假死**，真实失败从来没打印过。修法：`trackCleanup(t)` 逆序执行 浏览器→服务→磁盘。
- **reload 复用空闲 socket**：长时间 POST 串后 `page.reload()`，Edge 复用连接池里空闲的 socket，服务端回 **400**（`runtime-server.mjs:38` `requestTimeout:5000`），页面进 `data-state=error`，于是"等 ready"20s 超时。修法：**世界先推到目标 revision，再开新页面读**；跨日改读用页面自己的 `#mind-refresh`，重试次数打进 TAP（`# refresh ... on attempt N`），不掩盖真实读失败。
- **`driveTo(server, 12)` 少一个参数**：`RECIPE.slice(12)` 是空数组 → 十日后成员**一笔都没提交**（静默）。已改 `(server, 0, 12)`。
- **`--test-name-pattern` + 中文名**：可用（Git Bash 传 UTF-8 正常）；但 `timeout` 杀掉的运行在 TAP 里也写成 `fail`（`exitCode: 143`）——**判"红"前必须先看 `exitCode`/`signal`**，否则会把超时当成真实失败上报（我这次就差点写错）。

## 10. 机器/流程坑（接手必读）

- 前台单条 600s 上限；长任务落盘为日志再另起命令读，**别在长命令尾部挂 `| grep | head`**（后台化时输出全丢）。
- Git Bash **没有 `setsid`**，`(cmd &)` 会随调用被回收；判活要实测三条一致：日志 mtime 是否推进、`Get-Process node | Select Id,CPU` 隔 6s 取两次（CPU 不变＝僵住，不等于在跑）、`grep -c "^ok"`。
- **`Stop-Process` 杀掉的 shell 会给 wrapper 报 `exit=127`**，看起来像"命令找不到"，其实是外部终止。
- 不要并发跑套件；套件跑着时不要编辑同一文件。
- `git status --porcelain` 干净时输出为空会断掉 `&&` 链，多步检查用 `;` 或打 marker。
- `core.autocrlf=true`：提交时提示 LF→CRLF 是正常噪声（`.sh` 文件才需要 `sed -i 's/\r$//'`）。
- 内联 `node -e`/heredoc 夹 CJK+嵌套引号会被 bash 吃掉，脚本写成文件再跑。
- **本会话用户三次明令：不得委派任何子代理，全程自办**；"代理已完成"的历史回报与磁盘不符，一律不采信，以自测为准。
- 我曾两次把话说错并已当场公开更正：①"分离式 runner 已死"（其实活着但 CPU 僵住）；②把 seg2 的失败文件名说成来自 seg2（当时只有 seg1 存在）。**接手方请复核我的每一条数字，别直接引用。**

## 11. 此刻磁盘/进程状态

- 两棵工作树都干净（本路 `c5284c9`；控制树 tip `6c9ace5`，其 4 个 untracked 文件是别人的，勿动）。
- 我起的 node/msedge **已全部清理**（三组僵死 G4 + 一次不合规 G5 + 21 个 Playwright Edge）。残留：仅用户自己的 `codexbridge-service.mjs`(14916) 与 weixin serve(24480)。**没有任何测试进程在跑。**
- A 树只被 `node --test` 读过，无写入；oracle 未改（RAW SHA256 `e7fee8c0…1b18`、canonical payload `1ebe129b…7f67` 在 G0 成员里复核过）。
