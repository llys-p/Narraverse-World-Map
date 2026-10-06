'use strict';
/*
 * world-rpg.js —— 战斗与成长数值模块（地图页 / 战斗页 / 商店页共用，纯 JS 无依赖）
 *
 * 公式出处（调研 2026-10-06，不重新造轮子）：
 * - 实体属性形状与等级缩放：trial-tower/hedra-engine（MIT，github.com/WhiteMinds/trial-tower）
 *   createEntity({level, maxHP: 10 + level*5, atk: 1 + Math.round(level/4), speed: 10})，
 *   回合按 speed 排序，技能产出结构化 CombatLog，战利品 = EXP + 物品，stage.onKill。
 * - 伤害形状：hedra-engine DamageEffect（baseValue × multiplier，modifiers 可改两者）；
 *   本模块把“防御减伤”做成常见的比值式 K/(K+def·k)（减法式会被高防归零，见 xianxia
 *   combat.js 的 max(1, atk-def*0.5) 基线），并保留 ±10% 随机（同 xianxia 基线）。
 * - 成长：经验曲线 round(20 * level^1.5)（常见 RPG 幂曲线），境界表风格取自
 *   xianxia-AI-town cultivation（练气/筑基/金丹…），境界提供攻击加成倍率。
 * - 存档：localStorage（profile 键），战斗结果经 world-rpg 常规读写。
 *
 * 2026-10-06 修订（依据 REVIEW-2026-10-06.md 与 GAMEPLAY-REVIEW-2026-10-06.md）：
 * - 导出 clamp：battle.html 原先引用了从未定义的 clamp，点「遁走」抛 ReferenceError
 *   且 busy 不复位，整局锁死（评审缺陷 1）。
 * - 新增真元（qi）资源与 SKILLS 收支表：普攻回气、重击耗气、防御回气、遁走耗气。
 *   原来四个技能零消耗，重击期望 1.44 严格优于普攻 1.0，玩家实际只有一个按钮。
 * - 迟滞（staggers）从「只写不读」变成真生效：重击后下一轮速度 -8，会影响先手判定。
 * - 存档加 version 与 migrate()，避免加字段后老档带着 undefined 进战斗结算。
 * - 新增 monsterFromTpl()：地图遭遇面板与战斗页用同一只怪，消灭等级两边不一致。
 */
