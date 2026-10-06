'use strict';
/*
 * world-combat-fx.js —— 战斗特效层（全战场绘制，纯 Canvas 2D，无依赖）
 *
 * 为什么重开一层（用户 2026-10-06 反馈：「剑气要从左边释放到右边，现在奇怪得很」）：
 *   原先是把 kit 的特效原型画进两块贴着角色的小画布（fxP/fxE，220×146）——问题不在美术在结构：
 *   1) 特效只能在那个 220px 的小框里自娱自乐，「从剑上飞出去打到对面」物理上不可能发生；
 *   2) kit 的 jianqi 用 arc+lineTo 拼镜片形，既不朝行进方向也不带拖尾，看起来像贴纸；
 *   3) jianyu 那行 x=W*(.08+(i*1.3)%W/W) 是无效表达式（(i*1.3)%W/W 恒≈0），
 *      七把剑全挤在同一列垂直下落，压根不是「雨」。
 *   所以这一层自己做投射与粒子：出手点→命中点真的跨越整张战场，左边释放右边炸。
 *
 * 设计约束：
 *   - kit/SandboxDrawingKit 降级为「命中时的爆发贴花」，位置由命中点决定（不再固定贴脸）；
 *     kit 缺失时全部退化为内置画法，不会报错。
 *   - 坐标一律归一化：x/y ∈ [0,1] 相对战场宽高，调用方直接给角色的 x（0.3 / 0.72 之类）即可。
 *   - cast() 返回的 Promise 在命中那一刻 resolve，且**一定有超时兜底**：
 *     任何情况下都不会让 await 卡住战斗回合（这个项目的战斗历史上被一场未复位的锁死坑过）。
 *   - 尊重 prefers-reduced-motion：粒子减半、不做闪白。
 */
