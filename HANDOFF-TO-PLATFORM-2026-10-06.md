# 移植任务书：把「世界地图原型」的游戏性改造成果并入正式版

- 日期：2026-10-06 16:20（Asia/Shanghai）
- 交付方：WorkBuddy（本轮只改原型，未碰正式版）
- 接手方：待派工的另一位 AI
- 原型目录：`D:\Narraverse2.0\artifacts\world-map-prototype-20261006`（18212，仅本机，已 .gitignore）
- 依据文档：同目录 `REVIEW-2026-10-06.md`（代码缺陷）、`GAMEPLAY-REVIEW-2026-10-06.md`（游戏体验）、`README.md`（原型说明）

---

## 0. 开工前（硬性）

1. 先读 `D:\Narraverse2.0\AGENTS.md`，再读 `D:\Narraverse2.0\项目协作日志.md` 最新条目（倒序，最新在最上）。每次修改项目后必须回写该日志，记录带精确时间、完整路径、AI 编号。
2. **先确认落点再动手。** 本轮我只在原型里实现，没有确认正式版目标树。候选有两个，必须和用户确认其一：
   - `D:\Narraverse2.0-platform-model`（Go 后端 + React/TS 前端，分支 `codex/platform-model-unification`）
   - `D:\Narraverse2.0\app`（纯静态文字冒险平台 SPA，app.js 约 5000 行）
   两者的接入方式不同：前者要把三个 JS 模块改成 TS 模块 + 后端存档；后者可以几乎原样搬，只需换掉持久化。
3. **并发提醒。** 原型目录在我写这份文档时仍有其他 AI 在改动（出现了我未创建的 `world-beasts.js`、`battle-shot.mjs`、`fix3-e2e.mjs`，`battle.html` 已被改写为 344 行版本）。动手前先 `ls -la --time-style=+%H:%M:%S` 看时间戳，读到的内容以磁盘当前内容为准，不要照抄本文档里的代码片段——**读文件，不要信文档**。
4. 禁区：不提交、不推送、不部署；不启停用户正在运行的实例（8080/8082/8097/8099/8130/8152/18099/18209/18210 等）；不读、不导出、不落盘任何密钥；不调用付费模型；不动用户书籍与运行数据。
5. **静态路由别用手工维护的白名单。** 原型早期在 `server.cjs` 里写死 `STATIC_JS` 名单，踩了三次坑（`world-beasts.js` → `world-fx.js` → `world-skill.js` + `world-combat-fx.js`）：症状是页面拿到 404，而报错显示成「某个全局对象 is not defined」，看着像代码写错。第三次的代价最重——用户实机报「战局没有找到技能：zhanji」和 `Cannot read properties of null (reading 'speedOf')`，连普通攻击都点不动。
   现在已改成**存在性判断**：根目录下真实存在的 `.js` 直接发，且限制为「根级、后缀 `.js`、排除 `server.cjs` 自身」（`README.md`、`.mjs` 仍返回 404）。移植时可以照搬这个思路。
   **更重要的第二层教训**：光改路由救不了正在跑的进程——Node 进程只在启动时读一次服务端代码。移植到正式版时，如果改动落在静态资源的注册方式上，**必须重启目标实例**，否则界面上会表现为「新功能没生效」。

---

## 1. 本轮改了什么，以及为什么

一句话：把「能跑通的演示」补成「循环能闭合的最小可玩品」。代码缺陷那四项 + 游戏性断点里的前三项。

