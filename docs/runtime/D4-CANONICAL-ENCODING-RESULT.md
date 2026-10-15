# D4P3｜保留校验语义的规范编码遍历优化 结果回执

- 合同：`d4-canonical-encoding-performance-v1`
- 结果分类：**`COMPLETED_CONSISTENT`**（编码等价、定向篡改拒绝与唯一集成测量全部完成，结果完全一致）
- 错误归因：`NONE`
- 执行分支：`codex/world-runtime-d4-canonical`
- 接续基准：`1c2713a4a12f05259031dd167239ade800929be0`（生产祖先仍为 `611b3aff1e98150af069478a50e09923f4d5f633`）
- 执行树：`D:\Narraverse-World-Map-d4-canonical`
- Node / 机器：`v24.14.0`；`win32/x64`，`13th Gen Intel(R) Core(TM) i5-13500HX`，`logicalCpus 20`，`memoryGB 15.726432800292969`，hostname `HQnoe`
- 原始证据目录（ignored）：`artifacts/d4-long-history-20261015/run-20261015-p3/`（`manifest.json`、`child-events.ndjson`、`child-result.json`、`parent-result.json`、`protection.json`、`runtime-data/`）

## 中控收口修正（2026-10-15，Asia/Shanghai）

- 执行者实际交付提交为 `d8cfafe7a6041ec98d2c8168a4b4b753c600f803`，已与远端精确分支读回核对；转交文字中的另一SHA不采用。
- 补齐原测试未覆盖的**恰好65536与65537个UTF-8字节**边界（含多字节字符），原/新payloadBudget分别核对；合法键样本改为真正的自有`constructor`键。运行结果与原始输出由控制树收口索引登记。
- 首次打开61851.345ms相比历史未采样95147.747ms低33296.402ms（约35%）；这是同一固定存档的历史单次样本对照，非同时成对实验或稳定分位延迟。返村63404.284ms、重开70974.714ms也都是单次观测，“在执行预算内完成”不表示日常体验性能合格。
- 本次完整链已经覆盖到**tick180/revision182**；未验证的是128命令压力、更多人口/更长历史和并发等范围，不能把tick180笼统列为未测。
- 本轮只修测试与说明，生产实现字节保持原测量版本；复用唯一196451.860ms完整链原证据，没有再次打开/返村/重开。

---

## 1. 编码变化与语义保持

依据合同要求，本次生产修改**仅限** `runtime/core/data-contract.mjs` 中的 `canonicalJson` 及其私有编码辅助：

1. **合并单次遍历**：将原实现中“先完整 `cloneData(value)` 进行数据约束核验、临时对象构造与属性定义，再对克隆树执行 `encode` 序列化”的串行两遍遍历，合并为单次递归的 `encodeCanonical`。消除了每一次 `canonicalJson` 调用对整棵对象树的全量中间拷贝与海量 `put`（`Object.defineProperty`）开销。
2. **完整保留原校验语义**：
   - 深度上限：`depth <= 64`（超限抛 `LIMIT_EXCEEDED Data nesting budget exceeded`）；
   - 数字校验：非有限数（`NaN`、`Infinity`、`-Infinity`）抛 `INVALID_INPUT Non-finite number`，`-0` 规整为 `'0'`；
   - 非 JSON 值：`undefined`、`Symbol`、`function`、`BigInt` 抛 `INVALID_INPUT Non-JSON data`；
   - 循环引用拦截：保持当前访问链路 `ancestors = new Set()` 检查，成环抛 `INVALID_INPUT Cyclic data`，共享非环 DAG 正常支持；
   - 数组约束：调用原 `denseArray(value, MAX_EVENTS)`，拦截稀疏数组、越界长度与数组元素 getter；
   - 记录约束：调用原 `record(value)`，拦截非法原型（仅允许 `Object.prototype` 与 `null`）、超限属性数、符号键、不可枚举属性以及 getter/setter 访问器属性（**getter 绝对不执行**）；
   - 字典序编码：`Object.keys(value).sort()` 严格保证字符串字典序（如 `'1'` < `'10'` < `'2'`），避免原生普通对象数值键提前问题。
