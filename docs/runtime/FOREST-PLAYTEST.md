# 森林试玩候选2：实测与交接（2026-10-31）

## 给玩家

**村庄→借工具→林地采集/歇脚→遭遇与退出→返村归还→保存重开，这个小闭环已通过实际浏览器测试。** 统一入口仍是 `Start-Forest-Journey.cmd`；保留原档另开一局用 `Start-Forest-Journey-New.cmd`。本轮不增加支线，继续修现有体验。

这次修好了三处实际问题：手机宽度横向溢出、猎人头像被拉长，以及Windows返村时连接因一次写缓冲繁忙被错误切断。完整旅程已在Linux、Windows的真实Chrome里重跑通过，390px模拟下森林按钮和人物卡正常，工具磨损与生火消耗实际落盘，退出不回滚伤害，关服重开保留进度。

自然对话也用了低成本DeepSeek实测：两场景共10次请求（包含失败及重测），不是固定回复。工作/领薪/买粮/吃粮场景4轮通过；赠粮场景初次遇到合法记忆编号次序错误被拒绝，整理已知编号后重测4轮通过。未知编号仍会拒绝，不会替模型编事实或让一句话直接修改世界。

这还不表示所有“智能NPC”都验收了：这批对话是fixture5专项，未覆盖当前森林整合、长时间记忆及偷抢威胁等所有交互。助手检查了关键事实，但地点措辞和饥饿程度等语言仍有待真人评判，原始报告保持人工待审。

| 门槛 | 结果 |
| --- | --- |
| 现有森林规则、保存/恢复与断线重试 | 通过相关真实服务回归 |
| Linux与Windows实际无头Chrome完整按钮旅程 | 两端通过，六阶段均实际执行 |
| 390px模拟、森林按钮44px、Tab/Enter退出 | 通过；本机截图也已检查 |
| 定向检查 | 49项不同检查通过，失败历史单独保留 |
| 修正后低成本模型 | fixture5赠粮4轮通过；另4轮工作场景是修正前基线 |
| 当前森林自然对话、长场景真实记忆语义 | 待验 |
| Windows游戏cmd双击、真手机与读屏 | 待验 |

距离“可演示的小闭环”已到实测通过这一层；距离你期望的长期智能NPC，接下来应集中验当前森林的自由对话和跨日记忆，再补真人试玩，不继续堆新支线。

## 给接手AI

### 仓库、版本与停止点

- 仓库 `llys-p/Narraverse-World-Map`，草稿 [PR45](https://github.com/llys-p/Narraverse-World-Map/pull/45)，父PR44 `8fa8179a99ddf85ac142df30956ad8d4ee049527`。分支 `codex/forest-browser-ci-20261031`，工作树 `/workspace/scratch/d4eebd62b5b0/Narraverse-Browser-CI`。
- 被测修复提交 `17b9dad051231f79f7504a1fd021d57022e8b568`；证据/交接提交在其后，按游戏与验收工具SHA绑定。候选清单 `docs/runtime/forest-playtest-candidate.json`，候选2，192份游戏源码/入口。
- 入口、fixture8、18356端口不变。不合main、不部署、不迁移真实档、不启停旧实例、不导入Narraverse2.0，不混入PR40。维持冻结新玩法、停止性能优化。GitHub Projects缺写入能力，待同步。

### 实现与失败

- `demo-runtime.css`：移除1000px最小宽度，容器可缩小、导航可换行；头像固定140px且顶对齐，600px以下人物卡纵排。不用隐藏横向溢出掩盖问题。
- `runtime/service/npc-language-provider.mjs`：仅当原始数组有最多3个合法正整数且全部来自本轮已知记忆，允许排序/去重成协议要求的升序；保留原格式问题诊断。未知、过量、非数字或非法值拒绝，回复/建议不改，不追加模型请求。
- `runtime-server.mjs`：SSE写入false代表已排队，等待drain期间只记dirty，不积累中间投影；drain后补最新状态。持续阻塞至15秒心跳仍断开，正常断线依旧detach并停止行进。低缓冲真实HTTP在旧实现失败、修复后通过，Windows实际浏览器也由失败转通过。世界规则/命令和存档格式未改。
- 验收脚本修正Enter缺少字符输入、隐藏世界页中的继续按钮、失败时browserExecuted误判；完整存档审计放在干净关服前，随后核对锁释放再重开。本机先前在关服后额外公共审计时观察到旧锁重现，未证明生产锁逻辑有错，未删锁或修改锁恢复代码；保留失败报告。

### 验证入口与证据

```sh
node scripts/check-forest-browser-evidence.mjs
node scripts/verify-forest-playtest.mjs artifacts/forest-playtest/my-new-run
```

第二条也由 `Verify-Forest-Playtest.cmd` 包装，是验收工具而非游戏入口。只接受尚不存在的输出目录，自建合成world、浏览器profile和临时端口，显式关闭模型，不读.env或真实档。默认Windows常见Edge路径，其他已安装Chromium用 `DEMO_BROWSER_EXECUTABLE` 指定；工具本身不下载浏览器。

- CI [运行41106777480](https://github.com/llys-p/Narraverse-World-Map/actions/runs/41106777480)：Ubuntu24.04 Chrome156.0.8078.47、Windows2022 Chrome156.0.8078.48均通过。六阶段结束tick78、rank4、工具70，无残留锁；真实调用由CDP正常按钮/Tab/Enter产生，无DOM代执行。两端是无头模式，不当作双击游戏cmd或真人验收。
- `.github/workflows/forest-browser-acceptance.yml`仅同仓公开PR触发，标准测试机、contents:read、固定Actions SHA、不保留checkout凭据、不读取Secrets/调用模型。保持原仓库字节避免Windows换行转换破坏指纹。不使用artifact/cache上传，不发布截图或存档。
- `docs/evidence/forest-browser-acceptance-20261031/`保存首次CI、Windows中间失败、最终两端结果、实际本机结果、红绿回归、三份真实模型JSON/HTML及完成回执、助手评审。模型报告原humanReview/semanticVerdict不改。截图只留私有测试目录，公共证据只保留名称与SHA。
- 本轮49项不同检查：31项Provider/事实/对话记忆回归；最终15项森林引导/预检/丢回执/断线/逾期；3项低缓冲HTTP与行进。首次失败、重复回归及真实浏览器执行单列，不重复加进49。新增SSE修复后重跑最终15项及完整本机、两端CI。
- 旧PR44/PR43证据属于历史冻结源码，旧核验器在干净对应父树运行；不能拿旧候选1核验器强验已经明确修改过的候选2。

### 真实对话与接续范围

模型 `deepseek-flash`，thinking关闭，10请求共29867输入/647输出token（服务回报，不猜最终账单）。用户此前明确选择低成本DeepSeek，历史8次只是助手单轮投入安排；本轮10次同样不是永久用户限制。凭据仅进程内使用，不写入文件/日志/提交；本轮已停止追加。

`live-work-01`：修复前4/4；`live-gifts-01`：2请求、1格式拒绝、后两轮blocked；`live-gifts-02`：修复后4/4，全部对话专项源码SHA与当前一致。三份世界重放都通过。不得说最终源码8/8语言验收：首场景属于基线，自动事实扫描覆盖有限，助手评审不能代替真人。

下一项保持有界：先让当前fixture8里的自然对话核对真实工具持有人、磨损、借期、遭遇和归还记忆，并用小批低成本请求检验跨日/否认旧目击/短追问。若发现问题集中修正并保留失败。再补Windows游戏启动、真手机和真人可玩体验。不要把待验项当完成，也不要回到扩支线或重做整套记忆系统。