| 改动 | 对应评审结论 | 落点 |
|---|---|---|
| 导出 `clamp` | 缺陷 1：点遁走抛 ReferenceError 且整局锁死 | `world-rpg.js` |
| 真元（qi）资源与技能收支表 | 游戏性断点五：四个技能零消耗，重击期望 1.44 严格优于普攻，玩家实际只有一个按钮 | `world-rpg.js` `SKILLS`、`battle.html` |
| 先手真正由 `turnOrder` 决定 | 缺陷 2：`turnOrder()` 全项目零调用，日志却承诺「速度定先手」 | `world-rpg.js` `battle.html` |
| 迟滞跨轮生效 | 缺陷 2 连带：`staggers` 只写不读，重击的代价不存在 | `world-rpg.js` `addStagger/endRound` |
| 战斗属性改用装备聚合值 | 缺陷 3：装备 +hp 在战斗是死属性（面板 44/48、战斗 44/44） | `battle.html` `world-inv.js` |
| 怪物等级与地图同源 | 缺陷 4：地图写死 Lv1/2，战斗按玩家等级生成 | `world-rpg.js` `monsterFromTpl`、`index.html` |
| 新增 `world-state.js` | 游戏性：世界不记得你（刷新即洗牌、场景不回写、NPC 无记忆） | 新文件，四个页面共用 |
| 休整有代价 | 游戏性断点二：休整免费无消耗，导致半个背包和全部血量管理失效 | `index.html` |
| 新增 `/shop` 商店页 | 游戏性断点三：铜币只有进项没有出口，经济是单向的 | `shop.html` `world-inv.js buy()` `server.cjs` |
| 败北掉三成铜币 | 游戏性断点四：赌注为零，风险设计不成立 | `battle.html` |
| 服务端小修 | `X-Frame-Options: DENY` 挡 iframe 整合；`busy` 全局锁误伤 `/api/decide`；根级脚本白名单 | `server.cjs` |
| 区域定级 | 游戏性：怪物永远与玩家同档，成长感被 treadmill 抵消 | `world-rpg.js` `ZONES`、`world-state.js`、`index.html` |
| 打击感三件套 | 游戏性：战斗只有飘字，没有音效/顿帧/屏震 | 新文件 `world-fx.js`、`battle.html` |
| 世界地图右键交互 | 用户点名：地图上只有左键行走，单位没有交互入口 | `index.html`（`#ctxMenu` / `#mapBubble`） |
| 文本 RP 呈现拆角色 | 用户点名：文本被拍平成「角色：内容」一行，且每次整块重绘 | `scene.html`（`.sd-message` / `.sd-who` / `.sd-line` / `.sd-mood`） |
| 场景内真打（拔刀相向） | 用户点名：进地点后攻击 NPC 没反应（原来是纯演示，不结算） | `scene.html` `startFight()`、`battle.html`、`world-rpg.js` `human` 模板 |
| 战场特效层 | 用户点名：剑气「要从左边释放到右边，现在的也还是奇怪得很」 | 新文件 `world-combat-fx.js`、`battle.html`（换成覆盖战场的单块 canvas） |
| 出手/受击动画重做 | 用户点名：攻击特效与受击动画再优化 | `battle.html`（起手式→前冲→飞行→爆点→后仰的完整动作链）、`world-combat-fx.js` |
| 日式 RPG 技能模块 | 用户点名：「加一个技能模块，先往日式RPG那个方向」 | 新文件 `world-skill.js`、`battle.html`（命令菜单 + 技能面板）、`world-rpg.js` `effSpeed`、`server.cjs` |

**未做**（留给下一轮，见第 6 节）：任务/委托系统、突破境界三选一、迷雾与随机事件、时辰影响世界。

---

## 2. 四个可移植模块的 API

这三个是纯 JS、无依赖、挂 `window`，是这次全部改动的骨架。移植时它们是最值得原样保留的部分。

### WorldRPG（`world-rpg.js`）

| 成员 | 说明 |
|---|---|
| `clamp(v,a,b)` | 导出给页面用（原本页面偷偷引用未定义版本） |
| `STAGGER_SPEED` | 迟滞惩罚，当前 8 |
| `statsFor(level,isPlayer)` | `{maxHP, maxQi, atk, def, speed}`；`maxQi = 12 + level*2` |
| `SKILLS` | `regular{qi:+2}` `heavy{qi:-5, multiplier:1.8, acc:0.8, stagger:1}` `guard{qi:+4, heal:3, mitigate:0.45}` `flee{qi:-3}` |
| `canPay(p,kind)` / `payQi(p,kind)` | 真元够不够 / 收支并夹在 `[0,maxQi]` |
| `damage(source,target,opts)` | 比值式减伤 `100/(100+def*8)`、±10% 随机、8% 暴击 ×1.6 |
| `xpToNext / xpFromKill / goldFromKill` | 幂曲线 `20*level^1.5` |
| `REALMS / realmOf(level)` | 境界表，返回 `{name, bonus}` |
| `KEY / fresh() / migrate(p) / load() / save(p)` | 存档；`migrate` 负责给老档补 `qi/maxQi`，`VERSION` 现为 2 |
| `grantXp(p,xp)` | 返回 `{levels, gains}`；突破时满血满气 |
| `BESTIARY / monsterFor(level)` | 随机取模板 |
| `monsterFromTpl(tplId, level)` | **新增**：按模板+等级造怪，地图与战斗共用，消灭等级不一致 |
| `createBattle(p,e)` | 返回 `b`：`b.p/b.e`、`turnOrder()`、`playerFirst()`、`effSpeed(a)`、`hit()`、`enemyChoose()`、`addStagger(a,n)`、`endRound()` |

