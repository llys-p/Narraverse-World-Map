'use strict';
/*
 * world-inv.js —— 物品 / 背包 / 装备 / 商店模块（地图、战斗、个人面板、商店页共用）
 *
 * 设计出处（调研 2026-10-06，不重新造轮子）：
 * - 装备 schema 采纳 trial-tower/hedra-engine（MIT）的 Equip 模型：
 *   { slot（部位）, required.level, atk/defModifier {add} } → 本模块记为
 *   { slot, req, mods:{atk,def,speed,hp,qi} }，聚合方式同为“加法修饰”。
 * - 槽位模型采用经典 RPG 三槽（weapon/armor/accessory）+ 可堆叠消耗品；
 *   GitHub 上没有能直接复用的 vanilla-JS 独立背包库（搜索结果以 Unity/Godot 为主，
 *   RPGJS 为整体框架），UI 属于宿主胶水层，图标全部由 SandboxDrawingKit 绘制。
 * - 图标：kit 组件 id（sword/potion/ring/yuandun/changjian/pifeng/douli/ingot/bread…）。
 * - 存档：并入 WorldRPG 档案（profile.bag / profile.gear）。
 *
 * 2026-10-06 修订（依据评审）：
 * - totals() 增加 qi 聚合；使用消耗品时的回血上限改用 totals().hp——原先卡在
 *   profile.maxHP，装备的 +hp 永远吃不到（评审缺陷 3）。
 * - 新增 buy()：铜币此前只有进项没有出口，经济是单向的（GAMEPLAY 断点三）。
 * - dropRoll 第二参数从「怪物名（从未被使用）」改成 bias（怪物模板的倾向掉落），
 *   总掉率由 96% 降到 72%。
 * - remove() 对非堆叠物品传 count>1 时原先只删一个，现按数量逐个删。
 */
