'use strict';
/*
 * world-skill.js —— 日式 RPG 风格的技能/属性/状态系统（纯 JS 无依赖，地图/战斗/面板共用）
 *
 * 方向依据（用户 2026-10-06 要求「先往日式 RPG 那个方向」），取的是 JRPG 的几条硬骨：
 *   - 指令式菜单 + 具名技能：《勇者斗恶龙》《最终幻想》式 Commands（たたかう／じゅもん／ぼうぎょ）
 *     ——原实现只有「普通攻击/重击/防御/遁走」四个匿名按钮，既不叫得出名字也没有成长。
 *   - 属性相克 + 「效果拔群！」：日式 RPG 的核心战斗语言（《女神异闻录》weakness 提示），
 *     怪物带 weak/resist，打中弱点收益明显，选择才有意义。
 *   - MP 消耗 + 按等级习得：技能是「资源」也是「成长凭证」（FF 的技能习得、DQ 的咒语习得）。
 *     本项目的真元（qi）直接当 MP 用，不引入第二套资源。
 *   - 异常状态（毒/灼/冻/麻）：让每个技能有各自的分工，而不是同一套倍率换个数字。
 *
 * 刻意不做的（下一轮候选，避免本轮失控）：ATB 时间槽、Limit/奥义槽、召唤兽、角色池与队伍编成。
 *
 * 与本仓库其它模块的关系：
 *   - 伤害公式仍走 WorldRPG.damage（hedra 风格的 baseValue × multiplier × 减伤比值），
 *     本模块只往它的 modifiers 里添三条规则（属性倍率、破防、冻结易伤），不另起一套。
 *   - MP 就是 WorldRPG 的真元（qi），payMp 复用 WorldRPG.payQi 的夹紧语义。
 *   - 结算返回「结构化战报段」（hedra CombatLog 风格），由页面负责排版。
 */