`endRound` 的时序是这次修的关键：重击挂的迟滞进 `_pendingStagger`，轮末才转成 `staggers`，于是**下一轮**的 `effSpeed` 才被扣——原先在本轮末就减掉，等于从未生效。移植时别把这个中转优化掉。

### WorldRPG 的区域部分（区域定级）

`ZONES` 三条固定等级带（村口 1-3 / 山道 4-8 / 深山 9-14），`zoneAt(x,y)` 取相对最靠中心的区域，`levelInZone(zone)` 在带内随机，`templatesForZone(zone)` 按 `minLevel` 过滤模板（深山才会出石魔）。怪物是「那片地方的」而不是「玩家的影子」：`world-state.js` 的 `spawnOne(level, zone)` 传 zone 时忽略 level，`ensureZones(s)` 让每个区域维持至少一只。移植时若正式版地图尺寸不是 990×560，需要重算 `cx/cy/r`。

数据迁移坑：区域定级上线前已有的怪物没有 `zoneId`，`index.html` 开局会按坐标归区。少了这一步，区域补给会把老怪当成「三区皆空」而不断增殖（实测涨到 6 只）。正式版若已有存档，升级脚本要做同样的事。

### WorldFX（`world-fx.js`，新增，打击感）

零依赖。`play(name)` 支持 `hit / heavy / crit / miss / guard / hurt / dead / win / lose / levelup / coin / flee`，全部用 WebAudio 现场合成（振荡器 + 噪声 + 带通），不引入音频文件。`shake(el, 1|2)` 给容器挂一次性 CSS 动画（两档强度，尊重 `prefers-reduced-motion`），`freeze(ms)` 与 `isFrozen(now)` 实现顿帧——动画循环里判断 `isFrozen` 就跳过这一帧。`setMuted(v)` 可静音。

`battle.html` 里所有调用都写成 `if(window.WorldFX)`，模块缺失时页面照常工作，不会因为缺它报错。正式版若有自己的音频系统，直接把 `play()` 换成正式版的音效接口即可，`shake/freeze` 可以原样保留。

### WorldCombatFX（`world-combat-fx.js`，2026-10-06 20:05 新增）

**这一节请务必看，它是「剑气从左边释放到右边」这个需求的落点，也是最容易被移植歪的一块。**

旧实现把战斗特效画在两块 220×146 的小画布上，画布分别贴死在玩家和敌人身上。这个载体是错的：特效画得再好也**飞不出那块画布**，所以剑气只能原地闪。移植时如果正式版的战斗页也是「每个角色挂一块小画布」的结构，要先把载体换成一块覆盖整个战场的层，否则无论怎么调参数都不对。

| 成员 | 说明 |
|---|---|
| `init(el)` | 传一块覆盖战场的 canvas；内部按 `devicePixelRatio`（上限 2）设置，并尊重 `prefers-reduced-motion` |
| `resize()` | 重新读容器尺寸。页面 `resize` 与 `ResizeObserver` 都要调 |
| `anchor(x, kind)` | `x` 是归一化横坐标（0..1），`kind` 为 `'chest'`（命中点）/`'ground'`（脚下）/`'high'`（雷击落点），返回 `{x,y}` |
| `cast(spec) → Promise` | 投射物飞行，**到达时 resolve**。`spec: {kind, from, to, dur, color, size}` |
| `burst(spec)` | 命中爆点。`{at, kind, dur, color, size, flash}`。闪光是**以 `at` 为圆心的径向绽放**，不是全屏铺白 |
| `aura(spec)` / `particles(spec)` | 常驻光环 / 自由粒子（烟雾、余烬） |
| `charge(spec) → Promise` | 起手式聚气，日式 RPG 的「预告」，同样带超时兜底 |
| `clear()` | 清空图层 |

三个不能丢的设计：

1. **方向显式取左右**，这才是「左→右」的保证，不是靠调用方传对参数：
   ```js
   const dirX = (b.x - a.x) >= 0 ? 1 : -1;
   ```
2. **`cast()` 必须有超时守卫。** 画布被冻结、被隐藏、模块缺失时，`await` 不能锁死回合：
   ```js
   return new Promise(resolve => { let done = false;
     const finish = () => { if (done) return; done = true; clearTimeout(guard); resolve(); };
     const guard = setTimeout(finish, dur + 80); /* … */ });
   ```