(function (global) {
  'use strict';
  const INV = {};

  /* ---- 物品目录：schema 采纳 hedra Equip（slot/req/mods）；icon = SandboxDrawingKit 组件 ---- */
  INV.CATALOG = {
    sword:     { id:'sword',     name:'铁剑',   slot:'weapon',    mods:{atk:2},           req:1, icon:'sword',     price:30 },
    changjian: { id:'changjian', name:'精钢长剑', slot:'weapon',   mods:{atk:4},           req:4, icon:'changjian', price:110 },
    gong:      { id:'gong',      name:'猎弓',   slot:'weapon',    mods:{atk:3,speed:2},   req:3, icon:'gong',      price:95 },
    fazhang:   { id:'fazhang',   name:'桃木法杖', slot:'weapon',   mods:{atk:3,hp:6,qi:4}, req:3, icon:'fazhang',   price:100 },
    yuandun:   { id:'yuandun',   name:'圆盾',   slot:'armor',     mods:{def:3},           req:2, icon:'yuandun',   price:70 },
    pifeng:    { id:'pifeng',    name:'夜行披风', slot:'armor',    mods:{def:1,speed:3},   req:2, icon:'pifeng',    price:60 },
    gangkui:   { id:'gangkui',   name:'铁盔',   slot:'armor',     mods:{def:2,hp:4},      req:3, icon:'gangkui',   price:85 },
    douli:     { id:'douli',     name:'斗笠',   slot:'accessory', mods:{def:1,speed:1},   req:1, icon:'douli',     price:25 },
    guanghuan: { id:'guanghuan', name:'碧玉光环', slot:'accessory', mods:{atk:1,def:1,hp:6,qi:6},req:5, icon:'guanghuan', price:150 },
    potion:    { id:'potion',    name:'疗伤药',  kind:'consumable', effect:{heal:10}, stack:true, icon:'potion', price:18 },
    bread:     { id:'bread',     name:'干粮',   kind:'consumable', effect:{heal:5},  stack:true, icon:'bread',  price:8 },
    ingot:     { id:'ingot',     name:'铁锭',   kind:'material',  sell:14, stack:true, icon:'ingot', price:14 },
  };

  INV.SLOTS = ['weapon', 'armor', 'accessory'];
  INV.SLOT_ZH = { weapon: '武器', armor: '防具', accessory: '饰品' };

  /* 掉落表：按玩家等级加权；bias 为怪物模板的倾向掉落（灰狼偏向药、山贼偏向材料）
   * 总掉率约 72%（原 96% 过高，三场必出装备） */
  INV.dropRoll = (profile, bias) => {
    const roll = Math.random();
    const first = (bias && INV.CATALOG[bias]) ? bias : 'potion';
    if (roll < 0.26) return { id: first, count: 1 };
    if (roll < 0.38) return { id: 'bread', count: 1 };
    if (roll < 0.46) return { id: 'ingot', count: 1 + Math.floor(Math.random() * 2) };
    if (roll < 0.54) return { id: 'sword', count: 1 };
    if (roll < 0.62 && profile.level >= 2) return { id: 'yuandun', count: 1 };
    if (roll < 0.68 && profile.level >= 3) return { id: profile.level >= 5 ? 'changjian' : 'gong', count: 1 };
    if (roll < 0.72 && profile.level >= 5) return { id: 'guanghuan', count: 1 };
    return null;
  };

  /* ---- 背包/装备操作（直接改 profile 并落盘） ---- */
  INV.ensure = p => { if (!p.bag) p.bag = []; if (!p.gear) p.gear = { weapon: null, armor: null, accessory: null }; return p; };

  INV.add = (p, id, count) => {
    INV.ensure(p);
    const item = INV.CATALOG[id];
    if (!item) return false;
    const n = Math.max(1, Math.round(count || 1));
    if (item.stack) {
      const slot = p.bag.find(s => s.id === id);
      if (slot) slot.count += n; else p.bag.push({ id, count: n });
    } else {
      for (let i = 0; i < n; i++) p.bag.push({ id, count: 1 });
    }
    return true;
  };

  INV.remove = (p, id, count) => {
    INV.ensure(p);
    const item = INV.CATALOG[id];
    if (!item) return false;
    const n = Math.max(1, Math.round(count || 1));
    if (item.stack) {
      const idx = p.bag.findIndex(s => s.id === id);
      if (idx < 0) return false;
      p.bag[idx].count -= n;
      if (p.bag[idx].count <= 0) p.bag.splice(idx, 1);
      return true;
    }
    /* 非堆叠：原先传 count>1 只删一个，现按数量逐个删 */
    let removed = 0;
    for (let i = 0; i < n; i++) {
      const idx = p.bag.findIndex(s => s.id === id);
      if (idx < 0) break;
      p.bag.splice(idx, 1); removed++;
    }
    return removed > 0;
  };

  INV.countOf = (p, id) => INV.ensure(p).bag.filter(s => s.id === id).reduce((n, s) => n + s.count, 0);

  INV.equip = (p, id) => {
    INV.ensure(p);
    const item = INV.CATALOG[id];
    if (!item || !item.slot) return { ok: false, why: '不可装备' };
    if ((item.req || 1) > p.level) return { ok: false, why: '需要等级 ' + item.req };
    if (!INV.remove(p, id, 1)) return { ok: false, why: '背包中没有' };
    const old = p.gear[item.slot];
    p.gear[item.slot] = id;
    if (old) INV.add(p, old, 1);
    return { ok: true };
  };

  INV.unequip = (p, slot) => {
    INV.ensure(p);
    const cur = p.gear[slot];
    if (!cur) return { ok: false, why: '空槽' };
    p.gear[slot] = null;
    INV.add(p, cur, 1);
    return { ok: true };
  };

  /* 使用消耗品：回血上限按聚合后的 totals().hp，装备的 +hp 才真的能用上 */
  INV.use = (p, id) => {
    INV.ensure(p);
    const item = INV.CATALOG[id];
    if (!item || item.kind !== 'consumable') return { ok: false, why: '不可使用' };
    if (!INV.remove(p, id, 1)) return { ok: false, why: '没有了' };
    const heal = (item.effect && item.effect.heal) || 0;
    const cap = INV.totals(p).hp;
    const before = Math.min(p.hp, cap);
    p.hp = Math.min(cap, p.hp + heal);
    return { ok: true, healed: Math.round(p.hp - before), cap: cap };
  };

  INV.sell = (p, id) => {
    INV.ensure(p);
    const item = INV.CATALOG[id];
    if (!item) return { ok: false, why: '没有此物' };
    if (!INV.remove(p, id, 1)) return { ok: false, why: '没有了' };
    const price = item.sell || Math.max(1, Math.round((item.price || 5) * 0.5));
    p.gold += price;
    return { ok: true, gold: price };
  };

  /* 购买（铜币的出口）：受等级限制，钱不够或等级不够都明确回绝 */
  INV.buy = (p, id) => {
    INV.ensure(p);
    const item = INV.CATALOG[id];
    if (!item || !item.price) return { ok: false, why: '此物不售' };
    if ((item.req || 1) > p.level) return { ok: false, why: '需要等级 ' + (item.req || 1) };
    if ((p.gold || 0) < item.price) return { ok: false, why: '铜币不足，需 ' + item.price };
    p.gold -= item.price;
    INV.add(p, id, 1);
    return { ok: true, spent: item.price };
  };

  /* 装备聚合：最终属性 = 基础 + 装备 mods（战斗/面板/商店共用） */
  INV.totals = p => {
    INV.ensure(p);
    const t = { atk: p.atk, def: p.def, speed: p.speed, hp: p.maxHP, qi: p.maxQi || 0 };
    INV.SLOTS.forEach(slot => {
      const id = p.gear[slot];
      if (!id) return;
      const item = INV.CATALOG[id];
      if (!item || !item.mods) return;
      for (const k in item.mods) { t[k] = (t[k] || 0) + item.mods[k]; }
    });
    return t;
  };

  global.WorldInv = INV;
})(typeof window !== 'undefined' ? window : globalThis);
