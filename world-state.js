'use strict';
/*
 * world-state.js —— 世界状态持久化（地图页 / 战斗页 / 场景页 / 商店页共用）
 *
 * 为什么要有这个模块（GAMEPLAY-REVIEW-2026-10-06.md「世界不记得你」）：
 * 原先整个项目只持久化了角色档案（world_rpg_profile_v1），地图的时辰、坐标、
 * 怪物列表全是内存变量，F5 一下世界就洗牌；场景层做过的事（打了掌柜、偷了东西）
 * 也不回写。玩家做任何事世界都不回应，沉浸感归零。
 *
 * 这一版是「上下层状态桥」的最小实现，只有一份 localStorage，不引入后端：
 *   pos        玩家坐标
 *   day/hour   时辰
 *   monsters   地图上的妖兽（含 id / 模板 / 等级 / 坐标）——打赢会被移除
 *   visited    到过哪些地点
 *   locFlags   地点级事实（如「山间客栈·掌柜已被打过」）
 *   npcMemory  NPC 级记忆（场景层写入：最后读数、互动次数、行为标签）
 *   journal    世界日志（最近 20 条，供地图页显示「世界记得什么」）
 *
 * 键名与结构刻意保持扁平，方便移植到正式版时直接换成 IndexedDB 或服务端存档。
 */
(function (global) {
  'use strict';

  const KEY = 'world_state_v1';
  const VERSION = 1;

  const HOUR_NAMES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const hourName = h => HOUR_NAMES[Math.floor(((h + 1) % 24) / 2)] + '时';

  const WS = {
    KEY,
    VERSION,
    hourName,

    fresh() {
      return {
        version: VERSION,
        day: 1, hour: 7,
        pos: { x: 140, y: 330 },
        monsters: [],
        visited: {},
        locFlags: {},
        npcMemory: {},
        journal: [],
      };
    },

    load() {
      try {
        const v = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (v && typeof v === 'object') {
          const s = Object.assign(WS.fresh(), v);
          if (!s.pos || typeof s.pos.x !== 'number') s.pos = { x: 140, y: 330 };
          if (!Array.isArray(s.monsters)) s.monsters = [];
          if (!Array.isArray(s.journal)) s.journal = [];
          if (!s.visited || typeof s.visited !== 'object') s.visited = {};
          if (!s.locFlags || typeof s.locFlags !== 'object') s.locFlags = {};
          if (!s.npcMemory || typeof s.npcMemory !== 'object') s.npcMemory = {};
          return s;
        }
      } catch (e) { /* 损坏则重置 */ }
      const f = WS.fresh(); WS.save(f); return f;
    },

    save(s) {
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* 隐身模式等 */ }
      return s;
    },

    reset() { const f = WS.fresh(); WS.save(f); return f; },

    clockText(s) { return '第 ' + s.day + ' 天 · ' + hourName(s.hour); },

    /* ---- 妖兽 ---- */
    /* 按区域生成一只：等级取自区域的固定等级带，不再跟着玩家走。
     * 传 zone 时忽略 level 参数（保留 level 仅为无区域时的兼容路径）。 */
    spawnOne(level, zone, rngPos) {
      const R = global.WorldRPG;
      if (!R) return null;
      const z = zone || null;
      const pool = z ? R.templatesForZone(z) : R.BESTIARY.filter(b => b.minLevel <= Math.max(1, (level || 1) + 1));
      const tpl = pool[Math.floor(Math.random() * pool.length)] || R.BESTIARY[0];
      const lv = z ? R.levelInZone(z) : Math.max(1, (level || 1) + (Math.random() < 0.3 ? 1 : 0));
      const m = R.monsterFromTpl(tpl.id, lv);
      let p;
      if (rngPos) p = rngPos();
      else if (z) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * z.r * 0.85;
        p = { x: Math.round(z.cx + Math.cos(a) * rr), y: Math.round(z.cy + Math.sin(a) * rr) };
      } else p = { x: 120 + Math.random() * 760, y: 110 + Math.random() * 360 };
      return {
        id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        tplId: tpl.id, name: m.name, level: m.level, maxHP: m.maxHP,
        zoneId: z ? z.id : null, x: p.x, y: p.y, dropBias: m.dropBias || null,
      };
    },

    /* 每个区域至少维持一只（区域定级后，怪物是「那片地方的」而非「玩家的影子」） */
    ensureZones(s) {
      const R = global.WorldRPG;
      if (!Array.isArray(s.monsters)) s.monsters = [];
      if (!R || !R.ZONES) return s.monsters;
      for (const z of R.ZONES) {
        const n = s.monsters.filter(m => m.zoneId === z.id).length;
        if (n < 1) {
          const m = WS.spawnOne(1, z);
          if (m) s.monsters.push(m);
        }
      }
      return s.monsters;
    },

    /* 兼容旧调用：数量不足时按玩家等级补（无区域信息时使用） */
    ensureMonsters(s, level, count) {
      const want = count || 2;
      if (!Array.isArray(s.monsters)) s.monsters = [];
      while (s.monsters.length < want) {
        const m = WS.spawnOne(level);
        if (!m) break;
        s.monsters.push(m);
      }
      return s.monsters;
    },

    removeMonster(s, id) {
      s.monsters = (s.monsters || []).filter(m => m.id !== id);
      return s.monsters;
    },

    /* ---- 地点与 NPC 记忆（场景层的回写入口） ---- */
    markVisited(s, locKey, locName) {
      if (!locKey) return;
      if (!s.visited[locKey]) {
        s.visited[locKey] = { first: WS.clockText(s), name: locName || locKey, times: 0 };
      }
      s.visited[locKey].times += 1;
      s.visited[locKey].last = WS.clockText(s);
    },

    setLocFlag(s, locKey, flag, value) {
      if (!locKey) return;
      s.locFlags[locKey] = s.locFlags[locKey] || {};
      s.locFlags[locKey][flag] = value === undefined ? true : value;
    },

    getLocFlag(s, locKey, flag) {
      const f = s.locFlags && s.locFlags[locKey];
      return f ? f[flag] : null;
    },

    /* 场景层每次与 NPC 互动后调用：记下读数和行为 */
    noteNpc(s, npcId, patch) {
      if (!npcId || npcId === 'player') return;
      const mem = s.npcMemory[npcId] || { count: 0, tags: [] };
      mem.count += 1;
      mem.last = WS.clockText(s);
      if (patch) {
        for (const k in patch) {
          if (k === 'tag') { if (mem.tags.indexOf(patch[k]) < 0) mem.tags.push(patch[k]); }
          else mem[k] = patch[k];
        }
      }
      s.npcMemory[npcId] = mem;
      return mem;
    },

    /* ---- 世界日志 ---- */
    journalAdd(s, text) {
      s.journal.push({ t: WS.clockText(s), text: String(text).slice(0, 120) });
      if (s.journal.length > 20) s.journal.shift();
      return s.journal;
    },
  };

  global.WorldState = WS;
})(typeof window !== 'undefined' ? window : globalThis);