3. **不要在冻结帧里推进闪光衰减。** 顿帧期间 `WorldFX.isFrozen(now)` 为真，闪光要保持住，否则顿帧会把刚刚那一下闪过去。
4. **这两个模块都必须是「可选」的。** `battle.html` 里 `const SK = window.WorldSkill || SKILL_FALLBACK` 这条不能写成 `|| null`——写成 null 的后果已经在用户实机验证过了：模块一旦取不到，`playerAct` 会在「没有找到技能」那一步直接返回，连普通攻击都点不动。降级实现只要照着 `SKILL_FALLBACK` 的样子给出 `get/known/canPay/payMp/speedOf/willSkip/elementRate/statusTick/statusText/resolve/resolveHit` 这几个方法就够，伤害继续走正式版已有的 `WorldRPG.damage`，不要另写一套。移植到正式版时同理：**任何后加的表现层模块，都不能成为「功能跑不起来」的单点。**

冲击闪光别写成 `fillRect(0,0,W,H)` 铺一层白——实测那会把整个战场糊成灰色（照亮像素 285600 = 铺满），深色场景下最该亮的命中点反而不亮。径向绽放版实测只有 43107 像素被照亮，光晕落在敌方一侧。

### WorldSkill（`world-skill.js`，2026-10-06 20:05 新增）

日式 RPG 技能模块。纯 JS、零依赖、挂 `window`。

| 成员 | 说明 |
|---|---|
| `ELEMENTS` | 8 种属性：`none/zhan/huo/bing/lei/feng/guang/an`，各带 `name` 与色值 |
| `STATUS` | 4 种异常：`du`（毒）/`zhuo`（灼烧）/`bing`（冻结）/`ma`（麻痹） |
| `SKILLS` | 12 个技能，字段 `id/name/elem/mp/power/acc/hits/learnAt/flow` 等 |
| `tagsFor(tplId)` | 取怪物模板的 `{weak, resist, elem}` |
| `elementRate(elem, tags)` | **`{rate, label}`**：克制 `{1.6, '效果拔群！'}`，被抗 `{0.55, '效果不佳……'}` |
| `known(level)` | 该等级已习得的技能表 |
| `newLearned(from, to)` | 升级跨档时新学到的技能，用于结算面板「习得新技能：…」 |
| `canPay(p)` / `payMp(p, mp)` | 真元（= MP）够不够、扣不扣 |
| `resolveHit(a, b, sk, opts)` | **单段结算**，返回 `{dmg, crit, miss, rate, label, dot}` |
| `resolve(...)` | 整招结算（内部循环 `resolveHit`） |
| `statusTick(actor)` / `statusText(actor)` / `hasStatus/applyStatus/clearStatus` | 回合末 DOT 结算与状态文案 |
| `speedOf(a)` | 有效速度，已把迟滞与冻结折进去（供先攻判定） |
| `willSkip(a)` | 麻痹等导致本回合无法行动 |

移植要点：

- **多段技要一段一段结算并一段一段飞。** 所以 `resolveHit` 被单独拆出来：`palms-of-thunder` 这类 3 段技「每段单独判定命中」，日志会出现「1 段落空」。MP 只在**施放时扣一次**，不是每段都扣——这一点很容易写错。
- **弱点表 `MONSTER_TAGS` 故意放在技能模块里，不放进 BESTIARY。** 当时另一位 AI 正在并发重构妖兽表，放进去必然冲突。移植到正式版时可以合并回怪物定义，但别在冲突环境下硬来。
- **不要另起一套伤害公式。** 技能只往既有的 `WorldRPG.damage`（hedra 式 `100/(100+def*8)` 比率减伤）里塞修正项，否则两个系统的数值会漂移。
- 冻结要参与先攻：`world-rpg.js` 的 `effSpeed` 里额外减半，只在 `window.WorldSkill` 存在时生效（老存档/独立页面不受影响）。

### WorldInv（`world-inv.js`）

`CATALOG`（12 项，`mods` 支持 `atk/def/speed/hp/qi`）、`SLOTS`、`SLOT_ZH`、`dropRoll(profile, bias)`（总掉率由 96% 降到 72%，第二参数改成怪物倾向掉落）、`ensure/add/remove/countOf/equip/unequip/use/sell/buy/totals`。

两个要点：`use()` 的回血上限改成 `totals().hp`（装备 +hp 才真的能吃）；`totals()` 现在返回 `{atk, def, speed, hp, qi}`。

### WorldState（`world-state.js`，新增）