(function (global) {
  'use strict';
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---- 数值核心（引用出处见文件头） ---- */
  const RPG = {
    VERSION: 2,               // v2：新增真元与存档版本校验
    STAGGER_SPEED: 8,         // 迟滞：重击后下一轮的速度惩罚

    clamp: clamp,             // 导出给页面用

    // 等级 → 属性（hedra 缩放；玩家额外有 def 与成长加成）
    statsFor: (level, isPlayer) => ({
      level,
      maxHP: Math.round(10 + level * 5 + (isPlayer ? 4 : 0)),
      maxQi: 12 + level * 2,
      atk: Math.max(1, Math.round(1 + level / 4 + (isPlayer ? 1 : 0))),
      def: Math.max(0, Math.round(level / 3 + (isPlayer ? 1 : 0))),
      speed: 10 + level,
    }),

    /* 技能表：真元收支是技能取舍的来源（GAMEPLAY-REVIEW 断点五）
     * qi > 0 = 回复，qi < 0 = 消耗；stagger = 命中后给自己挂的迟滞轮数 */
    SKILLS: {
      regular: { name: '普通攻击', qi: 2, multiplier: 1.0, acc: 1.0, stagger: 0 },
      heavy: { name: '重击', qi: -5, multiplier: 1.8, acc: 0.8, stagger: 1 },
      guard: { name: '防御调息', qi: 4, heal: 3, mitigate: 0.45 },
      flee: { name: '遁走', qi: -3 },
    },
    // 真元是否够付（只有消耗型才需要检查）
    canPay: (p, kind) => {
      const s = RPG.SKILLS[kind];
      if (!s || s.qi >= 0) return true;
      return (Number(p.qi) || 0) + s.qi >= 0;
    },
    payQi: (p, kind) => {
      const s = RPG.SKILLS[kind];
      if (!s) return 0;
      p.qi = clamp((Number(p.qi) || 0) + s.qi, 0, Number(p.maxQi) || 0);
      return s.qi;
    },

    // 伤害：base(atk) × 技能倍率 × 减伤比值 × 随机 ±10%，暴击 8% ×1.6，最小 1
    damage: (source, target, opts) => {
      const o = opts || {};
      const ctx = { source, target, baseValue: source.atk, multiplier: o.multiplier || 1, varDelta: rand(-0.1, 0.1), crit: Math.random() < 0.08 };
      (o.modifiers || []).forEach(m => m(ctx));
      const mitigate = 100 / (100 + Math.max(0, target.def) * 8);
      const dmg = Math.max(1, Math.floor(ctx.baseValue * ctx.multiplier * mitigate * (1 + ctx.varDelta) * (ctx.crit ? 1.6 : 1)));
      return { dmg, crit: ctx.crit };
    },

    // 经验曲线与升级（幂曲线）
    xpToNext: level => Math.round(20 * Math.pow(level, 1.5)),
    xpFromKill: enemy => Math.max(4, Math.round(6 + enemy.level * 4)),
    goldFromKill: enemy => Math.max(1, Math.round(2 + enemy.level * 1.5 + rand(0, 3))),

    // 境界表（风格取自 xianxia cultivation）：由等级映射，提供攻击倍率
    REALMS: [
      { name: '练气一层', min: 1 }, { name: '练气三层', min: 2 }, { name: '练气六层', min: 4 },
      { name: '练气九层', min: 6 }, { name: '筑基期', min: 8 }, { name: '筑基圆满', min: 11 },
      { name: '金丹期', min: 14 }, { name: '金丹圆满', min: 18 }, { name: '元婴期', min: 22 },
      { name: '化神期', min: 27 }, { name: '渡劫期', min: 33 }, { name: '陆地神仙', min: 40 },
    ],
    realmOf(level) {
      let r = this.REALMS[0], idx = 0;
      this.REALMS.forEach((x, i) => { if (level >= x.min) { r = x; idx = i; } });
      return { name: r.name, bonus: 1 + idx * 0.1 };
    },

    /* ---- 玩家档案（localStorage） ---- */
    KEY: 'world_rpg_profile_v1',
    fresh: () => {
      const s = RPG.statsFor(1, true);
      return {
        version: RPG.VERSION,
        level: 1, xp: 0, gold: 0,
        hp: s.maxHP, maxHP: s.maxHP,
        qi: s.maxQi, maxQi: s.maxQi,
        atk: s.atk, def: s.def, speed: s.speed,
        kills: 0, losses: 0, realms: RPG.realmOf(1).name,
      };
    },
    /* 老档（无 version）补齐新字段，不让 undefined 流进战斗结算 */
    migrate(p) {
      const s = RPG.statsFor(p.level || 1, true);
      if (p.version == null) {
        p.version = RPG.VERSION;
        p.maxQi = p.maxQi || s.maxQi;
        if (p.qi == null) p.qi = p.maxQi;
      }
      if (p.maxQi == null) { p.maxQi = s.maxQi; if (p.qi == null) p.qi = p.maxQi; }
      if (p.qi == null) p.qi = p.maxQi;
      p.qi = clamp(Number(p.qi) || 0, 0, p.maxQi);
      p.maxHP = Number(p.maxHP) || s.maxHP;
      p.hp = clamp(Number(p.hp) || 0, 0, p.maxHP);
      p.gold = Math.max(0, Math.round(Number(p.gold) || 0));
      p.kills = Number(p.kills) || 0; p.losses = Number(p.losses) || 0;
      p.realms = p.realms || RPG.realmOf(p.level || 1).name;
      return p;
    },
    load() {
      try {
        const v = JSON.parse(localStorage.getItem(RPG.KEY) || 'null');
        if (v && v.level && v.maxHP) return RPG.migrate(v);
      } catch (e) { /* 损坏则重置 */ }
      const f = RPG.fresh(); RPG.save(f); return f;
    },
    save(p) { try { localStorage.setItem(RPG.KEY, JSON.stringify(p)); } catch (e) { /* 隐身模式等 */ } },

    /* 升级结算：返回 {levelsGained, gains:[...]}，满血升级（xianxia 习惯） */
    grantXp(p, xpRaw) {
      const xp = Math.max(0, Math.round(Number(xpRaw) || 0)); // 防御 NaN/undefined 写脏存档
      const gains = []; let levels = 0;
      p.xp = Math.max(0, Math.round(Number(p.xp) || 0)) + xp;
      while (p.xp >= RPG.xpToNext(p.level)) {
        p.xp -= RPG.xpToNext(p.level);
        p.level += 1; levels += 1;
        const s = RPG.statsFor(p.level, true);
        p.maxHP = s.maxHP; p.atk = s.atk; p.def = s.def; p.speed = s.speed;
        p.maxQi = s.maxQi; p.qi = s.maxQi;   // 突破即气满
        p.hp = p.maxHP;
        p.realms = RPG.realmOf(p.level).name;
        gains.push(p.realms + '（HP ' + p.maxHP + ' / 攻 ' + p.atk + ' / 防 ' + p.def + ' / 真元 ' + p.maxQi + '）');
      }
      RPG.save(p);
      return { levels, gains };
    },

    /* ---- 怪物图鉴（等级缩放走 hedra 公式，不加玩家补贴） ---- */
    BESTIARY: [
      /* 线条风妖兽（StickArt 组件，artId 对应 /stickart/beasts 的组件 id），zone 决定出没区域 */
      { id: 'wild_dog',     name: '野狗',      minLevel: 1, zone: 'village', artId: 'wild_dog',     skills: { regular: 0.6, pounce: 0.3, howl: 0.1 }, actions: { regular: 'attack', pounce: 'charge', howl: 'cast' }, tint: '#8a8066', dropBias: 'bread' },
      { id: 'boar_piglet',  name: '野猪崽',    minLevel: 1, zone: 'village', artId: 'boar_piglet',  skills: { regular: 0.7, pounce: 0.3 }, actions: { regular: 'attack', pounce: 'charge' }, tint: '#7a7264', dropBias: 'bread' },
      { id: 'bamboo_snake', name: '竹青蛇',    minLevel: 2, zone: 'village', artId: 'bamboo_snake', skills: { regular: 0.6, pounce: 0.4 }, actions: { regular: 'attack', pounce: 'charge' }, tint: '#6f8a6a', dropBias: 'potion' },
      { id: 'black_bear',   name: '黑熊',      minLevel: 4, zone: 'road',    artId: 'black_bear',   skills: { regular: 0.6, pounce: 0.25, howl: 0.15 }, actions: { regular: 'attack', pounce: 'charge', howl: 'cast' }, tint: '#5d6358', tough: 1.3, dropBias: 'ingot' },
      { id: 'giant_python', name: '巨蟒',      minLevel: 5, zone: 'road',    artId: 'giant_python', skills: { regular: 0.65, pounce: 0.35 }, actions: { regular: 'attack', pounce: 'charge' }, tint: '#6a725a', dropBias: 'potion' },
      { id: 'shadow_wolf',  name: '影狼',      minLevel: 9, zone: 'deep',    artId: 'shadow_wolf',  skills: { regular: 0.55, pounce: 0.35, howl: 0.1 }, actions: { regular: 'attack', pounce: 'charge', howl: 'cast' }, tint: '#5e6d57', dropBias: 'potion' },
      { id: 'rock_golem',   name: '岩傀儡',    minLevel: 10, zone: 'deep',   artId: 'rock_golem',   skills: { regular: 0.7, pounce: 0.2, howl: 0.1 }, actions: { regular: 'attack', pounce: 'push', howl: 'cast' }, tint: '#7a7c72', tough: 1.5, dropBias: 'ingot' },
      /* 后备：老存档里的 tplId 仍按 WorldBeasts 线条绘制渲染；不再随机刷新 */
      { id: 'wolf', name: '妖兽 · 灰狼', minLevel: 1, noSpawn: true, skills: { regular: 0.6, pounce: 0.3, howl: 0.1 }, actions: { regular: 'attack', pounce: 'charge', howl: 'cast' }, tint: '#5e6d57', dropBias: 'potion' },
      /* 人形对手：不参与地图随机刷新（noSpawn），只在玩家主动拔刀时作为敌人出现。
       * 名字由调用方覆盖（散修、掌柜、店主…），所以这里的 name 只是兜底。 */
      { id: 'human', name: '对手', minLevel: 1, humanoid: true, noSpawn: true, skills: { regular: 0.55, pounce: 0.35, howl: 0.1 }, actions: { regular: 'thrust', pounce: 'charge', howl: 'cast' }, tint: '#6b5140', dropBias: 'ingot' },
    ],
    monsterFor(level) {
      const pool = this.BESTIARY.filter(b => b.minLevel <= Math.max(1, level + 1));
      const tpl = pool[Math.floor(Math.random() * pool.length)];
      const s = this.statsFor(Math.max(1, level + (Math.random() < 0.3 ? 1 : 0)), false);
      if (tpl.tough) s.maxHP = Math.round(s.maxHP * tpl.tough);
      return Object.assign({ tplId: tpl.id, name: tpl.name, hp: s.maxHP, tint: tpl.tint, skills: tpl.skills, actions: tpl.actions, dropBias: tpl.dropBias, buffs: [] }, s);
    },
    /* 按模板造一只指定等级的怪：地图遭遇面板与战斗页共用同一只，消灭等级不一致（评审缺陷 4） */
    monsterFromTpl(tplId, level) {
      const tpl = this.BESTIARY.find(b => b.id === tplId) || this.BESTIARY[0];
      const s = this.statsFor(Math.max(1, level || 1), false);
      if (tpl.tough) s.maxHP = Math.round(s.maxHP * tpl.tough);
      return Object.assign({ tplId: tpl.id, name: tpl.name, hp: s.maxHP, tint: tpl.tint, skills: tpl.skills, actions: tpl.actions, dropBias: tpl.dropBias, buffs: [] }, s);
    },

    /* ---- 区域定级 ----
     * 原先怪物等级 = 玩家等级 + 0~1，永远势均力敌：升到 Lv10 打 Lv10 和 Lv1 打 Lv1
     * 难度一样，成长感被 treadmill 抵消（GAMEPLAY-REVIEW「成长感的隐形杀手」）。
     * 改成区域固定等级带：玩家可以回低区碾压，也可以越级进深山。 */
    ZONES: [
      { id: 'village', name: '村口', minLv: 1, maxLv: 3,  cx: 320, cy: 560, r: 220 },
      { id: 'road',    name: '山道', minLv: 4, maxLv: 8,  cx: 780, cy: 430, r: 250 },
      { id: 'deep',    name: '深山', minLv: 9, maxLv: 14, cx: 1330, cy: 240, r: 280 },
    ],
    /* 命中的区域里取「相对最靠中心」的那个（区域之间允许重叠） */
    zoneAt(x, y) {
      let best = null, bestK = Infinity;
      for (const z of this.ZONES) {
        const d = Math.hypot(x - z.cx, y - z.cy);
        if (d <= z.r) { const k = d / z.r; if (k < bestK) { bestK = k; best = z; } }
      }
      return best;
    },
    levelInZone(zone) {
      if (!zone) return null;
      return zone.minLv + Math.floor(Math.random() * (zone.maxLv - zone.minLv + 1));
    },
    /* 该区域可能出现的模板（按 minLevel 过滤，深山才会出石魔；noSpawn 的只作主动战斗用） */
    templatesForZone(zone) {
      const hi = zone ? zone.maxLv : 99;
      const pool = this.BESTIARY.filter(b => b.minLevel <= hi && !b.noSpawn && (!b.zone || !zone || b.zone === zone.id));
      return pool.length ? pool : [this.BESTIARY[0]];
    },

    /* ---- 回合制战斗核心（hedra 风格：返回结构化日志段） ---- */
    createBattle(player, enemy) {
      const b = {
        round: 0, log: [], over: false, win: null,
        p: Object.assign({}, player, { isPlayer: true, guarding: false, staggers: 0, speedBuff: 0 }),
        e: Object.assign({}, enemy, { isPlayer: false, guarding: false, staggers: 0, atkBuffUntil: 0, speedBuff: 0 }),
        _pending: null,
      };
      b.pushLog = segs => { b.log.push(segs); if (b.log.length > 60) b.log.shift(); return segs; };
      /* 有效速度 = 速度 + 增益 - 迟滞惩罚（迟滞由重击产生，会改变先手） */
      /* 有效速度 = 速度 + 增益 - 迟滞 - 冻结（冻结由技能模块挂的 bing 状态带来，会影响先手） */
      b.effSpeed = a => {
        const base = (Number(a.speed) || 0) + (a.speedBuff || 0) - (a.staggers > 0 ? RPG.STAGGER_SPEED : 0);
        const frozen = (global.WorldSkill && a.status && a.status.bing) ? Math.round((Number(a.speed) || 0) * 0.5) : 0;
        return Math.max(1, base - frozen);
      };
      b.turnOrder = () => [b.p, b.e].slice().sort((x, y) => b.effSpeed(y) - b.effSpeed(x));
      b.playerFirst = () => b.turnOrder()[0].isPlayer === true;
      b.hit = (attacker, defender, opts) => {
        const mods = [];
        if (attacker.atkBuffUntil && b.round <= attacker.atkBuffUntil) mods.push(ctx => { ctx.multiplier *= 1.2; });
        if (defender.guarding) mods.push(ctx => { ctx.multiplier *= RPG.SKILLS.guard.mitigate; });
        const r = RPG.damage({ atk: attacker.atk, }, defender, Object.assign({ modifiers: mods }, opts || {}));
        defender.hp = Math.max(0, defender.hp - r.dmg);
        return r;
      };
      b.enemyChoose = () => {
        const w = b.e.skills || { regular: 1 };
        const roll = Math.random(); let acc = 0, pick = 'regular';
        for (const k in w) { acc += w[k]; if (roll <= acc) { pick = k; break; } }
        return pick;
      };
      /* 挂迟滞（重击的代价）。用 _pendingStagger 中转：本轮挂上的惩罚从「下一轮」
       * 才开始计入有效速度，那一轮结束才清除——原先在本轮末就减掉，等于从未生效。 */
      b.addStagger = (a, n) => { a._pendingStagger = (a._pendingStagger || 0) + (n || 0); };
      /* 轮末：清防御、结算迟滞、回合 +1 */
      b.endRound = () => {
        b.p.guarding = false; b.e.guarding = false;
        b.p.staggers = b.p._pendingStagger || 0; b.p._pendingStagger = 0;
        b.e.staggers = b.e._pendingStagger || 0; b.e._pendingStagger = 0;
        b.round += 1;
      };
      return b;
    },
  };

  global.WorldRPG = RPG;
})(typeof window !== 'undefined' ? window : globalThis);
