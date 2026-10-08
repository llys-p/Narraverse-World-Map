# M1C：独立心智因果、信息隔离与恢复验收

合同：`m1-contract-v1`；2026-10-08（Asia/Shanghai）。状态：待派发，未开工。以 [M1 共同合同](M1-CHARACTER-MIND-CONTRACT.md) 的 K1～K6 为唯一预期，不能从 A/B 输出倒抄期望值。

## 给用户看

独立证明人物真的因为信息不同而改变行动，错误判断没有修改世界事实，保存/重启也没有丢失依据或重复扣钱。此路只写反例和证据，不代替核心/服务实现，也不凭测试总数宣布阶段完成。

## 开工、依赖与停止

- 计划目录/分支：`D:\Narraverse-World-Map-m1-acceptance @ codex/world-runtime-m1-acceptance`，当前尚未创建。
- 代码基准 `feb2856910bf8a9a6757aba892128d00d795bc15`，文档包来自同一个 M0 最终交付提交；记录实际 HEAD、导入的 A/B 依赖 SHA 和未提交改动。
- A/B 尚未交付时，先审合同、写 fixture 输入与独立预期。缺模块导致加载失败只能记录为“依赖未交付”，不能声称已复现业务缺陷或反例先红后绿。
- 中控导入 A/B 的已交付提交后，运行新反例并给出 PASS/NEED REVISION 与具体失败。禁止修改生产代码、原测试预期或公共合同来消除失败。
- 完成本路停止，不自行 merge main、启动 M2/D3/E、模型/桥/旧存档迁移。看板/PROJECT_CONTEXT 由中控更新。

## 文件白名单

- `tests/simulation/mind-acceptance.test.mjs`
- `tests/simulation/mind-service-acceptance.test.mjs`
- `tests/mind-inspector-acceptance.test.mjs`

证据放忽略的 `artifacts/world-runtime-m1-acceptance-*`，不提交浏览器用户数据、运行存档或大日志。确需共享 fixture helper 时先让中控分配唯一所有权，不修改 A 的 fixture 来配合测试，也不创建重复生产 helper。

## 反例清单

1. **K1 配对因果与泄漏**：同一 actor/同初态只改变 s01.available，验证 choice 与真实钱包/药量变化；未收到的刺激不进该 actor DTO/决策指纹。改变他人私有钱包而保持本人的可知输入一致时，本人的纯计划不能变化；原世界账必须仍合法。检查传给 planner 的对象不存在原 bundle/世界/其他私有字段或隐藏 getter。
2. **K2 反证与时序**：tick143 的判断和144日末判断分别核对原事件；当时指纹不能被后来报告改写。TTL 在299/300边界、同源重复不叠加、窗口淘汰有序；用原始事件与公开字段独立算判断预期，不调用 deriveMindBelief 来生成 expected。
3. **K3 权威与拒绝**：最后1药的双NPC竞争和玩家143→144抢先购买；两个计划都能相信可买，只有真正资产校验通过者扣款。失败额外扣款/失败计数翻倍/泄露 communalGold 都是阻断问题。先拒绝未知、后收到日末空仓报告的源序列必须成立。
4. **K4 纯主观变化**：观察不推进额外tick、不写资产；NoAction无命令/回执/休息收益；日结算粮食/治疗没有被跳过。禁止用手改 snapshot 伪造历史后再绕审计。
5. **K5 恢复与篡改**：完整288与24+264/143+145及竞争144+144一致；篡改证据时间/接收者、脚本游标、决定/指纹、Goal、重复/额外事实和回执均拒绝。一次 session 跨12/24/144与逐段推进一致；同tick计划同快照、执行后不递归再行动。
6. **K6 真实接口与边界**：检查器两人/真revision/读取零写/关闭404/POST405/查询400，死亡后刺激未送达和记录封存；65刺激、同tick9条、未知版本、超字节、稀疏/异类输入。service4 同 ID 重启幂等、旧页409、保存故障三份投影一致；对既有 checkpoint/service 文件恢复的最小真实消费者检查不可只 mock serializer。
7. **兼容与独立性**：新分支的旧 C5 四日、D2C 六操作完整 bundle/导出与指定基准相同；优先复核 A 的可核对字节产物并补独立断言，不在同 SHA 无变化时重复同一轮昂贵运行。明确哪些证据来自 A、哪些自己执行。

## 验证与浏览器范围

```powershell
node --test --test-concurrency=2 tests/simulation/mind-acceptance.test.mjs tests/simulation/mind-service-acceptance.test.mjs tests/mind-inspector-acceptance.test.mjs
git diff --check
```

真实浏览器在独立临时服务执行检查器消费链，核对当前判断/决定依据、刷新、键盘、双页签和断连读失败；不用旧全量 E2E 脚本，不触发云调用。测试服务用 port0 或核对后的空闲端口，只关闭自己创建的进程。M1C 不单独跑整套模拟；较大阶段最终全量由中控在集成代码上一次完成，代码再变化才补相关验证。

## 回执与裁定

每条失败写清前置配置、最小输入、预期/实际、命令、代码位置、影响与阻断级别；没有运行的检查标未验证。交付任务分支 SHA、A/B 被验 SHA、K1～K6 映射、独立证据目录、PASS/NEED REVISION 和剩余限制。测试缺失不是业务通过，API存在或漂亮页面不是核心消费通过；M1阶段结论由中控结合三路与最终真实消费者裁定。