单键 `world_state_v1`，结构扁平：`{version, day, hour, pos, monsters[], visited{}, locFlags{}, npcMemory{}, journal[]}`。

`load() / save(s) / reset() / clockText(s) / hourName(h) / spawnOne(level) / ensureMonsters(s,level,count) / removeMonster(s,id) / markVisited / setLocFlag / getLocFlag / noteNpc(s,id,patch) / journalAdd(s,text)`。

这是「上下层状态桥」的最小实现：地图页读写时间与坐标和怪物，战斗页在被杀时调 `removeMonster` 并 `journalAdd`，场景页在 `execute/modelTurn` 包装里调 `noteNpc` 写 NPC 记忆。移植时如果正式版有 IndexedDB 或服务端存档，只需替换 `load/save` 两个函数，其余结构不用动。

### 跨页契约：场景／地图 → 战斗 → 回原处（2026-10-06 17:50 新增）

三层之间不做 SPA 路由，全靠 URL 参数 + `locFlags` 回写。移植时这套契约要原样保留，否则「打完回来对方还站着」的老问题会复现。

战斗页读的 URL 参数：

| 参数 | 含义 | 谁传 |
|---|---|---|
| `kind` | 妖兽模板 id（`wolf/bandit/golem`）或 `human` | 地图「迎战」、场景「拔刀相向」 |
| `lv` | 敌人等级。地图传怪的实际等级；场景传玩家等级（同级单挑） | 同上 |
| `name` | 敌人显示名。地图传怪名；场景传人物名（掌柜、店主…），覆盖模板兜底名 | 同上 |
| `mid` | 地图怪物的 id。**非空**表示这是地图上的一只，打赢要 `removeMonster` | 地图 |
| `loc` | 地点/区域显示名，只用于文案 | 地图传区域名，场景传 `current.title` |
| `flag` | **场景层写 `locFlags` 用的键**，目前是题材 `wuxia/city/space` | 场景 |
| `foe` | 场景里的人物 id（如 `host`） | 场景 |
| `back` | 打完后「回到刚才的地方」按钮的地址（场景传 `/scene?theme=xxx`，地图传 `/`） | 两边都传 |

回写规则（`battle.html endBattle`）：

- 赢：`removeMonster(mid)`（若有）+ `setLocFlag(flag, 'defeated:'+foe, true)`（若有）+ `journalAdd('斩 X 于 Y')`。
- 输：失三成铜币、写 `'hostile:'+foe`、`journalAdd('败于 X 之手…')`。
- 遁走：写 `'hostile:'+foe`、`journalAdd('从 X 手下遁走')`——拔了刀又跑，同样结怨。
- 场景侧 `startFight()` 在跳转**之前**先写 `'attacked:'+foe` 并记一条世界日志，这样即使玩家中途关掉战斗页，世界也知道你拔过刀。

场景侧 `applyBattleMemory()`（在 `apply()` 之后调用）读这些标记：`defeated:` → 动作切 `knockdown`、`flow.people[id].hp=0`、菜单里对话/拔刀/偷窃置灰；`hostile:` → 切 `guard` 并保持警觉。落地一条要注意：`flag` 必须用**题材键**（`wuxia`），不是地点显示名（`山间客栈`）——场景层 `rememberNpc` 写 `npcMemory`/`locFlags` 用的也是题材键，两边不一致就永远读不到。

人形对手用 `WorldRPG.BESTIARY` 里的 `human` 模板，标记 `humanoid:true, noSpawn:true`：`noSpawn` 让它不进地图随机刷新（`templatesForZone` 会过滤它），`humanoid` 让战斗页用火柴人而不是线条妖兽来画敌人。想加「散修/捕快/仇家」等更多人形，照这个模板复制即可，记得保持 `noSpawn:true`。

---

## 3. 页面与路由