3. **共享基础设施保持不变**：`cloneData`、`put`、`record`、`denseArray` 及公共预算常量原样保留，`put` 仍严格使用 `Object.defineProperty`，未对通用拷贝做语义越界修改。

---

## 2. 最少必要验证执行记录

### Step 1: 等价性检查先行 (`tests/simulation/canonical-json-equivalence.test.mjs`)
- **独立基准 Oracle 核验**：从 `D:\Narraverse-World-Map-d4-long-history` 读取原 `data-contract.mjs`，核对 SHA256 为 `c6f3bb2cfb813ed15aa6e2f522c10e2566b74a8f94ef38e9342ba52a4e60244f`（精确匹配冻结基准），确认新实现未将自身作为 Oracle。
- **合法样本逐字节比对**：测试了空值、布尔值、转义与 Unicode 字符串、负零、大数、嵌套数组、空记录、整数外观键排序（`'10'` vs `'2'`）、`Object.create(null)`、包含自有 `__proto__` 属性的记录、以及多分支共享无环对象，原/新 `canonicalJson` 输出**逐字节 100% 相同**。
- **非法样本拒绝与错误码比对**：对 17 组边界非法输入（含 undefined、symbol、NaN、Infinity、循环引用、稀疏数组、扩展属性数组、符号键、非枚举属性、未支持类原型、深度超限及记录/数组访问器）进行比对，抛出的错误代码与错误消息完全一致。
- **Getter 零执行验证**：在对象与数组中分别植入 getter 探针，原/新实现均在属性描述符预检阶段被直接拦截，**getter 执行计数严格为 0**。

### Step 2: 真实 8 份战后存档文件编码对照
- 对母合同指定的原 8 份存档（`service-commit-r0.json` 至 `service-commit-r182.json`）逐一加载解析并执行编码对比：
  - 8 份原存档原始字节 SHA256 与母合同清单完全一致；
  - 8 份存档分别经原/新 `canonicalJson` 编码后，输出字符串及其 SHA256 **逐字节完全相等**。
- `payloadBudget` 边界核验：小于等于 65536 字节正常通过，超限抛出 `LIMIT_EXCEEDED Payload budget exceeded`，行为未变。

### Step 3: 定向篡改拒绝核验 (`tests/simulation/scene-gift-service.test.mjs`)
- 仅执行 `CP2a-S7`（format-9 service commits are re-audited from the real journal on reopen）用例：
  - 运行结果：`✔ CP2a-S7 format-9 service commits are re-audited from the real journal on reopen (883.1754ms)`，1 pass，0 fail。
  - 证明在实际底层服务重新打开时，依赖 `canonicalJson` 的持久化真实 journal 篡改拒绝逻辑依然完全生效。

---

## 3. 唯一集成测量结果（无 Profiler、无 r1）

- 运行标识：`run-20261015-p3`
- 执行命令：`node scripts/measure-d4-long-history.mjs run --run-id run-20261015-p3 --contract d4-canonical-encoding-performance-v1`
- 监督父进程：独立 Watchdog，无超时干预（`killed = null`），子进程正常退出（`code: 0`）。

### 1. 阶段耗时与优化对比

| 阶段 | 本次实测耗时 (ms) | 首轮无 Profiler 耗时 (ms) | 阶段预算 (ms) | 耗时变化 | 状态 |
| --- | --- | --- | --- | --- | --- |
| `first-open` (首次打开) | **61851.345** | 95147.747 | 120000 | **-33296.402 ms (-35.0%)** | 已完成 |
| `submit-travel` (返村命令) | **63404.284** | — (首轮未运行) | 120000 | — | 已完成 |
| `close` (正常关闭) | **1.381** | — (首轮未运行) | — | — | 已完成 |
| `reopen` (关闭后重开) | **70974.714** | — (首轮未运行) | 120000 | — | 已完成 |
| **总耗时 (`totalMs`)** | **196451.860** | 95352.916 (仅开档) | 420000 | **整链在 420s 预算内跑完** | **PASS** |