(function (global) {
  'use strict';

  const GROUND = 0.94;   // 地平线所在高度比例（对齐火柴人引擎的 H-18）
  const CHEST = 0.20;    // 命中点离地高度比例（胸腹处）

  let canvas = null, ctx = null, dpr = 1, W = 300, H = 300;
  let running = false, last = 0, reduced = false, flare = 0;
  /* 冲击闪光记住「打在哪」：原来是一层刷满全屏的白色 fillRect（alpha .26），
   * 深色场景下整块战场被糊成灰、命中最该亮的地方反而不亮。改成以命中点为中心的径向绽放。*/
  let flareAt = { x: .5, y: .55 }, flareColor = '#ffd28a';
  const items = [];

  /* '#f80' / '#ff8800' → 'rgba(r,g,b,a)'，径向渐变要用带 alpha 的色样 */
  const withA = (hex, a) => {
    let h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    h = (h + 'ffffff').slice(0, 6);
    const n = parseInt(h, 16) || 0xffffff;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  };

  const px = p => ({ x: p.x * W, y: p.y * H });
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const mixp = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
  const clamp01 = v => Math.max(0, Math.min(1, v));

  const FX = {
    REDUCED: false,
    ready() { return !!ctx; },

    init(el) {
      canvas = el || null;
      ctx = canvas ? canvas.getContext('2d') : null;
      dpr = Math.min(2, global.devicePixelRatio || 1);
      reduced = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
      FX.REDUCED = reduced;
      items.length = 0; flare = 0;
      FX.resize();
      if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
      return FX;
    },

    resize() {
      if (!canvas || !ctx) return FX;
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width || canvas.clientWidth || 300));
      H = Math.max(1, Math.round(r.height || canvas.clientHeight || 300));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return FX;
    },

    /* 常用锚点：'chest' 命中点 / 'ground' 脚下 / 'high' 头顶上方（雷击落点） */
    anchor(x, kind) {
      if (kind === 'ground') return { x: x, y: GROUND };
      if (kind === 'high') return { x: x, y: 0.14 };
      return { x: x, y: GROUND - CHEST };
    },

    /* 投射：真的从 from 飞到 to，命中时 resolve（并有超时兜底） */
    cast(spec) {
      const dur = Math.max(60, spec.dur || 320);
      return new Promise(resolve => {
        let done = false;
        const finish = () => { if (done) return; done = true; clearTimeout(guard); resolve(); };
        const guard = setTimeout(finish, dur + 80);
        if (!ctx) { setTimeout(finish, 30); return; }
        items.push({
          cls: 'projectile', kind: spec.kind || 'jianqi',
          from: spec.from, to: spec.to, t0: performance.now(), dur: dur,
          color: spec.color || '#e8f0ff', size: spec.size || 1,
          seed: Math.random() * 6.28, onDone: finish,
        });
      });
    },

    /* 命中爆发：在指定点炸开（内置冲击环 + 可选 kit 贴花） */
    burst(spec) {
      if (!ctx) return;
      items.push({
        cls: 'burst', kind: spec.kind || 'slash', at: spec.at || { x: .5, y: .6 },
        t0: performance.now(), dur: spec.dur || 420,
        color: spec.color || '#ffd28a', size: spec.size || 1,
        seed: Math.random() * 6.28, archetype: spec.archetype || null,
      });
      if (!reduced) {
        flareAt = spec.at || flareAt;
        flareColor = spec.color || '#ffd28a';
        flare = Math.min(1, flare + (spec.flash == null ? 0.45 : spec.flash));
      }
    },

    /* 常驻光环（增益/护体） */
    aura(spec) {
      if (!ctx) return;
      items.push({ cls: 'aura', at: spec.at, t0: performance.now(), dur: spec.dur || 700,
        color: spec.color || '#8fd4a5', size: spec.size || 1, seed: Math.random() * 6.28 });
    },

    /* 自由粒子（烟雾、余烬） */
    particles(spec) {
      if (!ctx) return;
      items.push({ cls: 'particles', at: spec.at, count: spec.count || 10, color: spec.color || '#ffb060',
        t0: performance.now(), dur: spec.dur || 520, spread: spec.spread || .06, seed: Math.random() * 6.28 });
    },

    /* 起手式：施法者身上聚气（日式 RPG 的预告），同样带超时兜底 */
    charge(spec) {
      if (!ctx) return Promise.resolve();
      const dur = Math.max(80, spec.dur || 260);
      return new Promise(resolve => {
        let done = false;
        const guard = setTimeout(() => { if (!done) { done = true; resolve(); } }, dur + 80);
        items.push({ cls: 'charge', at: spec.at, t0: performance.now(), dur: dur,
          color: spec.color || '#cfe8ff', size: spec.size || 1, seed: Math.random() * 6.28,
          onDone: () => { if (done) return; done = true; clearTimeout(guard); resolve(); } });
      });
    },

    clear() { items.length = 0; flare = 0; if (ctx) ctx.clearRect(0, 0, W, H); },
  };

  function tick(now) {
    if (!ctx) { running = false; return; }
    const dtMs = Math.min(48, now - last); last = now;
    /* 顿帧时整层冻结：短暂停顿是为了强调命中，粒子跟着一起停才有分量 */
    const frozen = !!(global.WorldFX && global.WorldFX.isFrozen && global.WorldFX.isFrozen(now));
    try { step(now, dtMs, frozen); } catch (e) { /* 绘制异常不能连累战斗 */ }
    requestAnimationFrame(tick);
  }

  function step(now, dtMs, frozen) {
    ctx.clearRect(0, 0, W, H);
    if (!frozen) flare = Math.max(0, flare - dtMs / 260);
    if (flare > 0.02) {
      ctx.save();
      /* 底光：极轻，只让整帧「沉」一下，不改变整体明暗 */
      ctx.globalAlpha = flare * 0.06;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      /* 绽放：命中点最亮，向外两段衰减到全透明 */
      const p = px(flareAt), R = Math.min(W, H) * 0.62, a = flare * (reduced ? .16 : .52);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
      g.addColorStop(0, withA('#ffffff', a));
      g.addColorStop(.28, withA(flareColor, a * .42));
      g.addColorStop(1, withA(flareColor, 0));
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const raw = (now - it.t0) / it.dur;
      if (raw >= 1) {
        if (it.onDone) { try { it.onDone(); } catch (e) { } }
        items.splice(i, 1);
        continue;
      }
      const t = clamp01(raw);
      switch (it.cls) {
        case 'projectile': drawProjectile(it, t); break;
        case 'burst': drawBurst(it, t); break;
        case 'aura': drawAura(it, t); break;
        case 'particles': drawParticles(it, t); break;
        case 'charge': drawCharge(it, t); break;
      }
    }
  }

  /* ---------------- 投射：head + 拖尾 + 沿途火星 ---------------- */
  function drawProjectile(it, t) {
    const a = px(it.from), b = px(it.to);
    const k = easeOut(t);
    const head = mixp(a, b, k);
    const dirX = (b.x - a.x) >= 0 ? 1 : -1;   // 明确左右——这就是「从左边释放到右边」的关键
    const ang = Math.atan2(b.y - a.y, (b.x - a.x) || 1);
    const S = it.size * Math.max(16, Math.min(W, H) * 0.11);

    switch (it.kind) {
      case 'jianqi': case 'fengren': {
        const n = reduced ? 2 : 4;
        for (let i = 0; i < n; i++) {
          const tk = Math.max(0, k - i * .075);
          const p = mixp(a, b, tk);
          crescent(ctx, p.x, p.y, S * (1 - i * .16), ang, dirX, it.color,
            (1 - i / n) * (1 - t * .35), it.kind === 'fengren');
        }
        sparks(ctx, head, it.seed + t * 3, reduced ? 2 : 5, it.color, 1 - t * .4, dirX);
        break;
      }
      case 'huoqiu': {
        const n = reduced ? 3 : 8;
        for (let i = n; i >= 1; i--) {
          const tk = Math.max(0, k - i * .05);
          const p = mixp(a, b, tk);
          glowDot(ctx, p.x, p.y, Math.max(1.5, S * (.62 - i * .05)),
            i > n / 2 ? '#e0703a' : '#ffd25a', (1 - i / n) * .8);
        }
        glowDot(ctx, head.x, head.y, S * .78, '#fff0b0', .95);
        sparks(ctx, head, it.seed + t * 5, reduced ? 3 : 7, '#ffb050', .9, dirX);
        break;
      }
      case 'bingci': case 'shuijian': {
        const col = it.kind === 'bingci' ? '#bfe6ff' : '#8fc4ee';
        const n = reduced ? 2 : 4;
        for (let i = 0; i < n; i++) {
          const tk = Math.max(0, k - i * .06);
          const p = mixp(a, b, tk);
          shard(ctx, p.x, p.y, S * (1 - i * .18), ang, col, (1 - i * .2) * .9);
        }
        break;
      }
      case 'leiji': {
        ctx.save();
        ctx.strokeStyle = '#fff2b0'; ctx.lineWidth = Math.max(2, S * .12); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(lerp(a.x, b.x, k), 0);
        for (let i = 1; i <= 7; i++) {
          const tk = k * (i / 7);
          const jitter = Math.sin(i * 12.9 + t * 40 + it.seed) * (1 - Math.abs(i / 7 - .5)) * S * .5;
          ctx.lineTo(lerp(a.x, b.x, tk) + jitter, lerp(0, b.y, i / 7));
        }
        ctx.stroke(); ctx.restore();
        glowDot(ctx, b.x, b.y, S * .5, '#ffe08a', t > .5 ? .6 : .25);
        break;
      }
      case 'jianyu': {
        const n = reduced ? 4 : 9;
        for (let i = 0; i < n; i++) {
          const off = i / n;
          const tk = clamp01(k * 1.25 - off * .28);
          if (tk <= 0) continue;
          const sx = lerp(a.x - W * .06, b.x + W * .06, off);
          const sy = lerp(-H * .12, b.y + H * .04, tk);
          miniSword(ctx, sx, sy, S * .7, ang + Math.PI / 2, '#cfe0f0', 1 - tk * .2);
        }
        break;
      }
      case 'moyan': {
        const n = reduced ? 2 : 5;
        for (let i = 0; i < n; i++) {
          const tk = Math.max(0, k - i * .06);
          const p = mixp(a, b, tk);
          ctx.save(); ctx.globalAlpha = (1 - i * .16) * .8;
          const h = S * (1.2 - i * .1) * (1 + Math.sin(performance.now() / 1000 * 6 + i) * .1);
          ctx.fillStyle = i % 2 ? '#5a2a6a' : '#8a3a7a';
          ctx.beginPath();
          ctx.moveTo(p.x - S * .34, p.y);
          ctx.quadraticCurveTo(p.x, p.y - h, p.x + S * .34, p.y);
          ctx.closePath(); ctx.fill(); ctx.restore();
        }
        break;
      }
      default: {
        glowDot(ctx, head.x, head.y, S * .5, it.color, 1 - t * .3);
        sparks(ctx, head, it.seed + t * 4, reduced ? 2 : 4, it.color, .8, dirX);
      }
    }
  }

  /* 月牙：垂直于路径、开口朝后方，行进方向由 dirX 决定 */
  function crescent(c, x, y, s, ang, dirX, color, alpha, outlined) {
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(dirX, 1);
    c.globalAlpha = clamp01(alpha);
    if (!outlined) {
      c.fillStyle = color;
      c.beginPath(); c.moveTo(0, -s);
      c.quadraticCurveTo(s * .62, 0, 0, s);
      c.quadraticCurveTo(s * .18, 0, 0, -s);
      c.closePath(); c.fill();
      c.globalAlpha = clamp01(alpha * .5); c.fillStyle = '#ffffff';
      c.beginPath(); c.moveTo(0, -s * .72);
      c.quadraticCurveTo(s * .4, 0, 0, s * .72);
      c.quadraticCurveTo(s * .1, 0, 0, -s * .72);
      c.closePath(); c.fill();
    } else {
      c.strokeStyle = color; c.lineWidth = Math.max(1.4, s * .16); c.lineCap = 'round';
      c.beginPath(); c.arc(0, 0, s * .8, -.9, .9); c.stroke();
      c.globalAlpha = clamp01(alpha * .6);
      c.beginPath(); c.arc(0, 0, s * .5, -.8, .8); c.stroke();
    }
    c.restore();
  }

  function shard(c, x, y, s, ang, color, alpha) {
    c.save(); c.translate(x, y); c.rotate(ang); c.globalAlpha = clamp01(alpha);
    c.fillStyle = color;
    c.beginPath(); c.moveTo(-s * .5, 0); c.lineTo(0, -s * .28); c.lineTo(s * .55, 0); c.lineTo(0, s * .28);
    c.closePath(); c.fill();
    c.globalAlpha = clamp01(alpha * .5); c.fillStyle = '#ffffff';
    c.beginPath(); c.moveTo(-s * .3, 0); c.lineTo(0, -s * .14); c.lineTo(s * .3, 0); c.closePath(); c.fill();
    c.restore();
  }

  function sparks(c, at, seed, n, color, alpha, dirX) {
    c.save(); c.globalAlpha = clamp01(alpha); c.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const a = seed + i * 2.4;
      const x = at.x + Math.cos(a) * (6 + i * 2.2) * dirX;
      const y = at.y + Math.sin(a) * (4 + i * 1.6);
      c.beginPath(); c.arc(x, y, Math.max(.8, (2 + (i % 3)) * .5), 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  function glowDot(c, x, y, r, color, alpha) {
    c.save(); c.globalAlpha = clamp01(alpha);
    c.fillStyle = color; c.beginPath(); c.arc(x, y, Math.max(.5, r * 2), 0, Math.PI * 2); c.fill();
    c.globalAlpha = clamp01(alpha * .55); c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(x, y, Math.max(.4, r), 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function miniSword(c, x, y, len, ang, color, alpha) {
    c.save(); c.translate(x, y); c.rotate(ang); c.globalAlpha = clamp01(alpha);
    c.lineJoin = 'round'; c.fillStyle = color;
    c.beginPath(); c.moveTo(0, -len); c.lineTo(len * .16, -len * .1); c.lineTo(-len * .16, -len * .1);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = Math.max(1, len * .07);
    c.beginPath(); c.moveTo(-len * .2, -len * .1); c.lineTo(len * .2, -len * .1); c.stroke();
    c.beginPath(); c.moveTo(0, -len * .1); c.lineTo(0, len * .18); c.stroke();
    c.restore();
  }

  /* ---------------- 命中爆发：冲击环 + 放射线 + 火星 +（可选）kit 贴花 ---------------- */
  function drawBurst(it, t) {
    const p = px(it.at), S = it.size * Math.max(18, Math.min(W, H) * .10);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = it.color; ctx.lineWidth = Math.max(2, S * .16 * (1 - t));
    ctx.beginPath(); ctx.arc(p.x, p.y, S * (.4 + t * 1.5), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = (1 - t) * .7;
    const n = reduced ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const a = it.seed + i * Math.PI * 2 / n;
      const r0 = S * (.4 + t * .6), r1 = S * (1.1 + t * 1.3);
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0);
      ctx.lineTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
    sparks(ctx, p, it.seed + t * 6, reduced ? 3 : 8, it.color, (1 - t) * .9, 1);
    if (it.archetype && global.SandboxDrawingKit && typeof global.SandboxDrawingKit.drawEffect === 'function') {
      const box = Math.max(60, Math.min(W, H) * .5);
      try {
        global.SandboxDrawingKit.drawEffect(ctx, { archetype: it.archetype },
          { x: p.x - box / 2, y: p.y - box / 2, width: box, height: box, phase: t });
      } catch (e) { /* kit 缺失/异常不影响战斗 */ }
    }
  }

  function drawAura(it, t) {
    const p = px(it.at), S = it.size * Math.max(16, Math.min(W, H) * .09);
    ctx.save(); ctx.globalAlpha = Math.sin((1 - t) * Math.PI) * .8;
    ctx.strokeStyle = it.color; ctx.lineWidth = Math.max(1.5, S * .08);
    for (let i = 0; i < 3; i++) {
      const rr = S * (.5 + i * .38) * (1 + t * .35);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + S * .5, rr, rr * .38, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    if (!reduced) {
      for (let i = 0; i < 4; i++) {
        const a = it.seed + i * 1.9 + t * 3;
        glowDot(ctx, p.x + Math.cos(a) * S * .5, p.y + S * .5 - t * S * 1.4, Math.max(1, S * .09), it.color, (1 - t) * .7);
      }
    }
  }

  function drawParticles(it, t) {
    const p = px(it.at);
    ctx.save(); ctx.globalAlpha = 1 - t; ctx.fillStyle = it.color;
    const n = reduced ? Math.ceil(it.count / 2) : it.count;
    for (let i = 0; i < n; i++) {
      const a = it.seed + i * (Math.PI * 2 / n);
      const sp = (it.spread || .06) * Math.min(W, H) * (.4 + t * 1.6);
      const x = p.x + Math.cos(a) * sp;
      const y = p.y + Math.sin(a) * sp * .7 - t * H * .06;
      ctx.beginPath(); ctx.arc(x, y, Math.max(.8, (1 - t) * Math.min(W, H) * .012), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawCharge(it, t) {
    const p = px(it.at), S = it.size * Math.max(16, Math.min(W, H) * .09);
    ctx.save();
    ctx.globalAlpha = clamp01(t * 1.4);
    ctx.strokeStyle = it.color; ctx.lineWidth = Math.max(1.4, S * .07);
    const rr = S * (1.6 - t * .9);
    ctx.beginPath(); ctx.arc(p.x, p.y - S * .2, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = clamp01(t * 1.2) * .6;
    ctx.beginPath(); ctx.arc(p.x, p.y - S * .2, rr * .62, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    for (let i = 0; i < (reduced ? 3 : 7); i++) {
      const a = it.seed + i * (Math.PI * 2 / 7);
      const d = S * (1.2 - t);
      glowDot(ctx, p.x + Math.cos(a) * d, p.y - S * .2 + Math.sin(a) * d,
        Math.max(1, S * .07 * (.4 + t)), it.color, .5 + t * .4);
    }
  }

  global.WorldCombatFX = FX;
})(typeof window !== 'undefined' ? window : globalThis);