| 路由 | 文件 | 本轮变化 |
|---|---|---|
| `/` | `index.html` | 接入 WorldState（刷新不洗牌）；怪物按区域 `spawnOne(1, zone)` 生成；休整在野外消耗干粮、在含 `rest` 的地点免费回满真元；地点带 `services:['rest','shop']`；遭遇跳转带 `kind/lv/mid/loc`；单 rAF + 真实 delta（原来 setInterval 固定 dt 在后台标签页会降速）；DPR 缩放；`matchMedia` 缓存；显示世界日志与 NPC 记忆；重开一局；**右键上下文菜单**（妖兽／散修／地点／空地四种） |
| `/battle` | `battle.html` | 真元条与技能消耗、先手、迟滞、装备聚合属性、战斗结果回写世界状态、败北掉三成铜币；**新增 `name/loc/flag/foe/back` 参数与 `defeated:/hostile:` 回写**；**特效从两块贴身小画布换成一块覆盖整块战场的 canvas**；**指令区改成日式 RPG 命令菜单（攻击／技能／防御／遁走）+ 可滚动技能面板**；**出手拆成起手式→前冲→飞行→爆点→受击后仰，伤害数字在投射物抵达后才飘**；**回合末跑异常状态 DOT 与冻结减速**；**结算面板报告升级新学到的技能** |
| `/scene` | `scene.html` | `execute/modelTurn` 包装新增 `rememberNpc()`，把读数与行为写进 `npcMemory`；**右键人物菜单的攻击项换成「拔刀相向」进真实战斗**；**`applyBattleMemory()` 按 `locFlags` 恢复倒地/结怨**；**文本日志按角色分行 + 读数标签** |
| `/character` | `character.html` | 属性表加真元上限；装备 mods 文案支持 `qi` |
| `/shop` | `shop.html` | 新增。铜币出口，买入受等级与铜币双重限制，卖出复用 `INV.sell` |
| — | `server.cjs` | 新增 `/shop`；`STATIC_JS` 白名单（`world-rpg/world-inv/world-state/world-beasts/world-fx/world-skill/world-combat-fx/stickman-engine`）；`X-Frame-Options: DENY` 换成 CSP `frame-ancestors`（为 iframe 整合让路）；`busy` 锁不再挡 `/api/decide` |

`STATIC_JS` 是显式常量，**新增任何根级 .js 都必须登记**，否则页面拿到 404、表现为「某个全局 is not defined」——`world-beasts.js`、`world-fx.js`、`world-skill.js`、`world-combat-fx.js` 都踩过这个坑。

另外注意路由是 `/battle` 而不是 `/battle.html`（`/scene`、`/shop`、`/character` 同理），探测服务存活时别用带 `.html` 的路径去试，那会返回 404、看起来像服务挂了。

---

## 4. 建议的移植顺序

1. 落点确认后，先搬三个模块（`world-rpg.js` → `world-inv.js` → `world-state.js`），保持纯函数、不碰 UI。
2. 把 `WorldState.load/save` 换成正式版的持久化通道（IndexedDB / 服务端存档 / 现有 profile 存储），其余不动。
3. 接战斗层：真元条 UI、先手流程、`addStagger`。
4. 接地图层：状态恢复、怪物生成、休整规则、地点 `services`。
5. 接商店页（或把货架并进正式版已有的商店/交易 UI，只复用 `INV.buy/sell`）。
6. 接场景层的 `noteNpc` 回写，再接 `applyBattleMemory`（第 2 节末的跨页契约），最后接场景右键的「拔刀相向」。
7. 地图右键菜单和文本 RP 呈现是纯 UI 层，放最后，且要按正式版已有的交互习惯改——原型里的右键菜单是「原型自己的一套」，正式版若已有右键/长按体系，应并入而不是并存。
8. 最后搬本轮的两个新模块：`world-skill.js`（纯数据 + 纯函数，可直接用；**先只接 `known/canPay/payMp/resolveHit`，把 `resolveHit` 接进正式版既有的单次结算路径**，多段技和异常状态可以后再开）→ `world-combat-fx.js`（**先换载体再接特效**：确认战斗页有一块覆盖战场的 canvas，否则这一模块搬过去等于没搬，见第 2 节该模块的说明）。

每一步都要能单独跑通再进下一步。

---

## 5. 验收标准

原型侧有三个真实浏览器用例，互不替代：