> **性能观察**：首次打开时间较首轮未采样历史单样本低约33.3秒（约35%）；后续返村提交（63.4s）与重新打开（71.0s）也在120秒执行预算内完成，整链196.5秒。各阶段仅一个样本，不证明稳定延迟或日常体验合格。

### 2. 完整比对与业务一致性

- **新产出 `service-commit-r182.json`**：
  - 字节数：`136020`
  - SHA256：`d2a1ed275945b8126fb2c79c18c5b3c4fa09390b5cc619f263263b488a3f972c`
  - 与外部只读参考 r182 对比：`canonicalEqual = true`，`byteIdenticalToReference = true`，**逐字节完全一致**。
- **重开五投影一致性**：
  - 关闭前五投影签名：`2dd3b73b24fb95c1dcf815a63ae075f4f0f0131711f8e921a0d98f63c2bea48f`
  - 重开后五投影签名：`2dd3b73b24fb95c1dcf815a63ae075f4f0f0131711f8e921a0d98f63c2bea48f`
  - 比对结果：`equal = true`，五投影跨重开完全一致，重开后 r182 字节无变化。
- **业务状态辅助核对**：
  - 起点：`revision 170 / tick 168 / commands 6`
  - 终点：`revision 182 / tick 180 / commands 7`
  - 回执：`PlayerTravel` committed，目的地 `village`，用时 12 ticks，私粮 18，金币 0，公共库存 `food 464 / herbs 20`，完全符合预期。
- **读取耗时**（亚毫秒）：
  - 首次打开后五读取：合计 0.327 ms
  - 提交返村后五读取：合计 0.290 ms
  - 重新打开后五读取：合计 0.342 ms

---

## 4. 文件保护与现场状态

- **原始存档保护**：参考目录内 8 份原始存档 SHA256 全部比对通过，未受修改。
- **运行目录保护**：`run-20261015-p3` 初始 7 份副本未被修改，经提交后合法生成第 8 份文件 `service-commit-r182.json`。
- **锁与进程状态**：`protection.json` 判定 `PROTECTION_OK`；运行目录无残留 `.runtime-owner.lock`，所有子进程以 `code 0` 退出，无僵尸进程。

---

## 5. 源码与测试指纹

| 文件 | SHA256 指纹 | 说明 |
| --- | --- | --- |
| `runtime/core/data-contract.mjs` | `98b645381f611302019ad5b8931df5b1149b23ea2d1ca0213fe10706cb05a370` | 唯一生产修改（合并遍历 canonicalJson） |
| `tests/simulation/canonical-json-equivalence.test.mjs` | `23c414f33bbfa4466d697d7cc46b2417ad7c5725da8dde4a953606017f982bf7` | 新增独立等价性测试与 8 档签名对照 |
| `scripts/measure-d4-long-history.mjs` | `bba80ef931d28261296d3f49d576f081be563a0bb2585a43488e6c1240686870` | 动态合同适配（保持硬时限与 Watchdog） |

---

## 6. 停止状态与未运行项

- 执行者工作在完成 D4P3 规定范围后即刻停止。
- **未运行项**：
  - 未运行全量回归测试或无关模块测试；
  - 未进行 UI 截图、录屏或像素/布局巡检；
  - 未启动 18324 实例或其他旧服务，未合并 `main` 分支，未进行任何生产发布。
- 本次回执作为 D4P3 的完整交付证据，提交给中控复核，用于收口原 D4P2 的返村、重开及全量结果等值缺项。