(function (global) {
  'use strict';

  const R = () => global.WorldRPG;
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  /* ---------------- 属性 ---------------- */
  const ELEMENTS = {
    none: { id: 'none', name: '无', color: '#d8dcd4', flow: 'jianqi' },
    zhan: { id: 'zhan', name: '斩', color: '#e6ecff', flow: 'jianqi' },
    huo: { id: 'huo', name: '火', color: '#ff8b3d', flow: 'huoqiu' },
    bing: { id: 'bing', name: '冰', color: '#8fd0f0', flow: 'bingci' },
    lei: { id: 'lei', name: '雷', color: '#ffe066', flow: 'leiji' },
    feng: { id: 'feng', name: '风', color: '#8fe0c4', flow: 'fengren' },
    guang: { id: 'guang', name: '光', color: '#fff0b8', flow: 'foguang' },
    an: { id: 'an', name: '暗', color: '#b98ad8', flow: 'moyan' },
  };

  /* ---------------- 异常状态 ---------------- */
  const STATUS = {
    du: { id: 'du', name: '中毒', color: '#8ac060', desc: '每轮末损失 8% 最大气血', dot: 0.08, dotIgnoreDef: true },
    zhuo: { id: 'zhuo', name: '灼烧', color: '#ff9a4a', desc: '每轮末损失 12% 最大气血', dot: 0.12, dotIgnoreDef: true },
    bing: { id: 'bing', name: '冻结', color: '#8fd0f0', desc: '速度减半，受击更重', speedMul: 0.5, takenMul: 1.2 },
    ma: { id: 'ma', name: '麻痹', color: '#ffe066', desc: '有概率无法行动', skipChance: 0.3 },
  };

  /* ---------------- 技能表 ----------------
   * mp 为消耗（真元）；power 是 WorldRPG.damage 的 multiplier；hits 段数；
   * acc 命中率；learnAt 习得等级；flow 决定走哪个 Particle 轨迹；
   * heal/rate 为自身回复比例；status 为附带异常；buffs 给自己挂的状态。
   * target: 'enemy' | 'self'
   */
  const SKILLS = [
    { id: 'zhanji', name: '斩击', elem: 'zhan', mp: 0, power: 1.0, acc: 1.0, hits: 1, target: 'enemy', flow: 'jianqi', learnAt: 1, desc: '最基础的挥砍。不耗真元，稳定但有发力的余地。' },
    { id: 'fangyu', name: '防御', elem: 'none', mp: 0, power: 0, acc: 1, hits: 0, target: 'self', flow: 'huguang', learnAt: 1, heal: 3, mpGain: 4, mitigate: 0.45, desc: '本回合受伤减 45%，回复少量气血并调息回真元。' },
    { id: 'lizhan', name: '力斩', elem: 'zhan', mp: 5, power: 1.8, acc: 0.8, hits: 1, target: 'enemy', flow: 'jianqi', learnAt: 1, stagger: 1, desc: '倾力一击。代价是用力过猛、下一轮行动迟缓（迟滞）。' },
    { id: 'huoyan', name: '火球术', elem: 'huo', mp: 8, power: 1.5, acc: 0.95, hits: 1, target: 'enemy', flow: 'huoqiu', learnAt: 3, desc: '掌心聚火掷出。命中后有较高几率造成灼烧。', status: { id: 'zhuo', chance: 0.4, turns: 2 } },
    { id: 'liaoshang', name: '回春术', elem: 'guang', mp: 10, power: 0, acc: 1, hits: 0, target: 'self', flow: 'zhiliao', learnAt: 4, healRate: 0.35, desc: '回复三成半的气血。危急时比硬拼更划算。' },
    { id: 'bingci', name: '冰刺术', elem: 'bing', mp: 8, power: 1.4, acc: 0.9, hits: 1, target: 'enemy', flow: 'bingci', learnAt: 5, desc: '地面凝出冰刺。有几率冻住对手，让它行动迟缓。', status: { id: 'bing', chance: 0.35, turns: 2 } },
    { id: 'duzhang', name: '毒掌', elem: 'an', mp: 9, power: 1.0, acc: 0.9, hits: 1, target: 'enemy', flow: 'moyan', learnAt: 6, desc: '阴毒掌力。伤害不高，但毒发之后每轮都在流血。', status: { id: 'du', chance: 0.6, turns: 3 } },
    { id: 'leizhou', name: '掌心雷', elem: 'lei', mp: 12, power: 0.85, acc: 0.85, hits: 3, target: 'enemy', flow: 'leiji', learnAt: 8, desc: '三段雷落，每段单独判定。对怕雷的东西尤其有效。' },
    { id: 'fengren', name: '风刃', elem: 'feng', mp: 7, power: 0.62, acc: 0.92, hits: 3, target: 'enemy', flow: 'fengren', learnAt: 10, desc: '三道高速风刃。低耗、段数多，适合削抗打得动的对手。' },
    { id: 'jianqizhan', name: '剑气斩', elem: 'zhan', mp: 14, power: 2.0, acc: 0.9, hits: 1, target: 'enemy', flow: 'jianqi', learnAt: 12, pierce: 0.35, desc: '一线剑气破空而出，无视三成半防御。' },
    { id: 'wanjianjue', name: '万剑诀', elem: 'zhan', mp: 22, power: 0.58, acc: 0.85, hits: 5, target: 'enemy', flow: 'jianyu', learnAt: 15, desc: '剑雨倾泻。五段伤害，命中不稳但打满相当可观。' },
    { id: 'leishen', name: '雷神降临', elem: 'lei', mp: 30, power: 2.6, acc: 0.75, hits: 1, target: 'enemy', flow: 'leiji', learnAt: 20, desc: '召来落雷劈下。孤注一掷的一击，miss 会很痛。' },
  ];

  const BY_ID = {};
  SKILLS.forEach(s => { BY_ID[s.id] = s; });

  /* ---------------- 属性相克 ----------------
   * 日式 RPG 只留三档，档多了玩家记不住：
   *   弱点 ×1.6（效果拔群） / 平常 ×1.0 / 耐性 ×0.55（效果不佳）
   */
  function elementRate(elem, target) {
    if (!elem || elem === 'none') return { rate: 1, label: '' };
    const weak = (target && target.weak) || [];
    const resist = (target && target.resist) || [];
    if (weak.indexOf(elem) >= 0) return { rate: 1.6, label: '效果拔群！' };
    if (resist.indexOf(elem) >= 0) return { rate: 0.55, label: '效果不佳……' };
    return { rate: 1, label: '' };
  }

  /* 怪物的属性标签按模板 id 配。放在技能模块里而不是图鉴里，是为了不为「属性」这个
   * 技能侧的关注点去改 BESTIARY 的数据形状（也避免和并行开发的图鉴改动撞车）。
   * 新增怪物时在这里补一行即可；未登记的按「无弱点无抗性」处理。 */
  const MONSTER_TAGS = {
    wild_dog: { elem: 'none', weak: ['huo'], resist: ['bing'] },
    boar_piglet: { elem: 'none', weak: ['lei'], resist: ['feng'] },
    bamboo_snake: { elem: 'none', weak: ['bing'], resist: ['huo'] },
    black_bear: { elem: 'none', weak: ['huo'], resist: ['zhan'] },
    giant_python: { elem: 'none', weak: ['bing'], resist: ['feng'] },
    shadow_wolf: { elem: 'an', weak: ['guang'], resist: ['an'] },
    rock_golem: { elem: 'none', weak: ['lei'], resist: ['zhan', 'feng'] },
    wolf: { elem: 'none', weak: ['huo'], resist: ['bing'] },      // 老存档 tplId
    bandit: { elem: 'zhan', weak: ['guang'], resist: ['an'] },
    golem: { elem: 'none', weak: ['lei'], resist: ['zhan', 'feng'] },
    human: { elem: 'zhan', weak: ['bing'], resist: ['guang'] },   // 场景里的人形对手
  };
  function tagsFor(tplId) {
    return MONSTER_TAGS[tplId] || { elem: 'none', weak: [], resist: [] };
  }

  /* ---------------- 习得 ---------------- */
  function known(level) {
    const lv = Math.max(1, level | 0);
    return SKILLS.filter(s => s.learnAt <= lv);
  }
  /* 从 fromLevel 升到 toLevel 之间新学到的（升级结算时用来报「习得」） */
  function newLearned(fromLevel, toLevel) {
    const a = Math.max(1, fromLevel | 0), b = Math.max(a, toLevel | 0);
    return SKILLS.filter(s => s.learnAt > a && s.learnAt <= b);
  }

  function canPay(actor, sk) { return (Number(actor.qi) || 0) >= (sk.mp || 0); }
  function payMp(actor, sk) {
    const cost = sk.mp || 0;
    actor.qi = clamp((Number(actor.qi) || 0) - cost, 0, Number(actor.maxQi) || 0);
    return cost;
  }

  /* ---------------- 状态辅助 ---------------- */
  function hasStatus(side, id) { return !!(side.status && side.status[id] && side.status[id].turns > 0); }
  function applyStatus(side, id, turns) {
    if (!side.status) side.status = {};
    const cur = side.status[id];
    side.status[id] = { turns: Math.max(turns || 2, cur ? cur.turns : 0) };
    return STATUS[id];
  }
  function clearStatus(side, id) { if (side.status) delete side.status[id]; }

  /* 冻结减速要参与先手判定：effSpeed 里额外扣一半 */
  function speedOf(b, side) {
    const base = Number(side.speed) || 0;
    const buff = side.speedBuff || 0;
    const stagger = side.staggers > 0 ? (R() ? R().STAGGER_SPEED : 8) : 0;
    const frozen = hasStatus(side, 'bing') ? Math.round(base * (1 - STATUS.bing.speedMul)) : 0;
    return Math.max(1, base + buff - stagger - frozen);
  }
  /* 麻痹：抽一次要不要失手 */
  function willSkip(side) {
    return hasStatus(side, 'ma') && Math.random() < STATUS.ma.skipChance;
  }
  function takenMultiplier(defender, elem) {
    let m = 1;
    if (hasStatus(defender, 'bing')) m *= STATUS.bing.takenMul;
    return m;
  }

  /* 单段命中：多段技要一段一段地飞、一段一段地飘数字，所以把单段抽出来。
   * MP 由调用方在循环外一次性支付（resolve 内部才自己付），这里不再动真元。 */
  function resolveHit(battle, attacker, defender, sk, opts) {
    const o = opts || {};
    const RPG = R();
    const out = { miss: false, dmg: 0, crit: false, status: null };
    if (!sk || !attacker || !defender) return out;
    if (Math.random() >= (sk.acc == null ? 1 : sk.acc)) { out.miss = true; return out; }
    const rate = o.rate || elementRate(sk.elem, defender);
    const mods = [];
    if (rate.rate !== 1) mods.push(c => { c.multiplier *= rate.rate; });
    const takeMul = takenMultiplier(defender, sk.elem);
    if (takeMul !== 1) mods.push(c => { c.multiplier *= takeMul; });
    if (defender.guarding) mods.push(c => { c.multiplier *= (sk.elem !== 'none' ? 0.6 : 0.45); });
    if (sk.critBonus) mods.push(c => { if (Math.random() < sk.critBonus) c.crit = true; });
    let target = defender;
    if (sk.pierce) target = Object.assign({}, defender, { def: Math.round((Number(defender.def) || 0) * (1 - sk.pierce)) });
    const r = RPG.damage({ atk: attacker.atk }, target, { multiplier: sk.power || 1, modifiers: mods });
    out.dmg = r.dmg; out.crit = !!r.crit;
    if (o.apply !== false) defender.hp = Math.max(0, defender.hp - r.dmg);
    return out;
  }

  /* ---------------- 结算 ----------------
   * 返回结构化战报（hedra CombatLog 风格）：页面只负责排版，不再自己算数。
   * opts: {apply:false} 只算不下真 hp（用于面板预览/伤害估算）
   */
  function resolve(battle, attacker, defender, sk, opts) {
    const o = opts || {};
    const RPG = R();
    const out = { skill: sk, hits: [], total: 0, crits: 0, misses: 0, heal: 0, statuses: [], rate: null, mpSpent: 0 };
    if (!sk || !attacker || !defender) return out;

    /* 自身类：回复 / 调息 */
    if (sk.target === 'self') {
      if (o.apply !== false) payMp(attacker, sk);
      let healed = 0;
      if (sk.healRate) healed += Math.round((Number(attacker.maxHP) || 0) * sk.healRate);
      if (sk.heal) healed += sk.heal;
      if (sk.mpGain) {
        attacker.qi = clamp((Number(attacker.qi) || 0) + sk.mpGain, 0, Number(attacker.maxQi) || 0);
        out.mpSpent = -(sk.mpGain || 0);
      } else out.mpSpent = sk.mp || 0;
      if (sk.mitigate) attacker.guarding = true;   // 自身类技能不改变对手状态
      attacker.hp = Math.min(Number(attacker.maxHP) || 0, (Number(attacker.hp) || 0) + healed);
      out.heal = healed;
      return out;
    }

    if (o.apply !== false) out.mpSpent = payMp(attacker, sk);
    else out.mpSpent = sk.mp || 0;

    out.rate = elementRate(sk.elem, defender);
    const hits = Math.max(1, sk.hits || 1);
    for (let i = 0; i < hits; i++) {
      const one = resolveHit(battle, attacker, defender, sk, { rate: out.rate, apply: o.apply });
      out.hits.push(one);
      if (one.miss) { out.misses++; continue; }
      out.total += one.dmg;
      if (one.crit) out.crits++;
    }
    /* 重击类给自己挂迟滞（用 battle.addStagger 保证跨轮生效的时序） */
    if (sk.stagger && battle && battle.addStagger) battle.addStagger(attacker, sk.stagger);

    if (sk.status && Math.random() < (sk.status.chance || 0.35)) {
      const st = applyStatus(defender, sk.status.id, sk.status.turns || 2);
      out.statuses.push(st.name);
      if (o.apply === false) clearStatus(defender, sk.status.id); // 预览时不留副作用
    }
    return out;
  }

  /* ---------------- 回合末：DOT 与持续时间 ----------------
   * 返回 [log段]，由页面排版；不自己写 DOM。
   */
  function statusTick(battle) {
    const segs = [];
    [battle.p, battle.e].forEach(side => {
      if (!side.status) return;
      for (const id in side.status) {
        const st = STATUS[id]; if (!st) continue;
        if (st.dot) {
          const dmg = Math.max(1, Math.round((Number(side.maxHP) || 0) * st.dot));
          side.hp = Math.max(0, side.hp - dmg);
          segs.push([side.isPlayer ? '旅人' : '【' + side.name + '】', st.name + '发作，损失 ' + dmg + ' 点气血']);
        }
        side.status[id].turns -= 1;
        if (side.status[id].turns <= 0) {
          delete side.status[id];
          segs.push([side.isPlayer ? '旅人' : '【' + side.name + '】', st.name + '已经解除']);
        }
      }
    });
    return segs;
  }

  function statusText(side) {
    if (!side || !side.status) return '';
    return Object.keys(side.status).map(k => STATUS[k] ? STATUS[k].name + '(' + side.status[k].turns + ')' : '').filter(Boolean).join('、');
  }

  global.WorldSkill = {
    ELEMENTS, STATUS, SKILLS,
    get: id => BY_ID[id],
    elementRate, tagsFor, known, newLearned, canPay, payMp,
    resolveHit, resolve, statusTick, statusText,
    hasStatus, applyStatus, clearStatus, speedOf, willSkip, takenMultiplier,
  };
})(typeof window !== 'undefined' ? window : globalThis);