- `game-e2e.mjs`：A 遁走 / B 真元 / H 迟滞跨轮 / C 先手 / D 商店 / E 休整代价 / F 持久化 / G 击杀移除与日志 / I 区域定级 / J 打击感。
- `ctx-e2e.mjs`：K1 地图右键妖兽→迎战 / K2 右键散修→拔刀相向（敌人用火柴人）/ K3 地点与空地菜单 / L 场景右键人物→拔刀相向带上 `flag/foe/back` / M 打赢后 `locFlags` 回写、回场景对方倒地且菜单置灰 / N 日志行按角色拆分、无「角色：」前缀。
- `skill-e2e.mjs`（本轮新增）：P 特效层覆盖整块战场且锚点是左→右 / P2 **像素质心真的向右移动** / Q 技能面板、弱点提示、真元扣除 / R 前冲位移且命中后不锁死 / S 毒挂上并在回合末扣血 / T `known` 与 `newLearned` / U 多段技分段结算 / U2 400 次采样的命中与会心分布 / V 页面无 JS 错误、按钮可用。
- `fx-shot.mjs`（本轮新增，取证用）：抓一轮「剑气斩」的 6 连帧，每帧同时记录特效层重心与锋尖位置，左→右的位移可以直接从图上读出来。
- `fallback-e2e.mjs`（本轮新增，**别嫌它啰嗦**）：用 CDP 的 `Fetch.failRequest` 主动把 `world-skill.js` / `world-combat-fx.js` 的请求掐掉，复现「可选模块没加载」的现场，再断言普攻／防御／力斩都还能打、`#fallbackNote` 提示出现、日志里没有「没有找到技能」也没有「出现异常」、`window.__errors` 为空。这条用例存在的理由很具体：**正常路径全绿并不代表实机没问题**——模块走 HTTP 加载，而负责发它的进程可能根本不知道这个文件存在。

跑法：

```bash
cd D:/Narraverse2.0/artifacts/world-map-prototype-20261006
set WORLD_PORT=18302 && node server.cjs      # 另开一个窗口
node game-e2e.mjs                            # 输出 JSON，errors 应为 []
node ctx-e2e.mjs
node skill-e2e.mjs
node fallback-e2e.mjs                        # 模块缺失也不能死，errors 应为 []
node fx-shot.mjs                             # 产出 fx-shot-1..6.png
```

`ctx-e2e.mjs` 里有一处刻意的测试预处理：散修会在地图上走动、可能正好和某只妖兽重叠，而右键按「妖兽优先」命中，所以用例先把散修挪到空地再点。产品行为本身没问题，是测试需要控制前提，别把这行当成待删的临时代码。

**用世界坐标伪造右键事件的脚本必须走页面自带的 `worldToScreen`，不能自己按画布尺寸线性换算。** 地图从 990×560 扩到 1560×840 并加了摄像机之后，`ctx-e2e.mjs` 仍然用旧尺寸换算，落点整体偏移、全部掉进「空地」分支，K1/K2/K3 集体误报成 `NO_ITEM`——**看起来像功能坏了，其实是测试脚本过期**。凡是新的右键用例，都从 `window.__mapDebug.worldToScreen(x,y)` 取 client 坐标。

注意本机有 `HTTP_PROXY=127.0.0.1:5497`，headless Edge 必须带 `--no-proxy-server`，curl 要 `--noproxy '*'`，否则页面全空白、所有断言假失败。

移植后要补的断言（原型侧没有、正式版必须有）：
- 真元在页面刷新后保持（当前战斗中途刷新不保存真元，只保存 hp/gold/qi 的结算值——原型可接受，正式版应写进存档）。
- 商店买入后装备栏与属性表同步刷新。
- 世界状态与角色档案在同一事务里写，避免一个写成功一个失败导致状态错位。
- 正式版若多标签页，`world_state_v1` 会被互相覆盖，需要加版本或时间戳冲突处理（原型是单页面假设，没有做）。
- 技能树没有分支：`learnAt` 是线性的，到等级就全给，玩家不需要做选择。正式版若要有「练剑还是练术」的取舍，得改成技能点／流派。
- 属性克制表 `MONSTER_TAGS` 现在只覆写 `weak/resist/elem`，没有「同属性免疫」与「属性吸收」（打上去回血）这两种常见机制。

---

## 6. 已知边界与下一轮候选

- 区域等级带目前是写死的三档（村口 1-3 / 山道 4-8 / 深山 9-14）。玩家等级超过 14 之后，深山也不再构成威胁，届时需要按玩家进度整体平移档位或加第四区。
- 没有任务与委托，玩家仍然「不知道该干嘛」——这是核心循环上最后一个断点。
- 三个地点只有 `services` 差异，还没有真正的内容差异。
- 成长仍无选择：等级自动涨、属性自动算、境界自动给。
- 场景层的回写目前只有「人被打倒/结怨」一条（`defeated:` / `hostile:`）。再往上一层（打了掌柜之后客栈关门、守卫来抓你）还没有，`locFlags` 的键位已经预留好了。
- 场景里的对手一律用玩家等级（同级单挑），没有「掌柜其实是个练家子」这类个体强度差异，也没有对话前因——拔刀是无条件的，不检查关系。
- 世界地图右键的命中半径是固定的 20 像素（`dist(pt,unit) < 20`）。单位重叠时按「妖兽 → 散修 → 地点 → 空地」的顺序判定，所以妖兽站在散修身上时点不到散修。
- `layaTargetPose`（`scene.html`）仍是 8 通道旧版，`laya-torso-20261005` 的 `targetPose` 已修成 18 通道全量复位 + alpha 兜底，两份拷贝分叉未解决，建议抽共享 `laya-pose.js`。
- **技能这轮故意没做的**：ATB 时间条、奥义／极限槽、召唤、队伍与人物切换。另外弱点现在直接写在技能菜单的提示里，日式 RPG 通常要先「调查」过一次敌人才显示——这层探索感下一轮再补。
- 战斗页刷新会丢当前回合状态（只落盘结算后的 hp/gold/qi），技能面板与真元同理。原型可接受，正式版应写进存档。

