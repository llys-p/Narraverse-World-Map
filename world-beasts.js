'use strict';
/*
 * world-beasts.js —— 火柴人线条风妖兽绘制器（战斗页专用，纯函数无状态）
 *
 * 为什么自己画：SandboxDrawingKit 的生物是填色卡通风，与火柴人引擎的线条小人同屏冲突
 * （用户实测反馈）；而战斗需要挥扑/受击/倒地动画，kit 人形只有 idle/guard/cast 三姿态。
 * 本模块用与火柴人相同的笔画语言（单色描边、圆头线条、极简几何）画妖兽，
 * 动作状态机与引擎动作语义对齐（idle/attack/hurt/howl/dead）。
 * kit 保留它擅长的：物品/装备图标、技能特效、设施场景。
 *
 * 用法：WorldBeasts.draw(ctx, {species, x, y, scale, facing, phase, action, tint})
 *   x,y = 落地点（脚底）；facing: 'left'|'right'；phase: 秒；action: idle|attack|hurt|howl|dead
 */
(function (global) {
  'use strict';
  const SPECIES = {
    wolf:  { lw: 4, top: 62, belly: 34, chest: -34, hip: 30, neck: 22, headR: 14, tail: 'bush', ears: 'point', swing: 10 },
    golem: { lw: 6, top: 72, belly: 28, chest: -26, hip: 22, neck: 6,  headR: 11, tail: 'none', ears: 'horn',  swing: 4, bulky: true },
  };

  function draw(ctx, cfg) {
    const S = SPECIES[cfg.species] || SPECIES.wolf;
    const f = cfg.facing === 'left' ? 1 : -1;        /* f=1 时头在 -x（画面左）；'left' 即面向左 */
    const t = cfg.phase || 0;
    const act = cfg.action || 'idle';
    const lw = S.lw * (cfg.scale || 1);
    ctx.save();
    ctx.translate(cfg.x || 0, cfg.y || 0);
    ctx.scale(cfg.scale || 1, cfg.scale || 1);
    ctx.strokeStyle = cfg.tint || '#5e6d57';
    ctx.fillStyle = cfg.tint || '#5e6d57';
    ctx.lineWidth = S.lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    /* 姿态参数 */
    let lift = 0, lunge = 0, jerk = 0, headUp = 0, lying = false, eyeShut = false;
    if (act === 'idle') lift = 1.5 * Math.sin(t * 2);
    if (act === 'attack') { lunge = -16; headUp = 0.28; }
    if (act === 'hurt') { jerk = 9; eyeShut = true; }
    if (act === 'howl') { headUp = -0.55; }
    if (act === 'dead') { lying = true; eyeShut = true; }
    ctx.translate(jerk * -f * -1 * f, 0);            /* 受击向后仰（f 无关的屏幕位移） */
    if (act === 'hurt') ctx.translate(10, 0);
    ctx.translate(lunge * f, 0);

    if (lying) { drawDead(ctx, f, S, t); ctx.restore(); return; }

    const topY = -S.top + lift, bellyY = -S.belly + lift * 0.5;

    /* 腿（前后各两条，双段线：髋→膝→爪），行进/站定都有微摆 */
    const hips = [S.chest + 5, S.chest - 4, S.hip - 4, S.hip + 6];
    ctx.lineWidth = S.lw * 0.8;
    hips.forEach((hx, i) => {
      const sw = Math.sin(t * 3 + i * 1.7) * (act === 'attack' ? S.swing * 1.6 : 2.5) * (i < 2 ? 1 : -1) * f;
      const kx = hx * f + sw * 0.45, fx = hx * f + sw;
      ctx.beginPath();
      ctx.moveTo(hx * f, bellyY);
      ctx.lineTo(kx, bellyY / 2 + 3);
      ctx.lineTo(fx, 0);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx - f * 5, 0); ctx.stroke(); /* 爪尖 */
    });

    /* 躯干：脊线 + 腹线 + 前后端竖线（开放式线稿体腔） */
    ctx.lineWidth = S.lw;
    ctx.beginPath();
    ctx.moveTo(S.chest * f, topY);
    ctx.quadraticCurveTo(0, topY - 5 - lift * 0.4, S.hip * f, topY + 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo((S.chest + 3) * f, bellyY);
    ctx.lineTo((S.hip - 2) * f, bellyY);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(S.chest * f, topY); ctx.lineTo((S.chest + 3) * f, bellyY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(S.hip * f, topY + 1); ctx.lineTo((S.hip - 2) * f, bellyY); ctx.stroke();

    /* 颈 + 头（howl 时抬头张口） */
    const hx = (S.chest - S.neck) * f, hy = topY - 10 + headUp * 26;
    ctx.beginPath(); ctx.moveTo(S.chest * f, topY); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, S.headR, 0, Math.PI * 2); ctx.stroke();
    /* 吻部 */
    ctx.beginPath(); ctx.moveTo(hx - f * S.headR * 0.8, hy - 2); ctx.lineTo(hx - f * (S.headR + 9), hy + (act === 'howl' ? -10 : 3)); ctx.stroke();
    if (act === 'howl') { ctx.beginPath(); ctx.moveTo(hx - f * (S.headR + 9), hy - 10); ctx.lineTo(hx - f * S.headR * 0.8, hy + 4); ctx.stroke(); }
    /* 耳/角 */
    if (S.ears === 'point') {
      ctx.beginPath(); ctx.moveTo(hx + f * 2, hy - S.headR); ctx.lineTo(hx + f * 5, hy - S.headR - 9); ctx.lineTo(hx + f * 8, hy - S.headR + 1); ctx.stroke();
    } else if (S.ears === 'horn') {
      ctx.beginPath(); ctx.moveTo(hx + f * 3, hy - S.headR); ctx.quadraticCurveTo(hx + f * 9, hy - S.headR - 12, hx + f * 3, hy - S.headR - 14); ctx.stroke();
    }
    /* 眼 */
    if (!eyeShut) { ctx.beginPath(); ctx.arc(hx - f * 4, hy - 3, 1.8, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(hx - f * 7, hy - 3); ctx.lineTo(hx - f * 2, hy - 3); ctx.stroke(); }

    /* 尾 */
    if (S.tail === 'bush') {
      const wag = Math.sin(t * 2.5) * 6;
      ctx.beginPath();
      ctx.moveTo(S.hip * f, topY + 2);
      ctx.quadraticCurveTo((S.hip + 22) * f, topY - 12, (S.hip + 38) * f, topY - 18 + wag);
      ctx.stroke();
    }

    /* golem 附加：躯干岩纹 */
    if (S.bulky) {
      ctx.lineWidth = S.lw * 0.5;
      ctx.beginPath(); ctx.moveTo(0, topY + 4); ctx.lineTo(4 * f, bellyY - 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-14 * f, topY + 8); ctx.lineTo(-10 * f, bellyY - 8); ctx.stroke();
    }
    ctx.restore();
  }

  /* 倒地：身体贴地横陈、腿折叠、闭眼 */
  function drawDead(ctx, f, S, t) {
    const y = -S.lw;
    ctx.beginPath();
    ctx.moveTo(S.chest * f - 8, y);
    ctx.quadraticCurveTo(0, y - 10, S.hip * f + 8, y - 2);
    ctx.stroke();
    /* 头侧地 */
    const hx = (S.chest - S.neck - 8) * f, hy = y - 2;
    ctx.beginPath(); ctx.arc(hx, hy, S.headR * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx - f * 6, hy + 2); ctx.lineTo(hx - f * 1, hy + 2); ctx.stroke();
    /* 折叠的腿 */
    ctx.lineWidth = S.lw * 0.8;
    [S.chest + 4, S.hip - 2].forEach(bx => {
      ctx.beginPath(); ctx.moveTo(bx * f, y); ctx.lineTo(bx * f + 6 * f, y - 10); ctx.lineTo(bx * f + 12 * f, y - 1); ctx.stroke();
    });
    /* 尾巴平摊 */
    if (S.tail === 'bush') { ctx.beginPath(); ctx.moveTo(S.hip * f + 8, y - 2); ctx.lineTo(S.hip * f + 42, y - 4); ctx.stroke(); }
  }

  global.WorldBeasts = { draw, SPECIES };
})(typeof window !== 'undefined' ? window : globalThis);
