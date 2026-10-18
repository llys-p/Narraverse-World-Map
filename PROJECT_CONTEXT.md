# 当前状态与接手方向

更新时间：2026-10-18 12:45（Asia/Shanghai）。当前进度仅在本文件维护。
本轮改写前的完整版本固定于控制仓库远端提交 `3361d653a61d0ee7901426f3edd41b951017e2d6`，Git blob `c07b928553f57c5a9fab1d55280a84504e0b1ddb` 已核实与旧字节哈希相符，可从远端链接恢复：
[旧版 PROJECT_CONTEXT](https://github.com/llys-p/Narraverse-World-Map/blob/3361d653a61d0ee7901426f3edd41b951017e2d6/PROJECT_CONTEXT.md)。
旧字节 SHA256：`9adb3accdd3a31261f2e60dd2f117da537813b79ac0dae8b2a3e0c8d81f77777`。

## 当前验证约束（2026-10-14）

按用户本次明确指令，仅运行当前核心交付直接必要的最少定向功能检查；同一源码及直接依赖未变且有有效原始通过证据时复用，不跑全量/无关测试，不扩展边角测试或重构，不做截图、录屏、像素、布局或视觉巡检。此前视觉、全量及阶段收口验证约定按本次指令调整，冻结历史任务书/验收合同不改写；不得为更多验收次数重启既有5小时预算或37分钟H7链。真实输入边界、权威状态和存档/恢复校验仍是核心要求；取消或未验证项如实标注，不能写成通过。

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

- 当前最新限定PASS业务树：`D:/Narraverse-World-Map-graphical-loop` / `codex/world-runtime-graphical-loop` @ `6c60fe2d5b6276660936e1ab55a43385a79737ba`（D4E10接D4E9 fe66af9）；[图形体验结果](https://github.com/llys-p/Narraverse-World-Map/blob/6c60fe2d5b6276660936e1ab55a43385a79737ba/docs/runtime/D4E10-GRAPHICAL-LOOP-RESULT.md)。本机双击该树Start-D4E10.cmd可新开18338隔离世界；本轮未启动日常入口。
- 长历史性能优化历史基准：`D:\Narraverse-World-Map-d4-data-fast` / `codex/world-runtime-d4-data-fast`，交付 `b7e5a9e7c131ee79acd017276ff62910a549d5ad` 已推送读回、干净；唯一生产data-contract吸收DeepSeek安全复制并新增单次有界键名转义复用，完整实档链一致。上一轮 `D:\Narraverse-World-Map-d4-canonical` / `codex/world-runtime-d4-canonical` 的已验2936233426e990857f3c88a39ad58623832419fd保持不动、作为可回退基准；旧A/B/模型实验与标签均保留。未main/deploy/启动日常入口，不能称日常性能或D整体通过。
- GitHub 分支 `codex/world-runtime-d4-cp1a-review` 已读回A候选 `254c27d143f735dfff2051f561dee129012b5a99`；B分支 `codex/world-runtime-d4-acceptance` 已读回 `f0fa73dd2b41db6fb5aa1c11a221a3fa142ae30a`。存档标签 [checkpoint/d4-functional-20261014](https://github.com/llys-p/Narraverse-World-Map/tree/checkpoint/d4-functional-20261014) 指向B提交，包含A源码祖先；控制文档另在 `codex/world-runtime-control`。均未合入main或部署，ignored原始证据仍保留本地。执行树origin仍指本机clone，本次推送使用精确GitHub URL。

- 控制文档树：`D:\Narraverse-World-Map-control`，分支 `codex/world-runtime-control`；
  本轮D4B收口前 HEAD `491d6498b74fadc64554e5d09b6bed5d6007206e`；规则/验收摘要提交 `8f002553fa31d701892f275b0f83627d848beb70` 已推送并读回。更早完整状态见上方保留的 `3361d653` 快照链接。
- D3 施工树：`D:\Narraverse-World-Map\hds-reservation`，分支 `codex/world-runtime-d3-reservation`；A生产冻结为 `d22c730707646eabe8c68b4d2c739e09f942fbab`（主体祖先 `2ecfc0cd5c8991d57053e2e04c17a312469ef96f`，仅含 owner 队列修复和A回归测试）。B测试提交为 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb`（父3c、仅新增/扩展B2测试）；相关D3提交现随D4任务分支远端可达；未合入main、未部署。
- 新遭遇规则使用隔离的 profile/schema，旧 profile 与存档行为保持；M4 正式实现和生产边界不变。M4 独立体验对话 `01a12aff-2703-71c2-ab00-cc7ae733ca2a` 使用 `http://127.0.0.1:18324/`；控制文档工作不得启停该实例。

## 活动工作、阻塞与下一步

- **当前优先功能：结合Demo完善现有玩法；优化另开对话并行**：用户2026-10-18明确要求拆分。功能树D:/Narraverse-World-Map-demo-gameplay / codex/world-runtime-demo-gameplay，源码fee737ddd8861a37d0fe67886306561f90def25d、交付4c6b69c8a66588f6241cabdb0a4b27014e4b7a03已推送精确读回，报告API字节一致；[功能限定验收](https://github.com/llys-p/Narraverse-World-Map/blob/4c6b69c8a66588f6241cabdb0a4b27014e4b7a03/docs/runtime/D4E12-DEMO-GAMEPLAY-RESULT.md)。村长人物卡工作、商人按1–10数量买卖、行囊交易/休整接真实命令，药草不伪装服用。新前端策略3/3，真实页面卖2粮→买1粮→工作→休整→正常关闭→独立完整审计→重开通过49.657秒，r44/tick44/金币20/粮食19/疲劳50，5文件SHA/五投影一致。原core/service/持久化无diff，仅新展示模块显式登记；不新增NPC/地点/战斗规则。3轮失败及修复证据保留，r2阶段120秒Job终止后确认PID退出，仅清自有隔离锁；最终无进程/锁。原8档/16依赖/旧88源码/107日常文件/并行脏摘要保持，未启停旧服务/未切日常入口，无main/部署/迁移/私档上传/外部模型/全量视觉测试。优化对话`01a14d49-bc97-7ce3-a47e-18c4f92edea8`专责冷开独立树/分支，不写功能树/中控/看板；本主线独占唯一状态与看板。原world-map自动化已PAUSED，未重启。D4E12整体仍In Progress/需修正，性能不阻塞现有功能推进，Stage D进行中。

- **D4E12 Demo村庄/森林接入：运行中审计已交付，短世界确认明显改善；长档冷开仍需修正**：[限定验收报告](https://github.com/llys-p/Narraverse-World-Map/blob/63b3ddf3483b5486e3d9dc2c19fc2f0b1c4e4bef/docs/runtime/D4E12-LIVE-SESSION-AUDIT-RESULT.md) / [已批准补充合同](https://github.com/llys-p/Narraverse-World-Map/blob/63b3ddf3483b5486e3d9dc2c19fc2f0b1c4e4bef/tasks/D4E12-LIVE-SESSION-AUDIT-AMENDMENT-DRAFT.md)。用户2026-10-18明确批准，独立树D:/Narraverse-World-Map-live-session-audit / codex/world-runtime-live-session-audit；生产1b6211c67dc1bf4287a327648d94520233166846，完整交付63b3ddf3483b5486e3d9dc2c19fc2f0b1c4e4bef已精确推送，报告/合同/原始汇总API字节读回一致。ABBA各版2次，8次行动确认墙钟改善56.40%/CPU53.18%，每次平均0.236秒，9文件SHA/8回执/五投影一致。12个定向成员分批覆盖，最终8项core/owner全过、日界/RNG与完整地图战斗差分全过；最终页面25.121秒赠粮→行军暂停改道/路遇→两回合胜利→返村→正常关闭，页面未重开，全审/重开在core与HTTP另测，无视觉结论。只对当前owner当前已耐久提交、深冻结完整服务前缀归纳核验；旧head/跨owner/重复writer拒绝，数学bundle证明与durable head分离，持久确认后发布，失败/不明结果必须完整恢复，外部JSON/冷加载/公开独立全审保留。冷开本轮约5秒短样本，旧长档74.351秒未复跑、不承诺冷开加速/无限流畅；原128命令/时间/格式11规则保留。原8档/16依赖/旧88源码/107日常文件/并行原型脏摘要保护，三旧端口仍无监听，启停动作0，无自有进程/测试锁；日常入口未切换，无main/部署/迁移/私档上传/外部模型。原Projects卡In Progress/需修正，Stage D进行中，原D4E11历史不改；后续继续只做有证据的有界修复。

- **D4E11候选已推送，未验收**：[合同](tasks/D4E11-CAMPAIGN-JRPG-TASK.md)，[结果报告与失败记录](https://github.com/llys-p/Narraverse-World-Map/blob/80d6206ab2382f8bc96a20ef3e650fbcda1b9e97/docs/runtime/D4E11-CAMPAIGN-JRPG-RESULT.md)。树D:/Narraverse-World-Map-campaign-jrpg / codex/world-runtime-campaign-jrpg，远端80d6206ab2382f8bc96a20ef3e650fbcda1b9e97已推送精确读回，报告API可读；核心27ddaba、页面e7f6223、原证据1bf24ff。持续行军/暂停改道/NPC路遇/回合制已接，8个不同定向成员分次通过，非一次8/8。页面赠粮/猎人记忆路遇/两击胜利已完成，最终r50/tick40/road(9,7)/商人暂停，返村及最终正常关闭重开未完成。原600秒、首授权300秒、后续继续独立300秒失败/超时保留，最新PHASE_LIMIT120秒；下一业务运行需新的有界授权，不重置旧预算/重打战斗。原8档、旧98产品、5素材、13外部、17日常文件不变；18338/PID61236保持，验收自有锁/进程已清；用户随后明确要求展示，已启动本树独立日常18340/PID63160，artifacts/d4e11-daily/world新世界，实读页面世界已连接。体验服务保留供用户操作（exec会话30372，可输入quit正常关闭）；不是重启旧补验，r50验收档保持。用户已明确授权本次候选源码和脱敏证据推送当前公开仓库，不上传存档/新增素材、不推定许可；控制并行dual原型及摘要保留，不纳入本任务提交。Projects先待验收再In Progress/需修正逐字段读回，D仍进行中；证据docs/evidence/d4e11-campaign-jrpg-control-20261017/。D4E10仍上一已验树，Issue3暂停。

- **D4E10图形体验接入限定PASS**：[合同](tasks/D4E10-GRAPHICAL-LOOP-TASK.md)，[结果与27份脱敏证据](https://github.com/llys-p/Narraverse-World-Map/blob/6c60fe2d5b6276660936e1ab55a43385a79737ba/docs/runtime/D4E10-GRAPHICAL-LOOP-RESULT.md)。树D:/Narraverse-World-Map-graphical-loop / codex/world-runtime-graphical-loop，接fe66af9，实现157c5dd、交付6c60fe2d5b6276660936e1ab55a43385a79737ba已推送精确读回/树干净。地图真实位置/地点入口、同版村庄人物、确认回执战斗表现；runtime/**与素材零改。纯3/3、语法7文件、根一次实际页面赠粮1→旅行→遭遇→攻击2胜利→返村，tick36/rev38/HP920/私粮19；全档审计、五投影/活动/六原回执/七档SHA跨重开一致。原八档/原97产品/原日常7文件/外部13/控制5文件与18325 PID2592、18327 PID4432、18336 PID48192保持；子62856正常exit0/无超时/无测试锁或进程。新Start-D4E10.cmd/18338日常目录未创建启动。外观/音效/性能未验，第二次播放中停止未捕获不冒称通过；RED/包装器GBK/选择器问题保留，无重发攻击。无main/deploy/迁移/DSH；本合同完成停止。Projects卡PVTI_lAHOEF9IDs4BmADfzhBZbUE先待验收再Done/已验收读回，最终只读查询首超时45秒、仅重试读取成功；D仍进行中，Issue3暂停。看板证据docs/evidence/d4e10-graphical-loop-control-20261017/。

- **D4E9玩家工作收入闭环限定PASS**：用户确认6小时/工资20/疲劳+150/成功start间隔24小时；[冻结合同](tasks/D4E9-PLAYER-WORK-TASK.md)，[完整结果与脱敏证据](https://github.com/llys-p/Narraverse-World-Map/blob/fe66af943069bb62324a82aa1cd43d0b1bfb8212/docs/runtime/D4E9-PLAYER-WORK-RESULT.md)。执行树 `D:/Narraverse-World-Map-player-work` / `codex/world-runtime-player-work`，接f7bc328，实现a375acc、交付fe66af9已推送并读回SHA完全一致/树干净；新format10/DTO4隔离档。核心8/8、根旧DTO3两成员2/2；同一fresh世界真实页面work/buy2→HTTP Advance107→tick144→close/reopen，工资20/支出20/钱包0/私粮21、工作/日结各1、五投影/活动/原回执/4档SHA一致。原8档/旧93产品/控制5旧文件不变，97候选运行源验收前后匹配；无自有锁/进程，18325 PID2592/18327 PID4432保持。D4E9验收时未启日常世界；D4E10开工已见18336 PID48192运行，保持；实际短史重开23.6秒，不宣称性能合格；首败保留，无全量/视觉/长史/迁移/main/deploy/DSH。看板先待验收再Done/已验收逐字段读回；D整体仍进行中，Issue3暂停。

- **D4E8交易前余额/库存/数量提示限定PASS**：[复核](docs/runtime/D4E8-TRADE-FEEDBACK-REVIEW-20261016.md)，合同2fbb074；树`D:/Narraverse-World-Map-trade-feedback` / `codex/world-runtime-trade-feedback`接06e9222，实现99659a2仅地图html/mjs，服务与78runtime不变。性价比high工人静态检查后停写，root18334单一新世界真实验证0余额/0库存/0、11、小数数量禁用、本地输入不写档、卖4后买2可用、提交中全局禁用、完成余额0后重新禁买；两成功回执对等钱粮、刷新/正常重开五读取/三档与预算一致。0新增suite/0日结，不复跑旧链；原8档/其余91产品/5旧文件和18325 PID2592/18327 PID4432及既有9/3档保持，两自有CLI exit0无锁/残留，默认日常世界未创建。报告/说明/脱敏证据推送，板先待验收再Done/已验收读回；D仍进行中，Issue3暂停，无main/deploy/迁移/DSH/第三方模型。本片完成停止，新收入/NPC规则未实现。

- **外部探索A/B/C已齐并完成本轮接入取舍**：[评审及补收勘误](docs/runtime/EXTERNAL-EXPLORATION-STATIC-REVIEW-20261017.md)。当前A5/B3/C5共13文件均只读保护；B锚定D4E9 fe66af9，关键字段错误已纠正；C模拟伤害/错误ACTIONS/不可取消旧timer/跨树依赖未采用。采用A布局、B经核验投影、C素材/播放思路，实现结果见D4E10。旧评审的B未收/C缺DELIVERY为初轮历史；外部原型本身仍未运行或视觉验收，不原样合入、不改旧脏绘制源。

- **D4E7既有交易到日结体验链限定PASS**：[复核](docs/runtime/D4E7-LIVELIHOOD-REVIEW-20261016.md)，合同2cdf3c6含业务前v1.1资金前提勘误；树`D:/Narraverse-World-Map-livelihood-loop` / `codex/world-runtime-livelihood-loop`接1cde888，93份产品源仍同D4E6 c7c2132。初始钱包0/私粮20，真实页面卖4粮→买2粮→唯一Advance144，三成功命令/一次日结，rev/tick146、私粮17、金币0；钱粮对等、ledger与真实日结逐项核对。刷新/正常重开五读取/四档字节与玩家卡四条记录一致；0新增suite运行，不重复旧证据。两CLI exit0、无超时/测试锁/残留，原8档/93产品/5旧文件及18325 PID2592、18327 PID4432的进程与9/3既有档保持，默认日常目录未创建。仅补入口说明，报告/脱敏证据推送，看板先待验收再Done/已验收读回；D仍进行中，Issue3暂停，无main/deploy/迁移/DSH/模型。本片收口停止；未实现NPC新行为/移动或长期生存。

- **D4E6重要人物真实行为追踪限定PASS**：[复核](docs/runtime/D4E6-IMPORTANT-PERSON-REVIEW-20261016.md)，合同22c3dd3；树`D:/Narraverse-World-Map-person-tracking` / `codex/world-runtime-person-tracking`，实现c7c213239911976ce45c6403c67f750e091e19b8（接D4E5 6ed7263）。人物卡分当前状态与近期全部事实，日结沿用同一真实行的消费/休息/状态变化/收尾地点，不推断未知地点、不改NPC固定村庄规则。唯一新测试2/2、35.187秒/120秒硬限、一次Advance144；玩家死亡分支测试后去重仅静态审查，未测工作/买卖/死亡或正数减疲劳。中控18332同样本真实浏览器换人/地点独立筛选/刷新/正常重开通过，五读取与两档字节一致；猎人未行动、取食0、饥饿200→300如实呈现。原8档、其他77runtime、控制5旧文件与用户18325 PID2592/18327 PID4432及既有9/3档保护；两自有服务exit0、无测试锁/残留，18331默认目录未创建。实现/报告/脱敏证据推送，Projects先待验收再Done/已验收读回，D仍进行中。Issue3暂停，无main/deploy/迁移/DSH/外部模型，本片结束停止；新行为/移动另定范围。

- **D4E5地图到地点现有玩法闭环限定PASS**：[复核](docs/runtime/D4E5-PLACE-EXPERIENCE-REVIEW-20261016.md)，合同c36704e，树`D:/Narraverse-World-Map-place-loop` / `codex/world-runtime-place-loop`，候选17074c4ef6f9cb372b4cbdf4d8925e231a541283（接D4E4 b594b45/生产b7）。helper最终2/2、141ms/60秒硬限，独立18330真实浏览器地图查看/人物锚点→赠粮→旅行→开始/取消遭遇→查看村庄不旅行→明确返村→地图→刷新/正常重开；rev27/tick24、私粮19、猎人记忆1，五读取投影/六档跨重开字节同一。地点仅真实2村庄/3森林记录，不补造未知位置或人物知识。原八档、78runtime源码、控制5旧文件、用户18325 PID2592和18327 PID4432及既有9/3份档保护；测试三服务正常exit0、无锁/残留，新18329日常目录未创建。源码/报告/脱敏证据已推送，看板先待验收再Done/已验收读回，D仍进行中。性能Issue3暂停、第三步重要人物新行为未开工；无main/deploy/迁移/DSH/外部模型，本片结束停止。

- **D4E4真实世界活动日志限定PASS**：[复核](docs/runtime/D4E4-WORLD-ACTIVITY-REVIEW-20261016.md)，合同2562f40；独立树`D:/Narraverse-World-Map-world-activity` / `codex/world-runtime-world-activity`，被验源码28d3f793a18f223e7df8d2378b1e81eba2d8e1e5（接D4E3 0f4bba2/生产b7），执行者已停写。新增定向2/2、48.104秒/90秒硬限，独立18328浏览器人物/地点筛选、刷新不写档和正常重开一致；原失败/超时及旧原始日志覆盖事实详见报告。显式开发者全知观察默认关闭，最近256来源/64条/64KiB，不混入角色知识；原18325 PID2592/9既有档与原八档均保护，新18327日常目录尚未创建。源码/脱敏证据已推送，Projects先待验收再已验收并读回；D整体仍进行中。性能Issue3开放且暂停，无新测量/main/deploy/迁移/DSH；后两步仅指导，本轮完成停止。

- **当前优先：先跑通现有玩法，暂缓继续优化；D4E3功能体验候选已交付**：[复核](https://github.com/llys-p/Narraverse-World-Map/blob/0f4bba27f68a5841ca672288a76512e11ea729b1/docs/runtime/D4E3-PLAYABLE-REVIEW-20261016.md)。用户2026-10-16明确选择现有玩法可直接体验的完整闭环，性能Issue3独立保留，不阻塞本候选。新树`D:\Narraverse-World-Map-d4-playable` / `codex/world-runtime-d4-playable` @0f4bba2；90份生产同b7，不带入PR6/7或配置性能实验。真实浏览器按钮完成赠粮→森林→遭遇/两攻击胜利→地图真实返村→刷新→quit/重开，6命令成功；rev38/tick36、健康920、私粮19及猎人记忆保持，四项投影与7档重开前后字节一致。日结/长历史/拒绝与回滚同源证据复用，无H7/全量/视觉重跑。实际Start-D4.cmd的新建/正常退出/恢复、固定18325新世界页面核验通过；用户世界`artifacts/d4-daily/world`仅r0、tick0/私粮20，未做玩家动作，与18326战斗测试档分开。本轮进程均退出、无锁/常驻服务；原8档及既有脏文件保持，无模型/DSH/main/deploy/迁移。双击上述树Start-D4.cmd等待ready后体验，正常quit关闭；下一步收集实际玩法卡点。

- **Issue #3配置校验优化试验已交付，整体性能未准入**：[固定报告](https://github.com/llys-p/Narraverse-World-Map/blob/4ceaab29009687ebad2e13095e7980ea09b92ef4/docs/runtime/ISSUE3-CONFIG-CHECKS-RESULT-20261016.md)。独立树`D:\Narraverse-World-Map-issue3-config-checks` / `codex/issue-3-config-checks`，源码c94a228、报告4ceaab2已推送；下层M1试验fbaf514 / `codex/issue-3-history-cost`另存远端，未采纳。原b7一次真实CPU采样定位配置校验反复构造初始世界，8个core保留完整配置检查及实际指纹/审计/重演/持久规则，只省无消费者的分配/字符串。定向14/14、持久篡改/失败回滚2/2；ABBA每版2次、每轮24/24。重开中位67.592→55.654秒（17.66%，CPU16.93%），两组各少15.872/8.005秒；首开中位52.866→56.299秒、反向组慢11.629秒，返村中位仅少3.303秒按用户要求不算收益、不追查。功能限定PASS但未替换b7基准，PR6/7原结论保持。原8档/副本/生产/既有脏文件保持、38记录PID退出、无锁、原监听身份不变；55份散列/计时文件加索引推送，私档/完整投影未上传。任务报告交付收口，Issue3/D仍开放进行中；无main/deploy/模型/服务启停或DSH协调。

- **Issue #3 本机独立ABBA验收完成，性能仍未验收**：[固定报告](https://github.com/llys-p/Narraverse-World-Map/blob/220f62adc26da6938d730fa5a67b647d3b4afc97/docs/runtime/ISSUE3-LOCAL-ACCEPTANCE-20261016.md)。A=b7e5a9e7，B=aa21ba32（PR6+7），独立worktree `D:\Narraverse-World-Map-issue3-{baseline,acceptance}`；验收分支 `codex/issue-3-local-acceptance-20261016` / 220f62a已推送精确读回且干净。Node24.14/Windows，A1 B1 B2 A2各2次真实r170→返村→关闭→重开，每次24/24断言、r182字节/回执/逐项五投影/重演/重开一致；编码A7/B13、持久篡改与失败回滚各版2/2通过。墙钟中位开档46.762→44.658s（+4.50%）、返村48.379→45.828s（+5.27%）、重开65.073→51.787s（+20.42%）；首组全退化、次组全改善，A重开54.313–75.833s波动大，n=2不能证明可重复收益，当前建议暂缓以性能为据合并PR6/7，不采纳成新生产基准。原8档/各7副本/生产与既有脏文件保持，22个本任务Node PID全退出、无锁/临时文件；39份计时/散列证据随分支推送，私档/完整投影未上传。PR5仅诊断、PR4未纳入，无Profiler/视觉/全量/H7/128链/服务启停/main/deploy/模型调用。验收报告任务收口，Issue3开放、D仍进行中。

- **D4E2入口保护与可移植探针限定PASS**：[任务](tasks/D4E2-PARALLEL-ENTRY-CLOUD-TASK.md)/[复核](docs/runtime/D4E2-REVIEW-20261016.md)。新树 `D:\Narraverse-World-Map-d4-cloud-probe` / `codex/world-runtime-d4-cloud-probe`，67bf605已推送精确读回、干净；runtime/页面不变。仓库AI可跑固定合成短探针，复制/编码/拒绝/getter=0及缺Git/未知参数检查通过，不代表真实r170或日常性能。旧空目录误建默认世界已复现；CMD新增缺正式档停止保护，空/仅临时档目录核验通过且文件不变，保留首轮CMD返回码捕获失败。Issue #3正文已补固定链接/命令并读回OPEN；默认用户世界未创建，旧18324/正式平台未触动，无浏览器/故事/慢档重跑。DSH实际审查被渠道校验拒绝、无意见；用户已交其它对话负责，本对话停止DSH协调。D4E2看板按限定范围收口，D仍进行中，剩余性能继续Issue #3。

- **D4E1固定本地入口已交付（CLI/HTTP限定PASS）**：[任务](tasks/D4E1-FIXED-EXPERIENCE-ENTRY-TASK.md)/[复核](docs/runtime/D4E1-REVIEW-20261015.md)，新树 `D:\Narraverse-World-Map-d4-experience` / `codex/world-runtime-d4-experience` @5acf6472已推送读回且干净；业务接b7e5a9e不变，仅Start-D4.cmd/说明/README。固定18325，首次新隔离scene世界，数据本树artifacts/d4-daily/world；不导入原世界、不启停旧18324。初版重开带初始化参数被保护拒绝，修正后临时端口/目录CLI/HTTP启动/quit/重开签名与r0字节一致、锁/子进程释放；非Windows双击/浏览器/日常性能验收。默认用户世界未创建、无常驻服务。看板D4E1已先待验收再读回Done/已验收（启动包限定范围），D仍In Progress/进行中。
- **剩余性能已交GitHub开放问题**：[Issue #3](https://github.com/llys-p/Narraverse-World-Map/issues/3)，已创建并读回、加入Project #2/Todo。给仓库AI固定b7e5a9e与代码/原始已推送证据链接，写明私有原档未上传及不可削弱的校验/重演边界；没有自动指派AI，优化保持开放。

- **D4P5限定PASS并收口**：[复核](docs/runtime/D4P5-REVIEW-20261015.md)，任务b7e5a9e已推送且干净、实测生产d8d1dc6字节未变；等价13/13+真实持久篡改1/1。唯一无Profiler受监督完整r170链：开档47901.369/返村49255.913/关闭1.221/重开62098.170ms，总159545.607ms exit0；19内部核验、r182原始字节/回执/重开五投影一致，原8档/7副本未变/无锁/测量子进程。相对历史2936233总计低18.79%，非成对稳定性能证明；首开未胜过历史DeepSeek47.38秒，新增键名复用只获编码短对照中位11.57%收益支持。校验展开无稳定增益已弃，仍几十秒等待；未合main/部署/启停旧实例，D/日常性能仍未验。D4P5看板已先待验收再逐字段读回Done/已验收，D仍In Progress/进行中；原始Git/板证据在 `artifacts/d4p5-20261015/`。

- **D4P4-R2方案沟通/短试跑已复核**，见[原报告R2](docs/runtime/D4P4-DSH-FREE-MODEL-COMPARISON-20261015.md)：Hy3复用（d838c41）、用户手动恢复后的Hy4 fromEntries（8bc88df）、Step5返修复用（c5692b7）三个实验已保存推送；Hy4原Relay hard_credit失败保留，手动runId/路由unknown。DeepSeek本轮未重新调用，只复用第一轮实际候选，额度故障后只探测了一个获准备选Step。中控四真实函数各10/10直接语义检查，统一合成100轮：原始455.7/DeepSeek166.9/Hy3170.6/Step182.5/Hy4227.1ms，仍首选DeepSeek，不外推真实档或p95。Hy4示意patch早return会漏清理，不可照搬；原型与真实DeepSeek均通过反例。只新增实验文件，四树生产/原测试/旧派工hash不变；无新慢档/main/deploy/服务启停。原始终态/保护/独立对照在 `artifacts/d4p4-dsh-20261015/r2/`；看板D4P4已先待验收再读回Done/已验收（方案试跑比较完成，非生产采纳或D整体验收）；报告/独立脚本与JSON提交8504155已推送读回。

- **D4P4四个DSH目录x0.00模型比较完成**，见[报告](docs/runtime/D4P4-DSH-FREE-MODEL-COMPARISON-20261015.md)。统一基准2936233，独立树在 `D:\Narraverse-World-Map\free-perf-trials\{deepseek,hy4,hy3,step5}`。DeepSeek候选10a2180：中控11/11语义+1/1持久篡改通过，唯一r170打开47377.2192ms、投影签名/原档保护一致，较历史61.85秒单样本低约23.4%；仅推荐候选，未采纳到2936233。Hy4 f8128f0/Step5 7226859因继承setter/只读属性语义反例拒收、未测慢存档；Hy3原429失败，用户手动恢复后NO_CHANGE/零diff（EPERM交回），两轮分记。三个有改动实验分支已保存推送；实际费用/共享额度池未知，无付费回退。原已验版本/标签保持，D整体仍进行中；本轮到比较收口停止。
- D4P2首轮脚本失败与R1诊断历史保留：原生产611b3aff首次无Profiler95147.747ms；R1交付1c2713a4，带Profiler111303.165ms、起点170/168/6commands、无返村/重开。诊断限定PASS及统计勘误见[R1复核](docs/runtime/D4P2-R1-REVIEW-20261015.md)，不把它改写为原完整链全绿。后续D4P3已在新候选补齐测量事项。
- **D4P3与D4P2测量事项已限定PASS收口**，见[中控复核](docs/runtime/D4P3-REVIEW-20261015.md)。唯一无Profiler完整链：开档61851.345ms→返村63404.284ms→关闭1.381ms→重开70974.714ms，总196451.860ms/exit0；完整r182原始字节及回执与参考一致，五投影跨重开一致、原8档/7副本未变/锁释放。中控补真65536/65537 UTF-8边界及自有constructor键，最终等价5/5、持久篡改1/1通过，仅测试/说明改动，未重跑业务。相对历史开档约35%只是单样本差值；仍有分钟级等待，日常性能未验，D整体仍进行中。本轮停止，不自动派发下一阶段或部署。
- D3-5A 生产候选在 `2ecfc0c` 主体上已有真实服务、CLI、持久化预算及浏览器消费者证据：服务6/6、旧parser窄回归3/3；CLI窄测4/4、旧clock-smoke 1/1、有界reader 1/1；Edge组合1/1（92.5秒）；新profile metadata负例1/1。format8 128输入/129正式service文件边界1/1（269秒）；旧profile 128文件上限1/1（127条真实命令，887.98秒）。这些是既有定向回执，不代表新候选整体验收。
- B1 15项、B2 7项（2+3+2）、B3 6项共28个独立成员已分批通过、无skip；并非一次28/28。B2新增 owner durable-failure 与G7共11种checkpoint变体均通过。原失败记录与定向补验保留，见[D3-5B复核](docs/runtime/D3-5B-REVIEW-20261013.md)。A唯一源码行为修复为 `d22c730` 的 owner queue 幂等优先级及回归；B测试候选提交 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb` 仅改B2测试。相关D3提交现随D4任务分支远端可达；未合入main、未部署；D3整体未验收。
- D4 合同 `d4-scene-continuity-v1` 已冻结，基准 `f7699fb43c02204a7dedf7fe6dc6706214d72fdb`；任务书见[A](tasks/D4A-SCENE-GIFT-MEMORY-TASK.md)与[B](tasks/D4B-SCENE-CONTINUITY-ACCEPTANCE-TASK.md)。CP1a、CP1b历史候选修正与限定PASS记录保留；A最终候选CP1/CP2/CP3内部门完成。B独立验收裁定H1–H7功能合同限定PASS，复核见[D4B复核](docs/runtime/D4B-REVIEW-20261014.md)；D4功能合同与本次性能slice均限定PASS，D阶段整体仍进行中，正式平台未接入。
- D4A 当前基准树 `D:\Narraverse-World-Map\hds-d4-cp1a-review` @ `codex/world-runtime-d4-cp1a-review`，CP1a检查点 `c84d57d5b5fc4628fe5cb59986528574e924c4de`（父f7699fb，恰3core+1A测试，当时未push/main/deploy）。修复收粮库存恒等式/非actor-2接收限制/ownership预检；新14/14、hunter9/9、society8/8及旧6组初态/日结完整组件字节配对通过。见[D4A CP1a复核](docs/runtime/D4A-CP1A-REVIEW-20261013.md)。
- CP1b记忆层、CP1c、CP1d、CP2a、CP2b、CP2c各自限定PASS，见对应[D4A复核](docs/runtime/D4A-CP1B-REVIEW-20261013.md)及[CP2c复核](docs/runtime/D4A-CP2C-REVIEW-20261014.md)。A最终施工树 `D:\Narraverse-World-Map\hds-d4-cp1a-review` @ `codex/world-runtime-d4-cp1a-review`，提交 `254c27d143f735dfff2051f561dee129012b5a99`（父 `970471ab38b196c4f2f1e39d0bed026006ce2ff8`，仅两项A测试及478行，工作区干净）；90个生产文件hash不变。已按用户授权推送并读回，未合main/deploy。CP3结果及实测/交付UI字节差异见[D4A CP3复核](docs/runtime/D4A-CP3-REVIEW-20261014.md)。
- D4B 独立验收测试提交 `f0fa73dd2b41db6fb5aa1c11a221a3fa142ae30a`，父/A生产基准 `254c27d143f735dfff2051f561dee129012b5a99`；B树干净且仅三测试文件，90个A生产文件rawhash不变，A/B归一化后90文件一致（74字节完全相同，16仅CRLF/LF差异）。19个唯一成员分批通过：14 H1–H5（含H4预检）、1 H2 retention、3 H6、1 H7 HTTP（定向补验1/1，101460.3776ms，exit 0），非一次19/19。完整180 tick浏览器链与128 journal/129正式档预算复用A原始证据；B未运行完整UI H7。原RED、中间失败及两次取消均保留。A/B任务分支已推送并读回，存档标签指向B提交。
- D4性能限定不可变完整审计复用：树 `D:\Narraverse-World-Map-d4-performance` @ `codex/world-runtime-d4-performance`，基准 `f0fa73dd2b41db6fb5aa1c11a221a3fa142ae30a`，候选 `611b3aff1e98150af069478a50e09923f4d5f633` 已推送GitHub并读回、工作区干净；7路径（6 production + 1 test），134+/22-，未合入main/deploy。固定4 actors、seed42、Gift+Travel12、2 journal、并发1：Travel提交 13941.0633→2704.5997ms，正常重开 12756.2005→2957.6288ms；完整bundle/journal/五投影 SHA 与基线相同。最终定向运行10/10，0 failed/cancelled/skipped/todo，30083.8052ms；真实EACCES保旧、幂等、外部service篡改拒绝、完整恢复、公开mutable副本与getter=0边界均通过；非D4全合同重跑。原immutable misscache中间样本保留。见 `artifacts/d4-performance-20261014/final-acceptance-index.json` 与[任务书及测量回执](tasks/D4-PERFORMANCE-IMMUTABLE-AUDIT-TASK.md)。该611b3aff当时只验短历史；后续D4P3已完成到tick180的固定样本，128commands性能、p95/峰值仍未验。本轮无browser/visual/full重跑。
- 流程优化已分给独立Codex对话 `01a133e5-db80-7e81-af05-941188b1598e`（DSH｜流程优化与中断恢复）；任务书/修复/实验全部在 `E:\codex\2026-10-13\dsh-workflow-optimization`，本项目仅只读参考，禁止改活动STATE/源码/合同/看板或续派业务。当前对话继续业务派工验收；两路不得共用包工头写入会话。
- D4 体验目标：给同村猎人一份私粮→立即记得本人收粮→日结实际吃粮→去森林完成遭遇→返回/刷新/关闭重开仍是同一人。局部知识展示同地点公开人物，不泄漏他人私账，不加信任或模型。合同版本、文件范围与手算见任务书，D 整体仍待体验收口。
- DSH 流程优化已落地：原包工头会话 `session-2564efe0-949b-48ed-90a5-f7f7feb9cbce` 使用Global DeepSeek Flash完成复盘与两名顺序工人接续演练；Codex独立核对并修正停止证明/证据归属。运行册 `D:\Narraverse-World-Map\docs\operations\DSH-TEAM-RUNBOOK.md`，持久检查点 `.dsh-team/STATE.json`；原生任务task-24/25为历史演练完成；当前业务状态以CP2c复核及A/B验收记录为准。
- 流程默认短工单/并发1、额度与502分流、最多一次重试及一个获准免费备选探测、工人和包工头各自落盘检查点；同文件换写者须有停止证据。CP2c门与上一轮真实128 journal/129档预算门均限定PASS。用户明确继续后，CP3严格day144续接1/1 PASS，与首轮已确认Gift/day144合并形成CP3功能门PASS；不是一次fresh完整全绿，首轮1 fail仍保留。A候选 `254c27d` 已就绪，D4A/B冻结功能PASS、D4不可变审计复用性能slice限定PASS；D阶段整体仍进行中。固定长历史样本后续已由D4P3补齐；更大历史、128commands性能、p95/峰值仍未验。细节见[D4A CP3复核](docs/runtime/D4A-CP3-REVIEW-20261014.md)、[D4B复核](docs/runtime/D4B-REVIEW-20261014.md)及D4性能任务书与测量回执。
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

- 总方向与架构仍由“GPT6 Astra world Map总负责人”对话负责；本对话“世界运行 主线 发布任务 2.0”（Codex thread `01a13984-749d-7e83-9181-0f10d795bc5d`）自2026-10-14起接替日常派工、独立验收与看板收口。
  旧主线“世界运行 主线 发布任务 1.0（历史）”（`01a11464-319d-7201-97d0-ab6059fe788f`）仅作历史记录，不再作为活动派工入口。具体交接使用当前源码 SHA、合同和证据索引。
- DSH 包工头链接仅作历史交接入口，当前 D3-5 施工已由授权的 Codex 子代理完成；体验结论仍由对应体验对话核实。
- 专用看板：[World Map 项目进度](https://github.com/users/llys-p/projects/2)，
  owner `llys-p`，project #2；状态变化需读回并链接证据。
  正式平台 Project #1 独立维护。
- D4P2卡 `PVTI_lAHOEF9IDs4BmADfzhA2qB8` 与D4P3卡 `PVTI_lAHOEF9IDs4BmADfzhA3b1M` 已先登记待验收，再逐字/按字段ID读回 Done / 已验收（测量/编码优化限定PASS）；D仍 In Progress / 进行中，D4A/B仍Done。收口报告提交 `75fb5d34febdf733d2e714fcda7cf4f4caebd46e` 已推送；独立原始索引/看板读回证据在 `artifacts/d4p3-review-20261015/`。本轮无业务重跑，最终源码2936233已推送读回且干净。
- D4P4卡 `PVTI_lAHOEF9IDs4BmADfzhA4L_c` 已先待验收再读回 Done / 已验收（候选比较范围完成，不代表四模型代码均通过），D仍 In Progress / 进行中、D4P2/P3仍Done；报告提交 `4d348e2b504ba02b0451c5f86b0f999f3a9c86e8` 已推送。原始模型输出/manifest/候选索引/一次开档及看板读回在 `artifacts/d4p4-dsh-20261015/`，各树另保留测试/反例和Hy3手动恢复回执；所有已派原生run终态，无旧实例启停。
- 本轮合同 rev3 勘误 `c83492dfb56b98bfdd1976196929c2d97f1f35db` 已推送并读回；D4 原预规划 `cb0067a` 保留为历史；历史发布时A/B任务待派。
  D卡正文保留D3-5限定PASS并登记D4发布；D阶段仍进行中。A候选提交 `254c27d` 已就绪，B独立验收H1–H7功能合同限定PASS；D4功能范围已限定PASS，不等于性能通过或D阶段整体收口。原D4状态卡与证据保留，项目简介未改。
  此前不可变审计复用slice的D卡已同步并逐字/按字段ID读回，仍In Progress/进行中；证据 `artifacts/world-runtime-d4-performance-review-20261014/board-verification.json`。D4A/B冻结功能PASS与存档tag不变；该历史轮次性能只限审计复用slice。此前D4B、CP2b/CP2c与合同发布证据目录保留，均只代表当时范围。
  旧接入边界方案标为冻结前历史，不以其“待冻结”措辞阻塞正式A/B合同；源任务副本与控制树逐文件指纹相等。