---

## 7. 证据

- `e2e-game.png`（游戏性验证截图）、`e2e-battle-wolf.png` / `e2e-battle-bandit.png`（另一个 AI 的战斗表现层截图）。
- `e2e-ctx.png`（`ctx-e2e.mjs` 结尾截图）、`shot-map-ctx.png`（地图右键菜单）、`shot-scene-text.png`（文本 RP 的角色分行与读数标签）。
- `e2e-skill.png`（技能面板与战斗页整体）、`fx-shot-1..6.png`（一轮「剑气斩」的连拍：第 2 帧聚气、第 3 帧剑气在两人之间右飞、第 5 帧命中绽放与伤害数字）。

全部产物在 `D:\Narraverse2.0\artifacts\world-map-prototype-20261006`，已 gitignore，不进主仓。

---

## 8. 收口补充（2026-10-06 22:40，小Z·Zcode；依据收口任务卡补记）

### 8.1 模块归属（移植署名与问询对象）

| 模块 | 作者 | 说明 |
|---|---|---|
| 地图层初版、场景层 Laya 躯干接线、战斗+成长初版、world-inv/character/kit 接入、world-beasts、StickArt 接入、右键双轨坐标、fix3 修复 | 小Z | 本文 §1 表格中"游戏性补齐"之前的各原型轮 |
| world-state.js、shop.html、真元/先手/迟滞接入回合循环、区域定级 ZONES、world-fx.js、右键上下文菜单、文本 RP 拆分、拔刀相向跨页契约、world-skill.js、world-combat-fx.js、SKILL_FALLBACK、存在性路由 | WorkBuddy | 本文 §1 表格"游戏性补齐"起的各轮（§2 API 文档亦为 WorkBuddy 所写） |
| 本文与 README 编年体 | WorkBuddy | 小Z 仅追加本节与阶段总结 §10，不改写历史轮次 |

### 8.2 复跑状态与移植验收的前提（2026-10-06 22:20–22:40 小Z 复跑）

- ✅ 已复跑全绿：fix4（自建 18213）/ rpg、inv（18212）/ game（18302）/ skill（小Z 隔离实例 18213 + WORLD_BASE）/ fallback（18302）。输出与截图在 `D:\Narraverse2.0-ai-shared\deliveries\2026-10-06-小Z-原型收口\evidence\`。
- ⛔ **world-e2e 与 ctx-e2e 未复跑**：两者各含一步真实 DeepSeek 调用（world-e2e 第 5 步显式"真实 DeepSeek"；ctx-e2e N 步经 scene 加载时 `aiStatus` 自动勾选 AI 触发 `/api/chat`），收口卡禁止云模型调用，且两脚本实例地址硬编码无旁路。**正式移植验收涉及这两套时，须在用户明确授权云调用的前提下补跑**，不得以"此前绿过"替代。
- 本目录冻结与事故记录见阶段总结 §10（含 fallback-e2e 覆盖 `e2e-fallback.png` 一事）。

### 8.3 Laya 联动的移植红线（原型未实现部分不得偷带进正式包）

- 原型场景层的 Laya 躯干链路依赖：本地桥 `127.0.0.1:8130`（laya_serve.py，CUDA 模型）＋ 服务端读 `D:\Narraverse2.0-fusion\demos\laya-live\.env`（DeepSeek key）做中文直译。**这两者都是本地原型设施，正式包严禁直连该端口或读取该 .env**；文本理解与生成一律走正式平台的模型网关（维护树 `codex/platform-model-unification` 的 NarraverseSharedAI / 宿主通道）。
- 尚未实现、也未包含在本任务书移植范围：散修心境→地图行为、世界地图层情绪行为桥、场景状态→Laya 心境回写。§1–§5 的移植清单只覆盖游戏性四层，不含任何 Laya 联动。
