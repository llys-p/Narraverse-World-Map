'use strict';
/*
 * world-fx.js —— 打击感三件套（音效 / 屏震 / 顿帧），零依赖
 *
 * 为什么补这个（GAMEPLAY-REVIEW「其他一眼可见的空缺」）：战斗页此前只有伤害飘字，
 * 命中没有任何听觉与体感反馈。打击感的基本三件套是音效、顿帧、屏震，缺一个就「打上去没感觉」。
 * 音效用 WebAudio 现场合成，不引入任何音频文件（与 laya-torso-20261005 的舞蹈配乐同一套做法）。
 *
 * 用法：
 *   WorldFX.play('hit'|'crit'|'heavy'|'guard'|'hurt'|'dead'|'win'|'lose'|'levelup'|'coin')
 *   WorldFX.shake(document.querySelector('.view'), 1|2)   // 屏震强度
 *   WorldFX.freeze(90)                                    // 顿帧毫秒数
 *   WorldFX.isFrozen(now)                                 // 动画循环里判断要不要停一帧
 * 所有 API 都允许 WorldFX 不存在（调用方用 if(window.WorldFX) 守卫），页面不会因为缺它而报错。
 */
(function (global) {
  'use strict';

  let ac = null;
  let freezeUntil = 0;
  let stylesInstalled = false;

  function audio() {
    if (ac) { if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} } return ac; }
    try {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    } catch (e) { return null; }
    return ac;
  }

  function tone(o) {
    const F = global.WorldFX;
    if (F && F.muted) return;
    const a = audio(); if (!a) return;
    const t0 = a.currentTime, dur = o.dur || 0.1;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) { try { osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + dur); } catch (e) {} }
    const peak = (o.gain == null ? 0.16 : o.gain);
    g.gain.setValueAtTime(0.0001, t0);
    try {
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    } catch (e) { g.gain.value = peak; }
    osc.connect(g); g.connect(a.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  function noise(dur, gain, freq) {
    const F = global.WorldFX;
    if (F && F.muted) return;
    const a = audio(); if (!a) return;
    const n = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, n, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = a.createBufferSource(); src.buffer = buf;
    const g = a.createGain(); g.gain.value = (gain == null ? 0.10 : gain);
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900;
    src.connect(f); f.connect(g); g.connect(a.destination);
    try { src.start(); } catch (e) {}
  }

  function seq(notes, gap) {
    notes.forEach((n, i) => setTimeout(() => tone(n), i * (gap || 90)));
  }

  const FX = {
    muted: false,

    /* 音效表：命中类走「短促 + 下滑」，反馈类走琶音 */
    play(name) {
      switch (name) {
        case 'hit':   tone({ f0: 240, f1: 120, dur: 0.09, type: 'triangle', gain: 0.14 }); noise(0.05, 0.07, 1400); break;
        case 'heavy': tone({ f0: 180, f1: 70,  dur: 0.16, type: 'sawtooth', gain: 0.16 }); noise(0.10, 0.10, 700); break;
        case 'crit':  tone({ f0: 720, f1: 260, dur: 0.20, type: 'square',   gain: 0.15 }); noise(0.12, 0.12, 1800); break;
        case 'miss':  noise(0.09, 0.05, 2600); break;
        case 'guard': tone({ f0: 170, f1: 150, dur: 0.13, type: 'sine', gain: 0.12 }); noise(0.05, 0.04, 500); break;
        case 'hurt':  tone({ f0: 150, f1: 90,  dur: 0.13, type: 'sawtooth', gain: 0.13 }); break;
        case 'dead':  tone({ f0: 200, f1: 55,  dur: 0.34, type: 'sawtooth', gain: 0.15 }); break;
        case 'win':   seq([{ f0: 523, dur: 0.13, type: 'triangle' }, { f0: 659, dur: 0.13, type: 'triangle' }, { f0: 784, dur: 0.22, type: 'triangle' }], 95); break;
        case 'lose':  seq([{ f0: 330, dur: 0.20, type: 'sine' }, { f0: 196, dur: 0.36, type: 'sine' }], 150); break;
        case 'levelup': seq([{ f0: 523, dur: 0.11, type: 'square' }, { f0: 659, dur: 0.11, type: 'square' }, { f0: 880, dur: 0.11, type: 'square' }, { f0: 1046, dur: 0.24, type: 'square' }], 80); break;
        case 'coin':  seq([{ f0: 988, dur: 0.07, type: 'square' }, { f0: 1319, dur: 0.12, type: 'square' }], 60); break;
        case 'flee':  noise(0.16, 0.07, 400); break;
        default: break;
      }
    },

    /* 屏震：给容器加一次性动画 class，动画结束自动移除 */
    shake(el, intensity) {
      if (!el) return;
      FX.installStyles();
      const cls = (intensity || 1) >= 2 ? 'wbshake2' : 'wbshake1';
      el.classList.remove('wbshake1', 'wbshake2');
      /* 强制重排，让同一个动画能连续触发 */
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 260);
    },

    installStyles() {
      if (stylesInstalled || !global.document) return;
      const s = global.document.createElement('style');
      s.textContent =
        "@keyframes wbshake1{0%,100%{transform:translate(0,0)}25%{transform:translate(-3px,1px)}50%{transform:translate(2px,-1px)}75%{transform:translate(-1px,1px)}}"
        + "@keyframes wbshake2{0%,100%{transform:translate(0,0)}20%{transform:translate(-6px,3px)}40%{transform:translate(5px,-3px)}60%{transform:translate(-3px,-2px)}80%{transform:translate(3px,2px)}}"
        + ".wbshake1{animation:wbshake1 .16s linear}.wbshake2{animation:wbshake2 .24s linear}"
        + "@media (prefers-reduced-motion: reduce){.wbshake1,.wbshake2{animation:none}}";
      global.document.head.appendChild(s);
      stylesInstalled = true;
    },

    /* 顿帧：命中瞬间画面停一下，是「打实了」最廉价也最有效的信号 */
    freeze(ms) { freezeUntil = Math.max(freezeUntil, performance.now() + (ms || 80)); },
    isFrozen(now) { return now < freezeUntil; },

    /* 供页面做开关（比如用户想静音） */
    setMuted(v) { FX.muted = !!v; },
    unlock() { audio(); },
  };

  global.WorldFX = FX;
})(typeof window !== 'undefined' ? window : globalThis);
