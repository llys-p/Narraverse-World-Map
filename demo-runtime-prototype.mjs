// Presentation extracted from the preserved demo. No local gameplay simulation.
import {createDemoClient} from './demo-runtime-bridge.mjs';
import {interactionActions,personNavigation,worldTimeView,describeActionReceipt,recordConfirmedAction,socialInteractionActions,socialActionNames} from './demo-runtime-interactions.mjs';
import {createSocialTextComposer} from './demo-social-composer.mjs';
import {createNpcDialogue} from './demo-npc-dialogue.mjs';
const npcDialogue=createNpcDialogue();
const socialTextComposer=createSocialTextComposer();
const $=id=>document.getElementById(id),K=window.SandboxDrawingKit;
const stageContainer=$('stageContainer'),sceneCanvas=$('sceneCanvas'),sceneCtx=sceneCanvas.getContext('2d');
const villageStickCanvas=$('villageStickCanvas'),villageDecorCanvas=$('villageDecorCanvas'),villageDecorCtx=villageDecorCanvas.getContext('2d');
const worldMapCanvas=$('worldMapCanvas'),worldMapCtx=worldMapCanvas.getContext('2d'),worldMiniMapCanvas=$('worldMiniMapCanvas'),worldMiniMapCtx=worldMiniMapCanvas.getContext('2d');
const enemyCanvas=$('enemyCanvas'),enemyCtx=enemyCanvas.getContext('2d');
let stageW=1380,stageH=520,group=null,currentMode='world',currentLocationKey='village',simPeriod='morning',globalPhase=0,playerX=.38;
 let villageStage=null,battleStage=null,NPCS={},NPC_STATE={},worldRoamingNpcs=[],selectedActorId=null,playbackEpoch=0,playbackBusy=false,combatFx=null;
const LOCATION_DATA={village:{theme:'forest',npcs:[]},forest:{theme:'wild',npcs:[]}};
const aliases={'actor-1':'elder','actor-2':'hunter','actor-3':'merchant'};
const WORLD_W=1600,WORLD_H=920,worldCam={x:0,y:0},worldPlayer={x:360,y:575};
const pixel=p=>({x:(p.x+.5)*80,y:(p.y+.5)*920/12});
let WORLD_LOCS=[],WORLD_ZONES=[],mapFocusActorId=null;const worldMonsters=[];
let interpolation=null,wolfPose='idle',wolfPhase=0;
const wolfOff=document.createElement('canvas'),wolfOffCtx=wolfOff.getContext('2d'),wolfAsset=window.StickArt.get('shadow_wolf');
wolfOff.width=wolfAsset.size.width;wolfOff.height=wolfAsset.size.height;
  const AudioManager = (function() {
    let ctx = null;
    let masterGain = null;
    let sfxGain = null;
    let bgmGain = null;
    let bgmTimer = null;
    let currentBgmMode = null;

    let settings = {
      master: 0.8,
      sfx: 0.8,
      bgm: 0.5,
      muted: false
    };

    try {
      const saved = localStorage.getItem('narraverse_audio_settings');
      if (saved) settings = Object.assign(settings, JSON.parse(saved));
    } catch (e) {}

    function ensureContext() {
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        ctx = new AudioCtx();
        masterGain = ctx.createGain();
        sfxGain = ctx.createGain();
        bgmGain = ctx.createGain();

        sfxGain.connect(masterGain);
        bgmGain.connect(masterGain);
        masterGain.connect(ctx.destination);
        applyVolumes();
      }
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      return ctx;
    }

    function applyVolumes() {
      if (!ctx || !masterGain) return;
      const now = ctx.currentTime;
      masterGain.gain.setValueAtTime(settings.muted ? 0 : settings.master, now);
      sfxGain.gain.setValueAtTime(settings.sfx, now);
      bgmGain.gain.setValueAtTime(settings.bgm, now);
    }

    let noiseBufferCache = null;
    function getNoiseBuffer(c) {
      if (noiseBufferCache && noiseBufferCache.sampleRate === c.sampleRate) return noiseBufferCache;
      const bufferSize = Math.floor(c.sampleRate * 1.5);
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      noiseBufferCache = buffer;
      return buffer;
    }

    function saveSettings() {
      try {
        localStorage.setItem('narraverse_audio_settings', JSON.stringify(settings));
      } catch (e) {}
    }

    function play(type) {
      const c = ensureContext();
      if (!c || settings.muted || settings.master <= 0 || settings.sfx <= 0) return;
      const t = c.currentTime;

      try {
        switch(type) {
          // ─── 基础武学攻防 ───
          case 'attack': {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(320, t);
            osc.frequency.exponentialRampToValueAtTime(70, t + 0.16);
            g.gain.setValueAtTime(0.35, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.16);
            break;
          }
          case 'heavy': {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(180, t);
            osc.frequency.exponentialRampToValueAtTime(35, t + 0.32);
            g.gain.setValueAtTime(0.65, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.35);
            break;
          }
          case 'hit': {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(45, t + 0.14);
            g.gain.setValueAtTime(0.5, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.15);
            break;
          }
          case 'crit': {
            const osc1 = c.createOscillator();
            const osc2 = c.createOscillator();
            const g = c.createGain();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(260, t);
            osc1.frequency.exponentialRampToValueAtTime(30, t + 0.4);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(90, t);
            osc2.frequency.exponentialRampToValueAtTime(25, t + 0.42);
            g.gain.setValueAtTime(0.7, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
            osc1.connect(g); osc2.connect(g); g.connect(sfxGain);
            osc1.start(t); osc1.stop(t + 0.42);
            osc2.start(t); osc2.stop(t + 0.42);
            break;
          }
          case 'parry': {
            const osc1 = c.createOscillator();
            const osc2 = c.createOscillator();
            const g = c.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(1480, t);
            osc1.frequency.exponentialRampToValueAtTime(880, t + 0.3);
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(2160, t);
            osc2.frequency.exponentialRampToValueAtTime(1320, t + 0.25);
            g.gain.setValueAtTime(0.55, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
            osc1.connect(g); osc2.connect(g); g.connect(sfxGain);
            osc1.start(t); osc1.stop(t + 0.35);
            osc2.start(t); osc2.stop(t + 0.35);
            break;
          }
          case 'dodge': {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(450, t);
            osc.frequency.exponentialRampToValueAtTime(180, t + 0.22);
            g.gain.setValueAtTime(0.35, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.22);
            break;
          }
          case 'cast': {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(320, t);
            osc.frequency.exponentialRampToValueAtTime(840, t + 0.18);
            osc.frequency.exponentialRampToValueAtTime(220, t + 0.35);
            g.gain.setValueAtTime(0.4, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.35);
            break;
          }
          case 'burst': {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(120, t);
            osc.frequency.linearRampToValueAtTime(40, t + 0.5);
            g.gain.setValueAtTime(0.75, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.55);
            break;
          }
          case 'ultimate': {
            const osc1 = c.createOscillator();
            const osc2 = c.createOscillator();
            const g = c.createGain();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(80, t);
            osc1.frequency.exponentialRampToValueAtTime(320, t + 0.25);
            osc1.frequency.exponentialRampToValueAtTime(40, t + 0.9);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(60, t);
            osc2.frequency.exponentialRampToValueAtTime(20, t + 1.0);
            g.gain.setValueAtTime(0.9, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
            osc1.connect(g); osc2.connect(g); g.connect(sfxGain);
            osc1.start(t); osc1.stop(t + 1.0);
            osc2.start(t); osc2.stop(t + 1.0);
            break;
          }
          case 'ap_gain': {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(659.25, t);
            osc.frequency.setValueAtTime(830.61, t + 0.08);
            g.gain.setValueAtTime(0.3, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.28);
            break;
          }
          case 'deny': {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(146.83, t);
            osc.frequency.setValueAtTime(130.81, t + 0.08);
            g.gain.setValueAtTime(0.18, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.2);
            break;
          }
          case 'bell': {
            const osc1 = c.createOscillator();
            const osc2 = c.createOscillator();
            const g = c.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(220, t);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(442, t);
            g.gain.setValueAtTime(0.45, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
            osc1.connect(g); osc2.connect(g); g.connect(sfxGain);
            osc1.start(t); osc1.stop(t + 2.2);
            osc2.start(t); osc2.stop(t + 2.2);
            break;
          }
          case 'breakthrough_charge': {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(880, t + 1.2);
            g.gain.setValueAtTime(0.1, t);
            g.gain.linearRampToValueAtTime(0.6, t + 1.1);
            g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 1.3);
            break;
          }
          case 'breakthrough_burst': {
            [220, 277.18, 329.63, 440, 880].forEach((freq, idx) => {
              const osc = c.createOscillator();
              const g = c.createGain();
              osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
              osc.frequency.setValueAtTime(freq, t);
              g.gain.setValueAtTime(0.25, t);
              g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
              osc.connect(g); g.connect(sfxGain);
              osc.start(t); osc.stop(t + 2.5);
            });
            break;
          }
          case 'potion': {
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(300, t);
            osc.frequency.exponentialRampToValueAtTime(600, t + 0.12);
            osc.frequency.exponentialRampToValueAtTime(400, t + 0.25);
            g.gain.setValueAtTime(0.3, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.28);
            break;
          }
          case 'rest': {
            [196, 246.94, 293.66, 392].forEach((freq) => {
              const osc = c.createOscillator();
              const g = c.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(freq, t);
              g.gain.setValueAtTime(0.2, t);
              g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
              osc.connect(g); g.connect(sfxGain);
              osc.start(t); osc.stop(t + 1.8);
            });
            break;
          }

          // ─── 异兽专属兽吼与攻击音 ───
          case 'wolf_howl': {
            // 幽狼凄厉长嚎：滑音 580Hz -> 780Hz -> 260Hz，配 6.5Hz 颤音与低通滤波
            const osc = c.createOscillator();
            const lfo = c.createOscillator();
            const lfoGain = c.createGain();
            const g = c.createGain();
            const filter = c.createBiquadFilter();

            osc.type = 'sawtooth';
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1400, t);
            filter.frequency.exponentialRampToValueAtTime(600, t + 0.95);

            lfo.frequency.setValueAtTime(6.5, t);
            lfoGain.gain.setValueAtTime(25, t);
            lfo.connect(osc.frequency);

            osc.frequency.setValueAtTime(580, t);
            osc.frequency.linearRampToValueAtTime(780, t + 0.28);
            osc.frequency.exponentialRampToValueAtTime(260, t + 0.95);

            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime(0.45, t + 0.15);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.95);

            osc.connect(filter); filter.connect(g); g.connect(sfxGain);
            lfo.start(t); osc.start(t);
            lfo.stop(t + 0.95); osc.stop(t + 0.95);
            break;
          }
          case 'python_hiss': {
            // 巨蟒吐信毒瘴嘶鸣：高通带通双段喷气
            const noise = c.createBufferSource();
            noise.buffer = getNoiseBuffer(c);
            const filter = c.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(2600, t);
            filter.Q.setValueAtTime(3.5, t);

            const g = c.createGain();
            g.gain.setValueAtTime(0.001, t);
            g.gain.linearRampToValueAtTime(0.35, t + 0.05);
            g.gain.linearRampToValueAtTime(0.12, t + 0.18);
            g.gain.linearRampToValueAtTime(0.42, t + 0.3);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);

            noise.connect(filter); filter.connect(g); g.connect(sfxGain);
            noise.start(t); noise.stop(t + 0.65);
            break;
          }
          case 'bear_roar': {
            // 狂熊撼地狂吼：双低频锯齿波低吼共振
            const osc1 = c.createOscillator();
            const osc2 = c.createOscillator();
            const filter = c.createBiquadFilter();
            const g = c.createGain();

            osc1.type = 'sawtooth';
            osc2.type = 'sawtooth';
            osc1.frequency.setValueAtTime(92, t);
            osc1.frequency.exponentialRampToValueAtTime(38, t + 0.75);
            osc2.frequency.setValueAtTime(97, t);
            osc2.frequency.exponentialRampToValueAtTime(42, t + 0.75);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(420, t);
            filter.Q.setValueAtTime(4.5, t);

            g.gain.setValueAtTime(0.01, t);
            g.gain.linearRampToValueAtTime(0.7, t + 0.1);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

            osc1.connect(filter); osc2.connect(filter);
            filter.connect(g); g.connect(sfxGain);
            osc1.start(t); osc2.start(t);
            osc1.stop(t + 0.8); osc2.stop(t + 0.8);
            break;
          }
          case 'golem_smash': {
            // 玄岩魔傀崩山碎石：超重低音三角波 + 碎石白噪
            const osc = c.createOscillator();
            const gOsc = c.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(75, t);
            osc.frequency.exponentialRampToValueAtTime(22, t + 0.6);
            gOsc.gain.setValueAtTime(0.85, t);
            gOsc.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
            osc.connect(gOsc); gOsc.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.65);

            const noise = c.createBufferSource();
            noise.buffer = getNoiseBuffer(c);
            const filter = c.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1100, t);
            filter.frequency.exponentialRampToValueAtTime(400, t + 0.4);
            const gNoise = c.createGain();
            gNoise.gain.setValueAtTime(0.5, t);
            gNoise.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
            noise.connect(filter); filter.connect(gNoise); gNoise.connect(sfxGain);
            noise.start(t); noise.stop(t + 0.45);
            break;
          }
          case 'cultist_slash': {
            // 堕落魔修双刃连斩：双段快速切风破空
            [0, 0.09].forEach((offset) => {
              const osc = c.createOscillator();
              const g = c.createGain();
              osc.type = 'sawtooth';
              osc.frequency.setValueAtTime(540, t + offset);
              osc.frequency.exponentialRampToValueAtTime(110, t + offset + 0.16);
              g.gain.setValueAtTime(0.4, t + offset);
              g.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.16);
              osc.connect(g); g.connect(sfxGain);
              osc.start(t + offset); osc.stop(t + offset + 0.16);
            });
            break;
          }

          // ─── 武学神兵与天地煞气 ───
          case 'blade_whoosh': {
            // 轻刃切风破空：带通白噪声扫频
            const noise = c.createBufferSource();
            noise.buffer = getNoiseBuffer(c);
            const filter = c.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1600, t);
            filter.frequency.exponentialRampToValueAtTime(450, t + 0.18);
            filter.Q.setValueAtTime(2.0, t);
            const g = c.createGain();
            g.gain.setValueAtTime(0.45, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            noise.connect(filter); filter.connect(g); g.connect(sfxGain);
            noise.start(t); noise.stop(t + 0.18);
            break;
          }
          case 'jianqi_burst': {
            // 刀罡剑气：金属清越撕裂声
            const osc1 = c.createOscillator();
            const osc2 = c.createOscillator();
            const g = c.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(987.77, t);
            osc1.frequency.exponentialRampToValueAtTime(440, t + 0.28);
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(1975.53, t);
            osc2.frequency.exponentialRampToValueAtTime(880, t + 0.22);
            g.gain.setValueAtTime(0.5, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
            osc1.connect(g); osc2.connect(g); g.connect(sfxGain);
            osc1.start(t); osc2.start(t);
            osc1.stop(t + 0.28); osc2.stop(t + 0.28);
            break;
          }
          case 'lightning': {
            // 天劫雷煞：高频电闪炸裂 + 40Hz 超低音滚雷共鸣
            const noise = c.createBufferSource();
            noise.buffer = getNoiseBuffer(c);
            const filter = c.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(3200, t);
            filter.frequency.exponentialRampToValueAtTime(500, t + 0.3);
            const gNoise = c.createGain();
            gNoise.gain.setValueAtTime(0.65, t);
            gNoise.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
            noise.connect(filter); filter.connect(gNoise); gNoise.connect(sfxGain);
            noise.start(t); noise.stop(t + 0.35);

            const osc = c.createOscillator();
            const gOsc = c.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(95, t);
            osc.frequency.exponentialRampToValueAtTime(32, t + 0.8);
            gOsc.gain.setValueAtTime(0.6, t);
            gOsc.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
            osc.connect(gOsc); gOsc.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.85);
            break;
          }
          case 'fire_flame': {
            // 气血真火燃爆：动态低通噪声爆燃
            const noise = c.createBufferSource();
            noise.buffer = getNoiseBuffer(c);
            const filter = c.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(300, t);
            filter.frequency.linearRampToValueAtTime(900, t + 0.15);
            filter.frequency.exponentialRampToValueAtTime(200, t + 0.45);
            const g = c.createGain();
            g.gain.setValueAtTime(0.01, t);
            g.gain.linearRampToValueAtTime(0.6, t + 0.08);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
            noise.connect(filter); filter.connect(g); g.connect(sfxGain);
            noise.start(t); noise.stop(t + 0.48);
            break;
          }
          case 'shield_break': {
            // 护体破防硬直：晶体碎裂脆响 + 短促钝音
            [1760, 2637, 3520].forEach((freq) => {
              const osc = c.createOscillator();
              const g = c.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(freq, t);
              osc.frequency.exponentialRampToValueAtTime(freq * 0.4, t + 0.22);
              g.gain.setValueAtTime(0.3, t);
              g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
              osc.connect(g); g.connect(sfxGain);
              osc.start(t); osc.stop(t + 0.25);
            });
            const oscBass = c.createOscillator();
            const gBass = c.createGain();
            oscBass.type = 'triangle';
            oscBass.frequency.setValueAtTime(140, t);
            oscBass.frequency.exponentialRampToValueAtTime(45, t + 0.2);
            gBass.gain.setValueAtTime(0.5, t);
            gBass.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
            oscBass.connect(gBass); gBass.connect(sfxGain);
            oscBass.start(t); oscBass.stop(t + 0.22);
            break;
          }
          case 'cooldown_ready': {
            // 冷却就绪水滴清鸣
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1046.50, t);
            osc.frequency.exponentialRampToValueAtTime(1318.51, t + 0.1);
            g.gain.setValueAtTime(0.28, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.26);
            break;
          }

          // ─── UI 交互与大世界氛围 ───
          case 'ui_click': {
            // 竹木扣击轻声
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(460, t);
            osc.frequency.exponentialRampToValueAtTime(220, t + 0.045);
            g.gain.setValueAtTime(0.2, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.05);
            break;
          }
          case 'ui_tab': {
            // 卷轴展开翻页沙沙声
            const noise = c.createBufferSource();
            noise.buffer = getNoiseBuffer(c);
            const filter = c.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1200, t);
            filter.frequency.exponentialRampToValueAtTime(500, t + 0.12);
            const g = c.createGain();
            g.gain.setValueAtTime(0.22, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
            noise.connect(filter); filter.connect(g); g.connect(sfxGain);
            noise.start(t); noise.stop(t + 0.13);
            break;
          }
          case 'footstep': {
            // 踏雪行军脚步
            const osc = c.createOscillator();
            const g = c.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(115, t);
            osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);
            g.gain.setValueAtTime(0.25, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
            osc.connect(g); g.connect(sfxGain);
            osc.start(t); osc.stop(t + 0.09);
            break;
          }
          case 'stat_up': {
            // 极道筋骨鸣响升华三音
            [261.63, 392.00, 523.25].forEach((freq, idx) => {
              const osc = c.createOscillator();
              const g = c.createGain();
              osc.type = 'sine';
              const st = t + idx * 0.07;
              osc.frequency.setValueAtTime(freq, st);
              g.gain.setValueAtTime(0.25, st);
              g.gain.exponentialRampToValueAtTime(0.001, st + 0.35);
              osc.connect(g); g.connect(sfxGain);
              osc.start(st); osc.stop(st + 0.35);
            });
            break;
          }
          case 'gold_coins': {
            // 铜钱相击清脆声
            [2800, 3600].forEach((freq, idx) => {
              const osc = c.createOscillator();
              const g = c.createGain();
              osc.type = 'triangle';
              const st = t + idx * 0.04;
              osc.frequency.setValueAtTime(freq, st);
              g.gain.setValueAtTime(0.22, st);
              g.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
              osc.connect(g); g.connect(sfxGain);
              osc.start(st); osc.stop(st + 0.18);
            });
            break;
          }
          case 'hour_bell': {
            // 时辰晨钟暮鼓：悠远大钟 3.0s 长延音
            [110, 220, 330].forEach((freq, idx) => {
              const osc = c.createOscillator();
              const g = c.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(freq, t);
              g.gain.setValueAtTime(0.3 / (idx + 1), t);
              g.gain.exponentialRampToValueAtTime(0.001, t + 3.0);
              osc.connect(g); g.connect(sfxGain);
              osc.start(t); osc.stop(t + 3.0);
            });
            break;
          }

          // ─── 战斗胜负与情景 ───
          case 'defeat': {
            // 败退挽歌：小调下行和弦
            [220.00, 196.00, 164.81, 130.81].forEach((freq, idx) => {
              const osc = c.createOscillator();
              const g = c.createGain();
              osc.type = 'triangle';
              const st = t + idx * 0.16;
              osc.frequency.setValueAtTime(freq, st);
              g.gain.setValueAtTime(0.28, st);
              g.gain.exponentialRampToValueAtTime(0.001, st + 0.85);
              osc.connect(g); g.connect(sfxGain);
              osc.start(st); osc.stop(st + 0.85);
            });
            break;
          }
          case 'victory': {
            // 斩敌凯旋：大调升华和弦
            [261.63, 329.63, 392.00, 523.25].forEach((freq, idx) => {
              const osc = c.createOscillator();
              const g = c.createGain();
              osc.type = 'sine';
              const st = t + idx * 0.11;
              osc.frequency.setValueAtTime(freq, st);
              g.gain.setValueAtTime(0.3, st);
              g.gain.exponentialRampToValueAtTime(0.001, st + 1.2);
              osc.connect(g); g.connect(sfxGain);
              osc.start(st); osc.stop(st + 1.2);
            });
            break;
          }
        }
      } catch (e) {
        console.warn('Audio play error:', e);
      }
    }

    function startBgm(mode) {
      if (currentBgmMode === mode) return;
      currentBgmMode = mode;
      stopBgm();

      const c = ensureContext();
      if (!c) return;

      const modes = {
        world:    [146.83, 164.81, 196.00, 220.00, 261.63],
        scene:    [174.61, 196.00, 220.00, 261.63, 293.66],
        battle:   [110.00, 130.81, 146.83, 164.81, 196.00],
        meditate: [130.81, 164.81, 196.00, 246.94, 261.63]
      };
      const scale = modes[mode] || modes.scene;
      let step = 0;

      bgmTimer = setInterval(() => {
        if (settings.muted || settings.bgm <= 0 || !ctx) return;
        const t = ctx.currentTime;
        const freq = scale[step % scale.length];
        step++;

        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = mode === 'battle' ? 'sawtooth' : 'sine';
        osc.frequency.setValueAtTime(freq, t);

        const dur = mode === 'meditate' ? 3.5 : (mode === 'battle' ? 1.2 : 2.5);
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(mode === 'battle' ? 0.08 : 0.06, t + dur * 0.3);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);

        osc.connect(g); g.connect(bgmGain);
        osc.start(t); osc.stop(t + dur);
      }, mode === 'battle' ? 900 : 2000);
    }

    function stopBgm() {
      if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
    }

    ['click', 'keydown', 'touchstart'].forEach(evt => {
      window.addEventListener(evt, () => { ensureContext(); }, { once: true });
    });

    return {
      init: ensureContext,
      play,
      startBgm,
      stopBgm,
      setMaster(v) { settings.master = Math.max(0, Math.min(1, v)); applyVolumes(); saveSettings(); },
      setSfx(v) { settings.sfx = Math.max(0, Math.min(1, v)); applyVolumes(); saveSettings(); },
      setBgm(v) { settings.bgm = Math.max(0, Math.min(1, v)); applyVolumes(); saveSettings(); },
      toggleMute() { settings.muted = !settings.muted; applyVolumes(); saveSettings(); return settings.muted; },
      isMuted() { return settings.muted; },
      getSettings() { return { ...settings }; }
    };
  })();

  function drawVillageDecorations() {
    if (!villageStage) return;
    const st = villageStage.state;
    const W = st.W;
    const H = st.H;
    const gy = H - 18;

    villageDecorCtx.clearRect(0, 0, W, H);

    for (const actor of villageStage.actors()) {
      if (actor.hidden) continue;
      const p = villageStage._test.poseAt(actor);
      const sk = villageStage._test.build(p);
      const a = villageStage.actions ? villageStage.actions[actor.action] : null;
      const plant = !a || a.plant !== false;
      const STAND = (villageStage.BODY ? (villageStage.BODY.thigh + villageStage.BODY.shin) : 56);
      const hx = actor.x * W;
      const hipY = gy - (plant ? (sk.drop || 50.5) : STAND) + (p.py || 0) - (p.hop || 0);
      const s = actor.scale || 1;

      villageDecorCtx.save();
      villageDecorCtx.translate(hx, hipY);
      if (actor.flip) villageDecorCtx.scale(-1, 1);
      villageDecorCtx.scale(s, s);

      // 各据点天际 NPC 特色服饰与随身配件渲染
      if (actor.id === 'hunter') {
        // 🏹 1. 猎户燕赤风 (斯万) - 墨绿斗笠 + 森绿短披风
        villageDecorCtx.fillStyle = '#566444';
        villageDecorCtx.strokeStyle = '#38462c';
        villageDecorCtx.lineWidth = 1.3;
        villageDecorCtx.beginPath();
        villageDecorCtx.moveTo(sk.head.x - 13, sk.head.y - 1);
        villageDecorCtx.lineTo(sk.head.x, sk.head.y - 8);
        villageDecorCtx.lineTo(sk.head.x + 13, sk.head.y - 1);
        villageDecorCtx.closePath();
        villageDecorCtx.fill(); villageDecorCtx.stroke();

        const sway = Math.sin(actor.t * 7) * 3.2;
        villageDecorCtx.fillStyle = 'rgba(75, 95, 65, 0.85)';
        villageDecorCtx.beginPath();
        villageDecorCtx.moveTo(sk.neck.x - 1, sk.neck.y);
        villageDecorCtx.lineTo(sk.neck.x - 8 + sway, sk.pelvis.y + 12);
        villageDecorCtx.lineTo(sk.neck.x - 1, sk.pelvis.y + 10);
        villageDecorCtx.closePath();
        villageDecorCtx.fill();
      }
      else if (actor.id === 'merchant') {
        // 💰 2. 杂货掌柜顾百草 (卢坎) - 暖棕员外礼帽 + 山羊胡 + 长袍下摆
        villageDecorCtx.fillStyle = '#7a5a44';
        villageDecorCtx.fillRect(sk.head.x - 6, sk.head.y - 12.5, 12, 6);
        villageDecorCtx.fillStyle = '#5a4030';
        villageDecorCtx.fillRect(sk.head.x - 8.5, sk.head.y - 6.5, 17, 2.4);
        villageDecorCtx.fillStyle = '#d23f31';
        villageDecorCtx.fillRect(sk.head.x - 1.5, sk.head.y - 10, 3, 3); // 红顶珠

        villageDecorCtx.strokeStyle = '#5a4030';
        villageDecorCtx.lineWidth = 1.6;
        villageDecorCtx.beginPath();
        villageDecorCtx.moveTo(sk.head.x + 2, sk.head.y + 6);
        villageDecorCtx.lineTo(sk.head.x + 5, sk.head.y + 11);
        villageDecorCtx.stroke();

        villageDecorCtx.strokeStyle = '#7a5a44';
        villageDecorCtx.lineWidth = 3.2;
        const legSway = Math.sin(actor.t * 6) * 2;
        villageDecorCtx.beginPath();
        villageDecorCtx.moveTo(sk.pelvis.x, sk.pelvis.y + 2);
        villageDecorCtx.lineTo(sk.pelvis.x - 3 + legSway, sk.pelvis.y + 23);
        villageDecorCtx.moveTo(sk.pelvis.x + 2, sk.pelvis.y + 2);
        villageDecorCtx.lineTo(sk.pelvis.x + 3 - legSway, sk.pelvis.y + 23);
        villageDecorCtx.stroke();
      }
      else if (actor.id === 'smith') {
        // 🔨 3. 铁匠阿尔沃 - 铁匠皮围裙 + 护目头巾
        villageDecorCtx.fillStyle = '#8a4b2a';
        villageDecorCtx.fillRect(sk.head.x - 7, sk.head.y - 10, 14, 4);
        villageDecorCtx.fillStyle = '#4a2d1d';
        villageDecorCtx.beginPath();
        villageDecorCtx.moveTo(sk.neck.x - 4, sk.neck.y + 2);
        villageDecorCtx.lineTo(sk.neck.x + 4, sk.neck.y + 2);
        villageDecorCtx.lineTo(sk.pelvis.x + 5, sk.pelvis.y + 14);
        villageDecorCtx.lineTo(sk.pelvis.x - 5, sk.pelvis.y + 14);
        villageDecorCtx.closePath();
        villageDecorCtx.fill();
      }
      else if (actor.id === 'bard') {
        // 🪈 4. 吟游行者米凯尔 - 潇洒深青羽毛帽 + 飘拂领巾
        villageDecorCtx.fillStyle = '#2d5a68';
        villageDecorCtx.beginPath();
        villageDecorCtx.ellipse(sk.head.x, sk.head.y - 7, 8, 3.5, 0, 0, Math.PI * 2);
        villageDecorCtx.fill();
        villageDecorCtx.strokeStyle = '#e3c35a';
        villageDecorCtx.lineWidth = 1.5;
        villageDecorCtx.beginPath();
        villageDecorCtx.moveTo(sk.head.x + 2, sk.head.y - 8);
        villageDecorCtx.lineTo(sk.head.x + 8, sk.head.y - 15);
        villageDecorCtx.stroke();
      }
      else if (actor.id === 'jarl') {
        // 👑 5. 漫雪城巴尔古夫领主 - 黄金冠冕 + 华贵锦绣金纹大披风
        villageDecorCtx.fillStyle = '#ffd26a';
        villageDecorCtx.strokeStyle = '#b8860b';
        villageDecorCtx.lineWidth = 1.2;
        villageDecorCtx.beginPath();
        villageDecorCtx.moveTo(sk.head.x - 7, sk.head.y - 7);
        villageDecorCtx.lineTo(sk.head.x - 5, sk.head.y - 13);
        villageDecorCtx.lineTo(sk.head.x - 2, sk.head.y - 9);
        villageDecorCtx.lineTo(sk.head.x, sk.head.y - 14);
        villageDecorCtx.lineTo(sk.head.x + 2, sk.head.y - 9);
        villageDecorCtx.lineTo(sk.head.x + 5, sk.head.y - 13);
        villageDecorCtx.lineTo(sk.head.x + 7, sk.head.y - 7);
        villageDecorCtx.closePath();
        villageDecorCtx.fill(); villageDecorCtx.stroke();

        villageDecorCtx.fillStyle = 'rgba(184, 134, 11, 0.85)';
        villageDecorCtx.beginPath();
        villageDecorCtx.moveTo(sk.neck.x - 2, sk.neck.y);
        villageDecorCtx.lineTo(sk.neck.x - 10, sk.pelvis.y + 18);
        villageDecorCtx.lineTo(sk.neck.x - 1, sk.pelvis.y + 14);
        villageDecorCtx.closePath();
        villageDecorCtx.fill();
      }
      else if (actor.id === 'guard_whiterun') {
        // 🛡️ 6. 漫雪城守备队长伊尔斯 - 钢制全罩盔 + 漫雪蓝黑战袍
        villageDecorCtx.fillStyle = '#657b8c';
        villageDecorCtx.strokeStyle = '#394854';
        villageDecorCtx.lineWidth = 1.3;
        villageDecorCtx.fillRect(sk.head.x - 6.5, sk.head.y - 8.5, 13, 11);
        villageDecorCtx.strokeRect(sk.head.x - 6.5, sk.head.y - 8.5, 13, 11);
        villageDecorCtx.fillStyle = '#1f2937';
        villageDecorCtx.fillRect(sk.head.x - 4, sk.head.y - 2, 8, 2);

        villageDecorCtx.fillStyle = 'rgba(46, 75, 105, 0.85)';
        villageDecorCtx.fillRect(sk.pelvis.x - 4, sk.pelvis.y + 1, 8, 14);
      }
      else if (actor.id === 'merchant_whiterun') {
        // 💎 7. 大商贾贝莱托尔 - 紫绸礼冠 + 珠光宝气挂坠
        villageDecorCtx.fillStyle = '#6e4c7e';
        villageDecorCtx.fillRect(sk.head.x - 6, sk.head.y - 12, 12, 5.5);
        villageDecorCtx.fillStyle = '#ffd26a';
        villageDecorCtx.beginPath();
        villageDecorCtx.arc(sk.neck.x, sk.neck.y + 4, 3, 0, Math.PI * 2);
        villageDecorCtx.fill();
      }
      else if (actor.id === 'cleric') {
        // 🌿 8. 吉娜莱丝女祭司丹妮卡 - 圣洁金环法冠 + 翠绿神圣飘带
        villageDecorCtx.strokeStyle = '#7ee787';
        villageDecorCtx.lineWidth = 1.6;
        villageDecorCtx.beginPath();
        villageDecorCtx.ellipse(sk.head.x, sk.head.y - 7, 7, 3, 0, 0, Math.PI * 2);
        villageDecorCtx.stroke();
        villageDecorCtx.fillStyle = 'rgba(46, 125, 86, 0.75)';
        villageDecorCtx.fillRect(sk.pelvis.x - 4, sk.pelvis.y, 8, 18);
      }
      else if (actor.id === 'bandit_boss') {
        // 🪓 9. 独眼狂屠哈达 - 战损独眼眼罩 + 凶煞赤红皮甲
        villageDecorCtx.fillStyle = '#1a1a1a';
        villageDecorCtx.beginPath();
        villageDecorCtx.arc(sk.head.x + 3, sk.head.y - 1, 3.5, 0, Math.PI * 2);
        villageDecorCtx.fill();
        villageDecorCtx.strokeStyle = '#1a1a1a';
        villageDecorCtx.lineWidth = 1.2;
        villageDecorCtx.beginPath();
        villageDecorCtx.moveTo(sk.head.x - 5, sk.head.y - 5);
        villageDecorCtx.lineTo(sk.head.x + 6, sk.head.y + 3);
        villageDecorCtx.stroke();
      }
      else if (actor.id === 'bandit_thug') {
        // 🗡️ 10. 刀疤鼠 - 盗匪面罩
        villageDecorCtx.fillStyle = '#3a2020';
        villageDecorCtx.fillRect(sk.head.x - 5, sk.head.y - 1, 10, 6);
      }
      else if (actor.id === 'greybeard') {
        // 🏔️ 11. 灰胡子阿恩盖尔长老 - 隐修灰兜帽 + 飘拂苍苍长须
        villageDecorCtx.fillStyle = '#606c76';
        villageDecorCtx.beginPath();
        villageDecorCtx.arc(sk.head.x, sk.head.y - 3, 8.5, Math.PI * 0.8, Math.PI * 2.2);
        villageDecorCtx.closePath();
        villageDecorCtx.fill();

        villageDecorCtx.fillStyle = '#e6edf3';
        villageDecorCtx.beginPath();
        villageDecorCtx.moveTo(sk.head.x - 4, sk.head.y + 4);
        villageDecorCtx.lineTo(sk.head.x, sk.head.y + 16);
        villageDecorCtx.lineTo(sk.head.x + 4, sk.head.y + 4);
        villageDecorCtx.closePath();
        villageDecorCtx.fill();
      }
      else if (actor.id === 'monk') {
        // 📿 12. 苦修僧法空 - 灰色僧帽 + 念珠长绳
        villageDecorCtx.fillStyle = '#4a5560';
        villageDecorCtx.fillRect(sk.head.x - 5, sk.head.y - 8, 10, 4);
      }

      villageDecorCtx.restore();

      // 头顶动态生态气泡与交互提示
      const headTopY = hipY + sk.head.y * s - 22 * s;
      let bubbleText = '';
      let bubbleTheme = 'normal';

      if (actor.id === 'hero') {
        const loc = LOCATION_DATA[currentLocationKey] || LOCATION_DATA.riverwood;
        for (const k of loc.npcs) {
          const ns = NPC_STATE[k];
          if (ns && Math.abs(playerX - ns.x) < 0.08) {
            const shortName = (NPCS[k]?.name || k).split('·')[0].trim();
            bubbleText = `✨ [按 E / 右键【${shortName}】]`;
            bubbleTheme = 'hero';
            break;
          }
        }
      } else {
        const ns = NPC_STATE[actor.id];
        const npcInfo = NPCS[actor.id];
        if (ns && npcInfo) {
          const shortName = npcInfo.name.split('·')[0].trim();
          if (ns.state === 'talking') {
            bubbleText = `💬 与【${shortName}】交谈中`;
            bubbleTheme = 'talk';
          } else if (simPeriod === 'night' && (actor.id === 'merchant' || actor.id === 'merchant_whiterun')) {
            bubbleText = '💤 打烊熟睡中...';
            bubbleTheme = 'sleep';
          } else {
            const actStr = ns.activity || (ns.state === 'walk' ? '巡游' : '驻足');
            bubbleText = `${shortName} · ${actStr}`;
            bubbleTheme = actor.id.includes('bandit') ? 'talk' : 'normal';
          }
        }
      }

      if (bubbleText) {
        drawNPCBubble(villageDecorCtx, bubbleText, hx, headTopY, bubbleTheme);
      }
    }
  }

  function drawNPCBubble(ctx, text, cx, ty, theme) {
    ctx.save();
    ctx.font = '11px sans-serif';
    const tw = ctx.measureText(text).width;
    const bw = tw + 12, bh = 18;
    const bx = cx - bw / 2, by = ty - bh;

    if (theme === 'hero') {
      ctx.fillStyle = 'rgba(31, 111, 235, 0.9)';
      ctx.strokeStyle = '#79c0ff';
    } else if (theme === 'talk') {
      ctx.fillStyle = 'rgba(210, 153, 34, 0.9)';
      ctx.strokeStyle = '#ffd26a';
    } else if (theme === 'sleep') {
      ctx.fillStyle = 'rgba(56, 75, 105, 0.85)';
      ctx.strokeStyle = '#8ab4f8';
    } else {
      ctx.fillStyle = 'rgba(22, 27, 34, 0.82)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    }

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 4) : ctx.rect(bx, by, bw, bh);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#f0f6fc';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, by + bh / 2);
    ctx.restore();
  }

  /* ────────────────────────────────────────────────
   *  场景静态背景与环境 (天际五大据点地貌特色渲染)
   * ──────────────────────────────────────────────── */
  function drawVillageScene(delta) {


    const W = villageStage ? villageStage.state.W : (stageContainer.clientWidth || 1380);
    const H = villageStage ? villageStage.state.H : (stageContainer.clientHeight || 520);
    sceneCtx.clearRect(0, 0, W, H);

    const curLoc = LOCATION_DATA[currentLocationKey] || LOCATION_DATA.riverwood;
    const themeKey = curLoc.theme || 'forest';

    // 1. 远景天空与远山渐变 (根据地点主题与时辰自适应)
    const g = sceneCtx.createLinearGradient(0, 0, 0, H);
    if (themeKey === 'snow') {
      // 世界之喉：冰蓝苍穹与极寒风雪
      g.addColorStop(0, '#0a1526'); g.addColorStop(0.55, '#1b3454'); g.addColorStop(1, '#2c496e');
    } else if (themeKey === 'city') {
      // 漫雪城：中枢阔达晴空
      if (simPeriod === 'night') {
        g.addColorStop(0, '#080c14'); g.addColorStop(0.6, '#131d2e'); g.addColorStop(1, '#1c242c');
      } else {
        g.addColorStop(0, '#1a3350'); g.addColorStop(0.55, '#35597d'); g.addColorStop(1, '#3b4c40');
      }
    } else if (themeKey === 'camp') {
      // 静月土匪窝：昏暗凶煞暮色
      g.addColorStop(0, '#241014'); g.addColorStop(0.55, '#482024'); g.addColorStop(1, '#332420');
    } else {
      // 溪木镇 / 幽狼林：宁静林海山色
      if (simPeriod === 'morning') {
        g.addColorStop(0, '#1c2838'); g.addColorStop(0.55, '#334354'); g.addColorStop(1, '#252b24');
      } else if (simPeriod === 'noon') {
        g.addColorStop(0, '#22446a'); g.addColorStop(0.55, '#486e8e'); g.addColorStop(1, '#2f3b2c');
      } else if (simPeriod === 'evening') {
        g.addColorStop(0, '#3e1e2c'); g.addColorStop(0.55, '#6a3638'); g.addColorStop(1, '#68402c');
      } else {
        g.addColorStop(0, '#0a0e14'); g.addColorStop(0.55, '#121822'); g.addColorStop(1, '#181d18');
      }
    }
    sceneCtx.fillStyle = g;
    sceneCtx.fillRect(0, 0, W, H);

    // 2. 远山与建筑剪影
    if (themeKey === 'snow') {
      // 世界屋脊：覆雪万仞冰峰
      sceneCtx.fillStyle = 'rgba(180, 210, 240, 0.55)';
      sceneCtx.beginPath();
      sceneCtx.moveTo(0, H * 0.55);
      sceneCtx.lineTo(W * 0.25, H * 0.24);
      sceneCtx.lineTo(W * 0.52, H * 0.48);
      sceneCtx.lineTo(W * 0.76, H * 0.18);
      sceneCtx.lineTo(W, H * 0.52);
      sceneCtx.lineTo(W, H); sceneCtx.lineTo(0, H); sceneCtx.closePath(); sceneCtx.fill();

      // 皑皑近峰
      sceneCtx.fillStyle = 'rgba(220, 235, 255, 0.75)';
      sceneCtx.beginPath();
      sceneCtx.moveTo(0, H * 0.70);
      sceneCtx.lineTo(W * 0.32, H * 0.42);
      sceneCtx.lineTo(W * 0.62, H * 0.65);
      sceneCtx.lineTo(W * 0.88, H * 0.36);
      sceneCtx.lineTo(W, H * 0.68);
      sceneCtx.lineTo(W, H); sceneCtx.lineTo(0, H); sceneCtx.closePath(); sceneCtx.fill();
    } else if (themeKey === 'city') {
      // 漫雪城：城堡城垛与龙霄宫巍峨石构剪影
      sceneCtx.fillStyle = 'rgba(40, 52, 65, 0.75)';
      sceneCtx.beginPath();
      sceneCtx.moveTo(0, H * 0.66);
      for (let bx = 0; bx < W; bx += 70) {
        sceneCtx.lineTo(bx + 15, H * 0.66);
        sceneCtx.lineTo(bx + 15, H * 0.52);
        sceneCtx.lineTo(bx + 45, H * 0.52);
        sceneCtx.lineTo(bx + 45, H * 0.66);
      }
      sceneCtx.lineTo(W, H); sceneCtx.lineTo(0, H); sceneCtx.closePath(); sceneCtx.fill();

      // 龙霄宫远景主殿
      sceneCtx.fillStyle = 'rgba(30, 42, 54, 0.85)';
      sceneCtx.beginPath();
      sceneCtx.moveTo(W * 0.42, H * 0.66);
      sceneCtx.lineTo(W * 0.48, H * 0.32);
      sceneCtx.lineTo(W * 0.54, H * 0.32);
      sceneCtx.lineTo(W * 0.60, H * 0.66);
      sceneCtx.closePath(); sceneCtx.fill();
    } else {
      // 溪木镇 / 土匪窝 / 幽狼林：叠翠苍峦剪影
      sceneCtx.fillStyle = simPeriod === 'night' ? 'rgba(18,24,20,0.85)' : 'rgba(38,48,38,0.7)';
      sceneCtx.beginPath();
      sceneCtx.moveTo(0, H * 0.62);
      sceneCtx.quadraticCurveTo(W * 0.18, H * 0.38, W * 0.38, H * 0.58);
      sceneCtx.quadraticCurveTo(W * 0.55, H * 0.44, W * 0.72, H * 0.6);
      sceneCtx.quadraticCurveTo(W * 0.88, H * 0.48, W, H * 0.58);
      sceneCtx.lineTo(W, H); sceneCtx.lineTo(0, H); sceneCtx.closePath(); sceneCtx.fill();
    }

    // 日 / 月
    if (simPeriod === 'night') {
      sceneCtx.fillStyle = 'rgba(240,240,220,0.88)';
      sceneCtx.beginPath(); sceneCtx.arc(W * 0.84, H * 0.16, 14, 0, Math.PI * 2); sceneCtx.fill();
    } else {
      sceneCtx.fillStyle = 'rgba(255,245,190,0.7)';
      sceneCtx.beginPath(); sceneCtx.arc(W * 0.82, H * 0.15, 16, 0, Math.PI * 2); sceneCtx.fill();
    }

    // 3. 地表与道路基底
    const groundY = H - 24;
    if (themeKey === 'snow') {
      sceneCtx.fillStyle = '#c5d8e6';
      sceneCtx.fillRect(0, groundY, W, 24);
      sceneCtx.strokeStyle = '#e2edf5';
    } else if (themeKey === 'city') {
      sceneCtx.fillStyle = '#2d333b';
      sceneCtx.fillRect(0, groundY, W, 24);
      sceneCtx.strokeStyle = '#444c56';
    } else if (themeKey === 'camp') {
      sceneCtx.fillStyle = '#261b17';
      sceneCtx.fillRect(0, groundY, W, 24);
      sceneCtx.strokeStyle = '#3e2c26';
    } else {
      sceneCtx.fillStyle = simPeriod === 'night' ? '#181e18' : '#222923';
      sceneCtx.fillRect(0, groundY, W, 24);
      sceneCtx.strokeStyle = simPeriod === 'night' ? '#2e382f' : '#424e41';
    }
    sceneCtx.lineWidth = 2;
    sceneCtx.beginPath(); sceneCtx.moveTo(0, groundY); sceneCtx.lineTo(W, groundY); sceneCtx.stroke();

    const theme = { accent: '#d5a17d', foreground: '#edf0e9', surface: '#202522' };
    const midX = Math.round(W * 0.48);

    // 4. 据点特色建筑与生活设施渲染
    if (themeKey === 'city') {
      // 🏰 漫雪城：大集市、总商会柜台、吉娜莱丝金树圣坛与灵泉
      if (K.has('altar')) {
        K.drawEntity(sceneCtx, { archetype: 'altar' }, { x: midX - 60, y: H - 90, width: 80, height: 68, phase: globalPhase, theme });
      }
      if (K.has('fountain')) {
        K.drawEntity(sceneCtx, { archetype: 'fountain' }, { x: midX + 80, y: H - 85, width: 70, height: 62, phase: globalPhase, theme });
      }
      if (K.has('counter')) {
        K.drawEntity(sceneCtx, { archetype: 'counter' }, { x: 80, y: H - 65, width: 72, height: 44, theme });
      }
      if (K.has('crate')) {
        K.drawEntity(sceneCtx, { archetype: 'crate' }, { x: 30, y: H - 52, width: 40, height: 32, theme });
      }
      if (K.has('table')) {
        K.drawEntity(sceneCtx, { archetype: 'table' }, { x: W - 220, y: H - 58, width: 56, height: 38, theme });
      }
      if (K.has('signpost')) {
        K.drawEntity(sceneCtx, { archetype: 'signpost' }, { x: W - 130, y: H - 76, width: 40, height: 56, theme });
      }
    } else if (themeKey === 'camp') {
      // ⛺ 静月土匪窝：首领战帐、掠夺铁锅、处决囚笼、熊熊篝火与警戒栅栏
      if (K.has('tent')) {
        K.drawEntity(sceneCtx, { archetype: 'tent', appearance: { color: '#682020' } }, { x: 40, y: H - 124, width: 140, height: 100, theme });
      }
      if (K.has('campfire')) {
        K.drawEntity(sceneCtx, { archetype: 'campfire' }, { x: midX - 20, y: H - 64, width: 80, height: 46, phase: globalPhase, theme });
      }
      if (K.has('cauldron')) {
        K.drawEntity(sceneCtx, { archetype: 'cauldron' }, { x: midX + 85, y: H - 68, width: 56, height: 48, phase: globalPhase, theme });
      }
      if (K.has('cage')) {
        K.drawEntity(sceneCtx, { archetype: 'cage' }, { x: W - 240, y: H - 82, width: 62, height: 60, theme });
      }
      if (K.has('fence')) {
        K.drawEntity(sceneCtx, { archetype: 'fence' }, { x: W - 150, y: H - 72, width: 130, height: 50, theme });
      }
    } else if (themeKey === 'snow') {
      // 🏔️ 世界之喉：万古朝圣石阶、灰胡子修道古坛、玄光秘境
      if (K.has('stairs')) {
        K.drawEntity(sceneCtx, { archetype: 'stairs' }, { x: 50, y: H - 85, width: 110, height: 65, theme });
      }
      if (K.has('altar')) {
        K.drawEntity(sceneCtx, { archetype: 'altar' }, { x: midX - 45, y: H - 96, width: 90, height: 74, phase: globalPhase, theme });
      }
      if (K.has('statue')) {
        K.drawEntity(sceneCtx, { archetype: 'statue' }, { x: midX + 90, y: H - 100, width: 65, height: 80, theme });
      }
      if (K.has('portal')) {
        K.drawEntity(sceneCtx, { archetype: 'portal' }, { x: W - 220, y: H - 110, width: 85, height: 90, phase: globalPhase, theme });
      }

      // 世界之喉极顶飞雪粒子
      sceneCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      const snowTime = performance.now() * 0.001;
      for (let si = 0; si < 40; si++) {
        const sx = ((si * 43 + snowTime * 60) % W);
        const sy = ((si * 31 + snowTime * 90) % (H - 30));
        sceneCtx.beginPath();
        sceneCtx.arc(sx, sy, 1.8 + (si % 3) * 0.8, 0, Math.PI * 2);
        sceneCtx.fill();
      }
    } else if (currentLocationKey === 'village') {
      // 🏡 溪木镇 (默认)：林海、顾百草药摊、村中古井、夜宿篝火、村口木栅
      if (K.has('tent')) {
        K.drawEntity(sceneCtx, { archetype: 'tent', appearance: { color: '#8a6a52' } }, { x: 25, y: H - 124, width: 140, height: 100, theme });
      }
      if (K.has('counter')) {
        K.drawEntity(sceneCtx, { archetype: 'counter' }, { x: 130, y: H - 65, width: 66, height: 44, theme });
      }
      if (K.has('crate')) {
        K.drawEntity(sceneCtx, { archetype: 'crate' }, { x: 55, y: H - 50, width: 38, height: 30, theme });
      }
      if (K.has('barrel')) {
        K.drawEntity(sceneCtx, { archetype: 'barrel' }, { x: 215, y: H - 56, width: 34, height: 36, theme });
      }
      if (K.has('well')) {
        K.drawEntity(sceneCtx, { archetype: 'well' }, { x: midX - 160, y: H - 76, width: 68, height: 56, theme });
      }
      if (K.has('campfire')) {
        K.drawEntity(sceneCtx, { archetype: 'campfire' }, { x: midX, y: H - 62, width: 76, height: 44, phase: globalPhase, theme });
        if ((simPeriod === 'evening' || simPeriod === 'night') && K.glowDot) {
          K.glowDot(sceneCtx, { x: midX + 38, y: H - 42 }, 140, '#ff9933', 0.28);
        }
      }
      if (K.has('table')) {
        K.drawEntity(sceneCtx, { archetype: 'table' }, { x: midX + 105, y: H - 58, width: 54, height: 38, theme });
      }
      if (K.has('chair')) {
        K.drawEntity(sceneCtx, { archetype: 'chair' }, { x: midX + 168, y: H - 54, width: 30, height: 34, theme });
      }
      if (K.has('sign')) {
        K.drawEntity(sceneCtx, { archetype: 'sign' }, { x: Math.max(midX + 260, W - 370), y: H - 66, width: 42, height: 46, theme });
      }
      if (K.has('fence')) {
        K.drawEntity(sceneCtx, { archetype: 'fence' }, { x: Math.max(midX + 310, W - 320), y: H - 74, width: 150, height: 54, theme });
      }
      if (K.has('entrance')) {
        K.drawEntity(sceneCtx, { archetype: 'entrance', visualState: { open: true } }, { x: Math.max(midX + 470, W - 145), y: H - 110, width: 84, height: 92, theme });
      }
    }

    // 5. 绘制火柴人特征装饰层 (帽子/披风/胡须/气泡)
    drawVillageDecorations();
  }

  function drawWorldMap(now) {
    if (!worldMapCtx) return;
    const VW = stageContainer.clientWidth || stageW || 1380;
    const VH = stageContainer.clientHeight || stageH || 520;

    worldMapCtx.clearRect(0, 0, VW, VH);

    // 1. 地图背景底色（高雅水墨荒原色）
    const g = worldMapCtx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#131b17');
    g.addColorStop(1, '#202923');
    worldMapCtx.fillStyle = g;
    worldMapCtx.fillRect(0, 0, VW, VH);

    worldMapCtx.save();
    worldMapCtx.translate(-worldCam.x, -worldCam.y);

    // 2. 绘制区域圆环
    WORLD_ZONES.forEach(z => {
      worldMapCtx.beginPath();
      worldMapCtx.arc(z.cx, z.cy, z.r, 0, Math.PI * 2);
      worldMapCtx.fillStyle = 'rgba(75, 120, 85, 0.08)';
      worldMapCtx.fill();
      worldMapCtx.setLineDash([8, 8]);
      worldMapCtx.lineWidth = 1.5;
      worldMapCtx.strokeStyle = 'rgba(121, 192, 255, 0.28)';
      worldMapCtx.stroke();
      worldMapCtx.setLineDash([]);

      worldMapCtx.fillStyle = '#79c0ff';
      worldMapCtx.font = '12px sans-serif';
      worldMapCtx.textAlign = 'center';
      worldMapCtx.fillText(z.name, z.cx, z.cy - z.r + 20);
    });

    // 3. 远古连通通衢道路网络（天际主要商道虚线）
    worldMapCtx.strokeStyle = '#627660';
    worldMapCtx.lineWidth = 3.5;
    worldMapCtx.setLineDash([10, 8]);
    worldMapCtx.beginPath();
    worldMapCtx.moveTo(360,575); worldMapCtx.lineTo(1320,575);
    worldMapCtx.stroke();
    worldMapCtx.setLineDash([]);

    // 4. 地图上的山脉剪影装饰
    worldMapCtx.fillStyle = '#243026';
    [[120, 180, 160, 110], [680, 120, 180, 130], [1300, 100, 240, 150], [240, 720, 150, 100], [920, 740, 170, 110]].forEach(([x, y, w, h]) => {
      worldMapCtx.beginPath();
      worldMapCtx.moveTo(x, y + h);
      worldMapCtx.lineTo(x + w / 2, y);
      worldMapCtx.lineTo(x + w, y + h);
      worldMapCtx.closePath();
      worldMapCtx.fill();
    });

    // 5. 各据点地点绘制 (上古卷轴天际经典据点)
    WORLD_LOCS.forEach(L => {
      const pulse = Math.sin((now / 400) + L.x) * 2;
      worldMapCtx.beginPath();
      worldMapCtx.arc(L.x, L.y, 23 + pulse, 0, Math.PI * 2);
      worldMapCtx.fillStyle = L.color;
      worldMapCtx.shadowColor = L.color;
      worldMapCtx.shadowBlur = 15;
      worldMapCtx.fill();
      worldMapCtx.shadowBlur = 0;
      worldMapCtx.strokeStyle = '#fff';
      worldMapCtx.lineWidth = 2.5;
      worldMapCtx.stroke();

      worldMapCtx.font = '17px sans-serif';
      worldMapCtx.textAlign = 'center';
      worldMapCtx.textBaseline = 'middle';
      worldMapCtx.fillText(L.icon, L.x, L.y);

      worldMapCtx.font = 'bold 13px sans-serif';
      worldMapCtx.fillStyle = '#f0f6fc';
      worldMapCtx.fillText(L.name, L.x, L.y - 34);

      worldMapCtx.font = '11px sans-serif';
      worldMapCtx.fillStyle = '#8b949e';
      worldMapCtx.fillText(L.desc, L.x, L.y + 36);
    });

    // 6. 流动 NPC 队伍绘制 (巡逻队、虎人商队、截道土匪、朝圣僧)
    worldRoamingNpcs.forEach(r => {
      const rPulse = 1 + Math.sin(now / 250 + r.x) * 0.12;
      worldMapCtx.beginPath();
      worldMapCtx.arc(r.x, r.y, 14 * rPulse, 0, Math.PI * 2);
      worldMapCtx.fillStyle = r.color;
      worldMapCtx.shadowColor = r.color;
      worldMapCtx.shadowBlur = 10;
      worldMapCtx.fill();
      worldMapCtx.shadowBlur = 0;
      worldMapCtx.strokeStyle = '#ffffff';
      worldMapCtx.lineWidth = 2;
      worldMapCtx.stroke();

      worldMapCtx.font = '12px sans-serif';
      worldMapCtx.textAlign = 'center';
      worldMapCtx.textBaseline = 'middle';
      worldMapCtx.fillText(r.icon, r.x, r.y);

      worldMapCtx.font = 'bold 11px sans-serif';
      worldMapCtx.fillStyle = '#e6edf3';
      worldMapCtx.fillText(r.name, r.x, r.y - 19);

      worldMapCtx.font = '10px sans-serif';
      worldMapCtx.fillStyle = r.color;
      worldMapCtx.fillText(`[${r.title}]`, r.x, r.y + 20);
    });

    // 7. 游荡妖魔绘制
    worldMonsters.forEach(m => {
      const mPulse = 1 + Math.sin(now / 200 + m.x) * 0.15;
      worldMapCtx.beginPath();
      worldMapCtx.arc(m.x, m.y, 13 * mPulse, 0, Math.PI * 2);
      worldMapCtx.fillStyle = '#cf222e';
      worldMapCtx.shadowColor = '#f85149';
      worldMapCtx.shadowBlur = 12;
      worldMapCtx.fill();
      worldMapCtx.shadowBlur = 0;
      worldMapCtx.strokeStyle = '#ff7b72';
      worldMapCtx.lineWidth = 2;
      worldMapCtx.stroke();

      worldMapCtx.fillStyle = '#ffa198';
      worldMapCtx.font = '11px sans-serif';
      worldMapCtx.textAlign = 'center';
      worldMapCtx.fillText(`${m.name} Lv.${m.level}`, m.x, m.y - 18);
    });

    worldMapCtx.strokeStyle='#355c75';worldMapCtx.lineWidth=20;worldMapCtx.beginPath();
    worldMapCtx.moveTo(840,0);worldMapCtx.lineTo(840,535);worldMapCtx.moveTo(840,615);worldMapCtx.lineTo(840,920);worldMapCtx.stroke();
    if(group?.map.order){worldMapCtx.strokeStyle='#ffd26a';worldMapCtx.lineWidth=2;worldMapCtx.setLineDash([6,6]);worldMapCtx.beginPath();
      group.map.order.path.slice(group.map.order.index).forEach((p,i)=>{const q=pixel(p);i?worldMapCtx.lineTo(q.x,q.y):worldMapCtx.moveTo(q.x,q.y);});worldMapCtx.stroke();worldMapCtx.setLineDash([]);}
    // 8. 玩家坐标与赤色令旗
    worldMapCtx.beginPath();
    worldMapCtx.arc(worldPlayer.x, worldPlayer.y, 13, 0, Math.PI * 2);
    worldMapCtx.fillStyle = '#ffd26a';
    worldMapCtx.shadowColor = '#ffd26a';
    worldMapCtx.shadowBlur = 16;
    worldMapCtx.fill();
    worldMapCtx.shadowBlur = 0;
    worldMapCtx.strokeStyle = '#fff';
    worldMapCtx.lineWidth = 2.5;
    worldMapCtx.stroke();

    worldMapCtx.strokeStyle = '#d29922';
    worldMapCtx.lineWidth = 2.5;
    worldMapCtx.beginPath();
    worldMapCtx.moveTo(worldPlayer.x, worldPlayer.y - 12);
    worldMapCtx.lineTo(worldPlayer.x, worldPlayer.y - 38);
    worldMapCtx.stroke();

    worldMapCtx.fillStyle = '#f85149';
    worldMapCtx.beginPath();
    worldMapCtx.moveTo(worldPlayer.x, worldPlayer.y - 38);
    worldMapCtx.lineTo(worldPlayer.x + 22, worldPlayer.y - 30);
    worldMapCtx.lineTo(worldPlayer.x, worldPlayer.y - 22);
    worldMapCtx.closePath();
    worldMapCtx.fill();

    worldMapCtx.fillStyle = '#fff';
    worldMapCtx.font = 'bold 12px sans-serif';
    worldMapCtx.textAlign = 'center';
    worldMapCtx.fillText((group?.player.self.identity.name ?? '玩家') + ' · actor-4', worldPlayer.x, worldPlayer.y + 26);

    worldMapCtx.restore();

    // 9. 小地图 (MiniMap) 绘制
    drawMiniMap();
  }

  function drawMiniMap() {
    if (!worldMiniMapCtx) return;
    const MW = worldMiniMapCanvas.width, MH = worldMiniMapCanvas.height;
    worldMiniMapCtx.clearRect(0, 0, MW, MH);

    // 小地图底色
    worldMiniMapCtx.fillStyle = '#18201a';
    worldMiniMapCtx.fillRect(0, 0, MW, MH);

    // 绘制地点方块
    WORLD_LOCS.forEach(L => {
      worldMiniMapCtx.fillStyle = L.color;
      worldMiniMapCtx.fillRect((L.x / WORLD_W) * MW - 3, (L.y / WORLD_H) * MH - 3, 6, 6);
    });

    // 绘制流动 NPC 队伍青蓝点
    worldRoamingNpcs.forEach(r => {
      worldMiniMapCtx.fillStyle = r.color;
      worldMiniMapCtx.fillRect((r.x / WORLD_W) * MW - 2, (r.y / WORLD_H) * MH - 2, 4, 4);
    });

    // 绘制妖兽红点
    worldMonsters.forEach(m => {
      worldMiniMapCtx.fillStyle = '#ff3b30';
      worldMiniMapCtx.fillRect((m.x / WORLD_W) * MW - 2, (m.y / WORLD_H) * MH - 2, 4, 4);
    });

    // 绘制玩家黄点
    worldMiniMapCtx.fillStyle = '#ffd26a';
    worldMiniMapCtx.fillRect((worldPlayer.x / WORLD_W) * MW - 3, (worldPlayer.y / WORLD_H) * MH - 3, 6, 6);

    // 绘制当前镜头可视范围白色方框
    const VW = stageContainer.clientWidth || stageW || 1380;
    const VH = stageContainer.clientHeight || stageH || 520;
    worldMiniMapCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    worldMiniMapCtx.lineWidth = 1.5;
    worldMiniMapCtx.strokeRect(
      (worldCam.x / WORLD_W) * MW,
      (worldCam.y / WORLD_H) * MH,
      (VW / WORLD_W) * MW,
      (VH / WORLD_H) * MH
    );
  }


function resizeLayers(){
 stageW=stageContainer.clientWidth||1380;stageH=stageContainer.clientHeight||520;const dpr=window.devicePixelRatio||1;
 for(const canvas of [worldMapCanvas,sceneCanvas,villageDecorCanvas,enemyCanvas,$('fxCanvas')]){
  canvas.width=Math.round(stageW*dpr);canvas.height=Math.round(stageH*dpr);canvas.getContext('2d').setTransform(dpr,0,0,dpr,0,0);
 }
 villageStage?.resize();battleStage?.resize();combatFx?.resize();
}
function setMode(mode){
 if(!group)return;
 if(mode==='scene'&&(!['village','forest'].includes(group.map.self.location)||group.map.order?.status==='marching')){showStatus('请先抵达地点或暂停行军。',true);return;}
 if(mode==='battle'&&!group.encounter.encounter){showStatus('还没有当前战斗；抵达森林后可开始遭遇。',true);return;}
 playbackEpoch++;playbackBusy=false;currentMode=mode;
 worldMapCanvas.hidden=mode!=='world';worldMiniMapCanvas.hidden=mode!=='world';
 for(const c of [sceneCanvas,villageStickCanvas,villageDecorCanvas])c.hidden=mode!=='scene';
 for(const c of [$('stickStage'),enemyCanvas,$('fxCanvas')])c.hidden=mode!=='battle';
 $('scenePeople').hidden=mode!=='scene';$('combatHud').hidden=mode!=='battle';$('combatCommands').hidden=mode!=='battle';
 $('mapControls').hidden=mode==='battle';$('worldActions').hidden=mode==='battle';
 if(mode==='scene'){if(!villageStage)villageStage=window.DemoStickman.createStage(villageStickCanvas,{height:stageH,ground:false,bg:null});villageStage.start();syncScene();}else villageStage?.stop();
 if(mode==='battle'){
  if(!battleStage){battleStage=window.DemoStickman.createStage($('stickStage'),{height:stageH,ground:true,bg:null});battleStage.scene([{id:'actor-4',x:.28,scale:1.85,color:'#6d4731',prop:'sword',action:'idle'}]);}
  if(!combatFx)combatFx=window.WorldCombatFX.init($('fxCanvas'));
  battleStage.start();wolfPose=group.encounter.encounter.wolfHealth===0?'dead':'idle';
 }else battleStage?.stop();
 for(const [id,m] of [['tabWorldBtn','world'],['tabSceneBtn','scene'],['tabBattleBtn','battle']])$(id).classList.toggle('active',m===mode);
 $('modeTag').textContent={world:'🗺️ 世界地图',scene:'🏡 '+place(group.map.self.location),battle:'⚔️ 回合制战斗'}[mode];
 safeAudio(()=>AudioManager.startBgm(mode));resizeLayers();paintReadings();
}
const place=v=>({village:'村庄',forest:'森林',road:'道路'})[v]??v;
const role=v=>({chief:'村长',hunter:'猎人',merchant:'商人',player:'玩家'})[v]??v;
function safeAudio(run){try{run();}catch{/* Sound does not decide or interrupt gameplay. */}}
function showStatus(text,error=false){$('connectionStatus').textContent=text;$('connectionStatus').dataset.error=String(error);}
function syncScene(){
 if(!villageStage||!group)return;
 currentLocationKey=group.map.self.location==='forest'?'forest':'village';NPCS={};NPC_STATE={};LOCATION_DATA[currentLocationKey].npcs=[];
 const list=[{id:'hero',x:playerX,scale:1.42,color:'#4a5258',prop:'sword',action:group.player.self.identity.alive?'idle':'knockdown'}];
 const people=group.scene.actors.filter(a=>a.alive),positions=[.18,.62,.82];
 people.forEach((a,i)=>{const key=aliases[a.actorId],x=positions[i%3];NPCS[key]={name:a.name,role:role(a.occupation)};NPC_STATE[key]={x,state:'idle',activity:a.condition==='wounded'?'受伤':'在场'};
  LOCATION_DATA[currentLocationKey].npcs.push(key);list.push({id:key,x,scale:1.4,color:a.actorId==='actor-2'?'#566444':'#7a5a44',prop:a.actorId==='actor-2'?'bow':a.actorId==='actor-1'?'staff':null,action:'idle'});});
 villageStage.scene(list);$('scenePeople').replaceChildren();
 people.forEach((a,i)=>{const b=document.createElement('button');b.textContent=a.name+' · '+a.actorId;b.dataset.actorId=a.actorId;b.style.left=positions[i%3]*100+'%';b.addEventListener('click',()=>showPerson(a.actorId));$('scenePeople').append(b);});
}
function showPerson(id){
 if(selectedActorId!==id){socialTextComposer.reset();npcDialogue.reset();}
 selectedActorId=id;const actor=group?.map.actors.find(a=>a.actorId===id);if(!actor){socialTextComposer.reset();npcDialogue.reset();$('personCard').hidden=true;return;}
 socialTextComposer.observe(group,id);npcDialogue.observe(group,id);
 $('personCard').hidden=false;$('personName').textContent=actor.name+' · '+role(actor.occupation);
 $('personDetail').textContent=actor.actorId+' · '+place(actor.location)+' · '+(actor.condition==='wounded'?'受伤':actor.alive?'存活':'已逝')+'\n'+(actor.canInteract?'就在附近，可以交互。':'距离较远，先走到人物附近。');
 const social=id==='actor-2'?group.map.social:null;
 $('personMemory').textContent=social?'询问共同经历，听他自己谈起记住的事。':actor.receivedGifts.length?'人物记得收到你的赠粮：'+actor.receivedGifts.map(m=>'世界时刻 '+m.occurrenceTick).join('、'):'当前投影没有这位人物收到你赠粮的记忆。';
 $('personSocial').hidden=!social;
 if(social){
  const permissions=socialInteractionActions(group,canWrite()&&!playbackBusy);
  for(const key of Object.keys(socialActionNames))$('social-'+key).disabled=!permissions[key];
  $('socialStance').textContent=social.npc?'眼前的态度：'+({calm:'平静',warm:'亲近',wary:'戒备',afraid:'畏惧'})[social.npc.stance]:'走近一些，才能观察他的态度。';
  $('socialSpeech').textContent=social.npc?.speech?('上次互动的回应：“'+social.npc.speech+'”'+(social.npc.memoryRefs.length?'（提起了过去的经历）':'')):'还没有听到新的回应。';
  $('socialAsset').textContent=social.asset?'猎人的工具包 · 耐久 '+social.asset.condition+'/100 · '+(social.asset.holderId==='actor-4'?'由你持有':'放在歇脚处'):'工具包不在当前视野内。';
  paintSocialText();paintNpcNegotiation();
 }
 const gift=group.scene.actors.find(a=>a.actorId===id)?.gift;
 const actions=interactionActions(group,canWrite()&&!playbackBusy,id);
 const navigation=personNavigation(group,canWrite()&&!playbackBusy,id);
 $('personLocate').disabled=!navigation.visible;$('personApproach').disabled=!navigation.canApproach;
 $('personNavigationHint').textContent='当前视野位置 ('+actor.x+', '+actor.y+')。前往点击时的位置，不自动追踪移动人物。';
 $('personGift').hidden=id!=='actor-2';$('personGift').disabled=!actions.gift;
 $('personWork').hidden=id!=='actor-1';$('personWork').disabled=!actions.work;
 $('personTrade').hidden=id!=='actor-3';$('personTrade').disabled=!actions.trade;
 $('personActionHint').textContent=!actor.canInteract?'先走到人物附近，再进行交互。':id==='actor-1'?
  (actions.work?'村庄工作会推进6小时，成功领20金币。':worldTimeView(group,canWrite()&&!playbackBusy).workHint):id==='actor-3'?
  (actions.trade?'可买卖粮食和药草，成交后按真实回执更新。':'交易暂不可用，请先抵达村庄并停止行军或战斗。'):
  social?'选择一种举动；他会按自己的经历和当前处境回应。':(gift?.available?'赠粮后，对方会记得这次交付。':'赠粮暂不可用，请查看当前状态。');
 const canvas=$('portraitCanvas'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,140,140);
 K.drawEntity(ctx,{archetype:id==='actor-2'?'archer':id==='actor-1'?'priest':'rogue',appearance:{color:id==='actor-2'?'#566444':'#7a5a44'}},{x:0,y:0,width:140,height:140,theme:{accent:'#d5a17d',foreground:'#edf0e9',surface:'#202522'}});
}
function paintSocialText(){
 const state=socialTextComposer.view(group,canWrite()&&!playbackBusy,selectedActorId),pending=client.state().busy||client.state().pending;
 if($('socialText').value!==state.text)$('socialText').value=state.text;
 $('socialText').disabled=pending;$('socialTextStatus').textContent=state.message;
 $('socialTextReview').hidden=state.status!=='stale';$('socialTextReview').disabled=pending;
 $('socialTextExecute').disabled=!state.canSubmit;
 $('socialTextExecute').textContent=state.selected?'执行：'+state.selected:state.status==='empty'?'先写下想法':'请先明确一个意思';
 $('socialTextChoices').hidden=state.status!=='clarify';
 // Keep focused choice buttons stable across heartbeat paints.
 const choices=JSON.stringify(state.choices);
 if($('socialTextChoices').dataset.choices!==choices){
  $('socialTextChoices').dataset.choices=choices;$('socialTextChoices').replaceChildren();
  for(const choice of state.choices){const button=document.createElement('button');button.type='button';button.textContent=choice.label;
   button.addEventListener('click',()=>handle(()=>{socialTextComposer.choose(choice.index,group,selectedActorId);paintSocialText();}));$('socialTextChoices').append(button);}
 }
 for(const button of $('socialTextChoices').children){button.disabled=pending;button.setAttribute('aria-pressed',String(button.textContent===state.selected));}
}
function paintNpcNegotiation(){
 const n=group?.map.negotiation;$('npcNegotiation').hidden=!n;if(!n)return;
 const write=canWrite()&&!playbackBusy,state=npcDialogue.view(group,write,selectedActorId),pending=client.state().busy||client.state().pending;
 if($('npcDialogueText').value!==state.text)$('npcDialogueText').value=state.text;
 $('npcDialogueText').disabled=pending;$('npcDialogueStatus').textContent=state.message;
 $('npcDialogueGenerate').disabled=!state.canGenerate;$('npcDialogueCommit').disabled=!state.canCommit;
 $('npcDialoguePreview').hidden=!state.reply;$('npcDialoguePreview').textContent=state.reply;
 $('npcDialogueAct').hidden=!state.proposal;$('npcDialogueAct').disabled=!state.canAct;$('npcDialogueAct').textContent='确认建议：'+state.proposalLabel;
 $('npcDialogueHistory').textContent=n.lastTurn?'上次已保存的交谈：你说“'+n.lastTurn.utterance+'”；猎人回应“'+n.lastTurn.reply+'”。':'';
 const at=t=>'第 '+Math.floor(t/144)+' 天 '+String(Math.floor(t%144/6)).padStart(2,'0')+':'+String(t%6*10).padStart(2,'0');
 const a=n.agreement,status={offered:'待你接受',accepted:'等待实际修理',ready:'可按约领取',borrowed:'借用中',fulfilled:'已按时归还',breached:'已经逾期', 'returned-late':'逾期后已归还',expired:'已经过期',cancelled:'已谢绝',invalidated:'已经失效'};
 $('npcAgreement').textContent=a?'当前约定：修理'+a.terms.repairAmount+'点至'+a.targetCondition+'耐久，换借'+a.terms.loanTicks/6+'小时；'+status[a.status]+'。修理进度 '+a.repairProgress+'/'+a.terms.repairAmount+'。'+(a.dueTick!==null?'归还截止：'+at(a.dueTick)+'。':'接受/履约截止：'+at(a.expiresTick)+'。'):'还没有修理换借用的约定。';
 $('npcPropose').disabled=!(write&&n.canPropose);$('npcAccept').disabled=!(write&&n.canAccept);$('npcDecline').disabled=!(write&&n.canDecline);$('npcClaim').disabled=!(write&&n.canClaim);
 $('npcRepair').disabled=pending;$('npcLoan').disabled=pending;
}
function closePerson(){selectedActorId=null;socialTextComposer.reset();npcDialogue.reset();$('socialText').value='';$('personCard').hidden=true;}
function canWrite(){const s=client.state();return !!(group&&s.connected&&!s.busy&&!s.pending&&!s.blocked&&group.player.self.identity.alive&&group.capabilities.writes&&group.map.budget.remainingCommands>0);}
function setHealth(p,w){$('playerHpText').textContent=p+' / 1000';$('enemyHpText').textContent=(w??0)+' / 300';$('playerHpBar').style.width=p/10+'%';$('enemyHpBar').style.width=(w??0)/3+'%';}
function paintTrade(){
 if(!group)return;const quantity=Number($('tradeQuantity').value),actions=interactionActions(group,canWrite()&&!playbackBusy,'actor-3',quantity);
 const merchant=group.map.actors.find(a=>a.actorId==='actor-3');
 $('tradeTitle').textContent=(merchant?.name??'商人')+' · 交易';
 $('tradeHint').textContent=!actions.trade?'交易已暂停：需要商人在附近、位于村庄且当前可行动。':!actions.quantityValid?'每笔数量请输入1至10的整数。':'每笔推进1刻；交易以服务端确认后的资产为准。';
 for(const [id,key] of [['food','Food'],['herbs','Herbs']]){
  const price=group.player.actions.prices[id];$('trade'+key+'Count').textContent=String(group.player.self.inventory[id]);
  $('trade'+key+'Price').textContent='买入 '+price.buy+' / 卖出 '+price.sell+' 金币';
  $('tradeBuy'+key).disabled=!actions[id].buy;$('tradeSell'+key).disabled=!actions[id].sell;
 }
 $('bagTrade').disabled=!actions.trade;
 $('bagFindMerchant').disabled=!personNavigation(group,false,'actor-3').visible;
 $('bagRest').disabled=!interactionActions(group,canWrite()&&!playbackBusy,null).rest;
 $('bagActionHint').textContent=actions.trade?'商人就在附近，可以处理行囊里的货物。':merchant?'商人在当前视野内，可以先查看位置，再决定前往。':'商人未在当前视野内；请探索附近，位置不会从后台补入。';
}
function openTrade(){
 if(!interactionActions(group,canWrite()&&!playbackBusy,'actor-3').trade){showStatus('请先走到村庄商人附近，并结束当前活动。',true);return;}
 $('tradePanel').hidden=false;paintTrade();$('tradeQuantity').focus();
}
function paintReadings(){
 if(!group)return;const p=group.player.self,m=group.map,e=group.encounter.encounter,s=client.state(),write=canWrite()&&!playbackBusy;document.body.dataset.worldConnected=String(s.connected);
 const timing=worldTimeView(group,write);
 $('worldClockText').textContent=timing.clockText+' · '+place(m.self.location)+' · 时刻 '+m.tick;$('revisionText').textContent='修订 '+m.revision;
 $('workTimingText').textContent=timing.workHint;$('waitHour').disabled=!timing.canWait;$('bagWait').disabled=!timing.canWait;
 $('identityText').textContent=p.identity.name+' · actor-4';$('healthText').textContent='生命 '+p.health+'/1000';$('walletText').textContent='金币 '+p.wallet;
 $('foodText').textContent='粮食 '+p.inventory.food;$('herbsText').textContent='药草 '+p.inventory.herbs;$('fatigueText').textContent='疲劳 '+p.fatigue+'/1000';
 const status={marching:group.runner.active?'行军中':'已停止续跑，等待继续',paused:'已暂停',arrived:'已抵达'}[m.order?.status]??'尚无行军订单';
 $('orderText').textContent=status;$('budgetText').textContent='剩余命令 '+m.budget.remainingCommands;
 $('viewCaption').textContent=m.contact?'路遇 '+(m.actors.find(a=>a.actorId===m.contact.actorId)?.name??m.contact.actorId)+' · 已停下':status+' · 位置 ('+m.self.x+', '+m.self.y+')';
 $('bagContents').textContent='金币 '+p.wallet+' · 粮食 '+p.inventory.food+' · 药草 '+p.inventory.herbs+'。'+(m.social?.asset?.holderId==='actor-4'?'携带猎人的工具包，耐久 '+m.social.asset.condition+'/100；所有者仍是猎人。':'')+'此处只显示已保存的真实资产。';
 for(const id of ['toVillage','toForest','resumeMarch','goCoordinate','work','rest','buyFood','sellFood','buyHerbs','sellHerbs','giftFood','beginEncounter','attack','flee','cancelEncounter'])$(id).disabled=!write;
 $('pauseMarch').disabled=!s.connected||s.blocked;$('resumeMarch').disabled=!write||!['marching','paused'].includes(m.order?.status)||group.runner.active;
 $('enterLocation').disabled=!['village','forest'].includes(m.self.location)||m.order?.status==='marching';
 $('work').disabled=!timing.workReady;
 $('rest').disabled=!write||e?.status==='active';for(const id of ['buyFood','sellFood','buyHerbs','sellHerbs'])$(id).disabled=!write||!group.player.actions.canTrade;
 const gift=group.scene.actors.find(a=>a.actorId==='actor-2')?.gift;$('giftFood').disabled=!write||!gift?.available;
 $('beginEncounter').disabled=!write||!group.encounter.actions.canBegin;$('attack').disabled=!write||!group.encounter.actions.canAct;$('flee').disabled=$('attack').disabled;
 $('cancelEncounter').disabled=!write||!group.encounter.actions.canCancel;
 $('retryPending').hidden=!s.canRetry;$('retryPending').disabled=!s.canRetry;
 $('priceText').textContent='粮食 买/卖 '+group.player.actions.prices.food.buy+'/'+group.player.actions.prices.food.sell+'；药草 '+group.player.actions.prices.herbs.buy+'/'+group.player.actions.prices.herbs.sell;
 $('battleState').textContent=playbackBusy?'正在表现已确认回合':e?.status==='active'?'第 '+(e.attackCount+1)+' 回合 · 请选择指令':e?'战斗结束 · '+({win:'胜利',lose:'败北',flee:'逃离',cancel:'取消'}[e.resolution]??e.resolution):'尚无遭遇';
 if(!playbackBusy)setHealth(p.health,e?.wolfHealth);paintTrade();if(selectedActorId)showPerson(selectedActorId);
}
function acceptState(value){
 const previous=group;group=value;const now=performance.now(),target=pixel(value.map.self);
 if(mapFocusActorId&&!value.map.actors.some(a=>a.actorId===mapFocusActorId))mapFocusActorId=null;
 $('mapFollowPlayer').hidden=mapFocusActorId===null;
 if(!previous||previous.snapshot.revision!==value.snapshot.revision)interpolation={from:{...worldPlayer},to:target,start:now,duration:previous&&value.map.tick>previous.map.tick&&!matchMedia('(prefers-reduced-motion: reduce)').matches?420:0};
 const villageSites={'village-work':['村内的工作地点','⚒'], 'village-food':['村内售粮地点','🌾'], 'village-rest':['村内歇脚处','🪑']};
 WORLD_LOCS=value.map.landmarks.map(l=>({...pixel(l),key:l.id,name:l.name,
  desc:villageSites[l.id]?.[0]??(l.id==='village'?'村庄 · 工作、交易与休整':'森林 · 狼群遭遇'),
  color:l.id==='forest'?'#cf222e':'#3fb950',icon:villageSites[l.id]?.[1]??(l.id==='village'?'🏡':'🌲')}));
 WORLD_ZONES=[{name:'村庄',cx:360,cy:575,r:180},{name:'森林',cx:1320,cy:575,r:215}];
 worldRoamingNpcs=value.map.actors.filter(a=>a.alive).map(a=>({...pixel(a),id:a.actorId,name:a.name,title:role(a.occupation),color:'#79c0ff',icon:a.actorId==='actor-2'?'🏹':a.actorId==='actor-3'?'🪙':'杖'}));
 const day=value.snapshot.clock?.hour??Math.floor((value.map.tick%144)/6);simPeriod=day<6?'night':day<12?'morning':day<18?'noon':'evening';
 if(currentMode==='scene'&&(!['village','forest'].includes(value.map.self.location)||value.map.order?.status==='marching'))setMode('world');
 if(currentMode==='scene')syncScene();paintReadings();
 if(value.map.contact&&previous?.map.contact?.actorId!==value.map.contact.actorId)showPerson(value.map.contact.actorId);
}
function drawBattle(now){
 enemyCtx.clearRect(0,0,stageW,stageH);const g=enemyCtx.createLinearGradient(0,0,0,stageH);g.addColorStop(0,'#111c22');g.addColorStop(1,'#293126');enemyCtx.fillStyle=g;
 // The background lives behind the transparent stickman stage.
 stageContainer.style.background='linear-gradient(#111c22,#293126)';
 const e=group?.encounter.encounter;if(!e)return;
 wolfOffCtx.clearRect(0,0,wolfOff.width,wolfOff.height);
 window.StickArt.draw(wolfOffCtx,'shadow_wolf',{action:e.wolfHealth===0&&!playbackBusy?'dead':wolfPose,phase:now/1000-wolfPhase,facing:'left',color:'#43503b'});
 const scale=1.85,w=wolfOff.width*scale,h=wolfOff.height*scale;
 enemyCtx.drawImage(wolfOff,stageW*.72-w/2,stageH-18-(wolfOff.height-4)*scale,w,h);
}
function waitPresentation(ms,ticket){return new Promise(resolve=>{const start=performance.now();function frame(now){if(ticket!==playbackEpoch||now-start>=ms){resolve();return;}requestAnimationFrame(frame);}requestAnimationFrame(frame);});}
let confirmedActions=[];
function paintActionResult(receipt,dto){
 const view=describeActionReceipt(receipt,dto);if(!view)return;
 confirmedActions=recordConfirmedAction(confirmedActions,receipt,dto);
 $('actionResult').hidden=false;$('actionResult').dataset.outcome=view.outcome;$('actionResult').dataset.commandType=view.type;
 $('actionTitle').textContent=view.summary;$('actionChanges').textContent=view.reason||view.changes.join(' · ')||'操作已确认，当前状态已保存。';
 $('actionTime').textContent=view.time;$('receiptSummary').textContent=view.summary;
 $('actionHistoryEmpty').hidden=confirmedActions.length>0;$('actionHistory').replaceChildren();
 for(const entry of confirmedActions){
  const item=document.createElement('li'),title=document.createElement('strong'),detail=document.createElement('p'),time=document.createElement('p');
  item.dataset.commandId=entry.commandId;item.dataset.outcome=entry.outcome;title.textContent=entry.summary;
  detail.textContent=entry.reason||entry.changes.join(' · ')||'操作已确认。';time.textContent=entry.time;item.append(title,detail,time);$('actionHistory').append(item);
 }
}
async function playReceipt(receipt,dto,confirmedGroup){
 socialTextComposer.confirmed(receipt,dto,confirmedGroup);npcDialogue.confirmed(receipt,dto,confirmedGroup);
 $('lastReceipt').textContent=JSON.stringify(receipt,null,2);paintActionResult(receipt,dto);
 if(dto.type==='EncounterBegin'&&receipt.outcome==='succeeded')setMode('battle');
 const events=receipt.outcome==='succeeded'?receipt.result?.turnEvents:[];
 if(dto.type!=='EncounterAction'||!events?.length){paintReadings();return;}
 setMode('battle');const ticket=++playbackEpoch;playbackBusy=true;setHealth(receipt.result.before.playerHealth,receipt.result.before.wolfHealth);paintReadings();
 let php=receipt.result.before.playerHealth,whp=receipt.result.before.wolfHealth;
 for(const event of events){
  if(ticket!==playbackEpoch)break;
  if(event.kind==='player-strike'){battleStage.setActor('actor-4',{action:'attack'});wolfPose='hurt';combatFx?.burst({kind:'slash',at:{x:.72,y:.72},color:'#ffd28a'});safeAudio(()=>AudioManager.play('attack'));}
  else if(event.kind==='wolf-counter'){battleStage.setActor('actor-4',{action:'hit'});wolfPose='attack';combatFx?.burst({kind:'impact',at:{x:.28,y:.72},color:'#ff8866'});safeAudio(()=>AudioManager.play('hit'));}
  else if(event.kind==='defeat'){if(event.actorId==='actor-4')battleStage.setActor('actor-4',{action:'knockdown'});else wolfPose='dead';safeAudio(()=>AudioManager.play('victory'));}
  else if(event.kind==='flee')battleStage.setActor('actor-4',{action:'run'});
  $('battleState').textContent={ 'player-strike':'玩家攻击','wolf-counter':'狼反击','defeat':'倒地','flee':'已逃离','world-settlement':'世界结算' }[event.kind];
  await waitPresentation(matchMedia('(prefers-reduced-motion: reduce)').matches?0:380,ticket);
  if(ticket!==playbackEpoch)break;
  if(event.kind==='player-strike')whp=event.afterHealth;else if(['wolf-counter','world-settlement'].includes(event.kind))php=event.afterHealth;
  setHealth(php,whp);
 }
 playbackBusy=false;wolfPose=group.encounter.encounter?.wolfHealth===0?'dead':'idle';battleStage?.setActor('actor-4',{action:group.player.self.identity.alive?'idle':'knockdown'});paintReadings();
}
const client=createDemoClient({onState:acceptState,onStatus:showStatus,onReceipt:playReceipt,onBusy:paintReadings});
const handle=run=>{Promise.resolve().then(run).catch(error=>showStatus(error.message,true));};
const action=(id,type,payload=()=>({}))=>$(id).addEventListener('click',()=>handle(()=>client.submit(type,payload())));
$('npcDialogueText').addEventListener('input',()=>{npcDialogue.edit($('npcDialogueText').value,group,selectedActorId);paintNpcNegotiation();});
$('npcDialogueForm').addEventListener('submit',event=>{event.preventDefault();handle(async()=>{const pending=npcDialogue.generate(group,canWrite()&&!playbackBusy,selectedActorId);paintNpcNegotiation();await pending;paintNpcNegotiation();});});
$('npcDialogueCommit').addEventListener('click',()=>handle(()=>client.submit('PlayerDialogue',npcDialogue.command(group,canWrite()&&!playbackBusy,selectedActorId))));
$('npcDialogueAct').addEventListener('click',()=>handle(()=>{const p=npcDialogue.proposal(group,canWrite()&&!playbackBusy,selectedActorId);return client.submit(p.type,p.payload);}));
$('npcTermsForm').addEventListener('submit',event=>{event.preventDefault();handle(()=>{
 if(selectedActorId!=='actor-2'||!canWrite()||playbackBusy||!group.map.negotiation?.canPropose)throw Error('当前无法提议，请先靠近猎人和工具。');
 return client.submit('PlayerNegotiate',{targetId:'actor-2',terms:{repairAmount:Number($('npcRepair').value),loanTicks:Number($('npcLoan').value)}});
});});
for(const [id,action,permission] of [['npcAccept','accept','canAccept'],['npcDecline','decline','canDecline'],['npcClaim','claim','canClaim']])$(id).addEventListener('click',()=>handle(()=>{
 if(selectedActorId!=='actor-2'||!canWrite()||playbackBusy||!group.map.negotiation?.[permission])throw Error('当前约定无法进行这项操作。');
 return client.submit('PlayerAgreement',{targetId:'actor-2',agreementId:group.map.negotiation.agreement.id,action});
}));
$('socialText').addEventListener('input',()=>{socialTextComposer.edit($('socialText').value,group,selectedActorId);paintSocialText();});
$('socialTextReview').addEventListener('click',()=>{socialTextComposer.edit($('socialText').value,group,selectedActorId);paintSocialText();});
$('socialTextForm').addEventListener('submit',event=>{event.preventDefault();handle(()=>client.submit('PlayerInteract',socialTextComposer.command(group,canWrite()&&!playbackBusy,selectedActorId)));});
function locatePerson(id){
 if(!personNavigation(group,false,id).visible){showStatus('这位人物已不在当前视野内。',true);return;}
 mapFocusActorId=id;setMode('world');showPerson(id);$('mapFollowPlayer').hidden=false;
 $('stageContainer').scrollIntoView({block:'center',behavior:'instant'});
}
$('personLocate').addEventListener('click',()=>locatePerson(selectedActorId));
$('bagFindMerchant').addEventListener('click',()=>locatePerson('actor-3'));
$('mapFollowPlayer').addEventListener('click',()=>{mapFocusActorId=null;$('mapFollowPlayer').hidden=true;});
$('personApproach').addEventListener('click',()=>handle(()=>{
 const navigation=personNavigation(group,canWrite()&&!playbackBusy,selectedActorId);
 if(!navigation.canApproach)throw Error('当前无法前往，请检查视野、连接、距离、战斗或剩余命令。');
 mapFocusActorId=null;$('mapFollowPlayer').hidden=true;setMode('world');
 return client.submit('MarchSet',navigation.target);
}));
$('tabWorldBtn').addEventListener('click',()=>setMode('world'));$('tabSceneBtn').addEventListener('click',()=>setMode('scene'));$('tabBattleBtn').addEventListener('click',()=>setMode('battle'));
$('enterLocation').addEventListener('click',()=>setMode('scene'));$('battleReturn').addEventListener('click',()=>setMode('world'));
$('pauseMarch').addEventListener('click',()=>handle(()=>client.pause()));action('resumeMarch','MarchResume');
action('toVillage','MarchSet',()=>({x:4,y:7}));action('toForest','MarchSet',()=>({x:16,y:7}));
action('goCoordinate','MarchSet',()=>({x:Number($('targetX').value),y:Number($('targetY').value)}));
action('work','PlayerWork');action('rest','PlayerRest');
for(const [id,type,product] of [['buyFood','PlayerBuy','food'],['sellFood','PlayerSell','food'],['buyHerbs','PlayerBuy','herbs'],['sellHerbs','PlayerSell','herbs']])action(id,type,()=>({product,quantity:1}));
action('giftFood','PlayerGiftFood',()=>({recipientId:'actor-2'}));action('personGift','PlayerGiftFood',()=>({recipientId:'actor-2'}));
for(const socialAction of Object.keys(socialActionNames))$('social-'+socialAction).addEventListener('click',()=>handle(()=>{
 if(selectedActorId!=='actor-2'||!socialInteractionActions(group,canWrite()&&!playbackBusy)[socialAction])throw Error('当前无法执行，请检查人物、工具的距离与当前活动。');
 return client.submit('PlayerInteract',{targetId:'actor-2',action:socialAction,...(socialAction==='talk'?{topic:$('socialTopic').value}:{})});
}));
// Contextual entries reuse the same single-writer client and command DTOs.
// A stale open panel cannot submit after movement, disconnect or combat.
const contextual=(id,actor,permission,type,payload=()=>({}))=>$(id).addEventListener('click',()=>handle(()=>{
 if(!interactionActions(group,canWrite()&&!playbackBusy,actor)[permission])throw Error('当前状态无法执行这项操作。');
 return client.submit(type,payload());
}));
contextual('personWork','actor-1','work','PlayerWork');contextual('bagRest',null,'rest','PlayerRest');
for(const id of ['waitHour','bagWait'])$(id).addEventListener('click',()=>handle(()=>{
 if(!worldTimeView(group,canWrite()&&!playbackBusy).canWait)throw Error('当前无法等待，请先结束行军、战斗或待确认操作。');
 return client.submit('AdvanceTime',{ticks:6});
}));
$('personTrade').addEventListener('click',openTrade);$('bagTrade').addEventListener('click',openTrade);
$('closeTrade').addEventListener('click',()=>{$('tradePanel').hidden=true;});$('tradeQuantity').addEventListener('input',paintTrade);
for(const [product,key] of [['food','Food'],['herbs','Herbs']])for(const [kind,type] of [['buy','PlayerBuy'],['sell','PlayerSell']]){
 $('trade'+(kind==='buy'?'Buy':'Sell')+key).addEventListener('click',()=>handle(()=>{
  const quantity=Number($('tradeQuantity').value),actions=interactionActions(group,canWrite()&&!playbackBusy,'actor-3',quantity);
  if(!actions[product][kind])throw Error('请确认交易距离、数量与现有金币/物品。');
  return client.submit(type,{product,quantity});
 }));
}
action('beginEncounter','EncounterBegin');action('attack','EncounterAction',()=>({encounterId:group.encounter.encounter.encounterId,action:'attack'}));action('flee','EncounterAction',()=>({encounterId:group.encounter.encounter.encounterId,action:'flee'}));action('cancelEncounter','EncounterCancel',()=>({encounterId:group.encounter.encounter.encounterId}));
$('refreshWorld').addEventListener('click',()=>handle(()=>client.refresh()));$('retryPending').addEventListener('click',()=>handle(()=>client.retry()));
$('closePerson').addEventListener('click',closePerson);
$('tabBagBtn').addEventListener('click',()=>{$('bagPanel').hidden=!$('bagPanel').hidden;});$('closeBag').addEventListener('click',()=>{$('bagPanel').hidden=true;});
$('tabAudioBtn').addEventListener('click',()=>{safeAudio(()=>{AudioManager.init();const mute=AudioManager.toggleMute();$('tabAudioBtn').textContent=mute?'🔇 音效关闭':'🔊 音效开启';$('tabAudioBtn').setAttribute('aria-pressed',String(!mute));if(!mute)AudioManager.startBgm(currentMode);});});
$('skipPlayback').addEventListener('click',()=>{playbackEpoch++;playbackBusy=false;paintReadings();});
function mapClick(event,context=false){
 if(!group||currentMode!=='world')return;const rect=worldMapCanvas.getBoundingClientRect(),at={x:event.clientX-rect.left+worldCam.x,y:event.clientY-rect.top+worldCam.y};
 const person=worldRoamingNpcs.find(n=>Math.hypot(n.x-at.x,n.y-at.y)<28);
 if(person){showPerson(person.id);return;}if(context)return;
 const target={x:Math.floor(at.x/80),y:Math.floor(at.y/(920/12))};$('targetX').value=target.x;$('targetY').value=target.y;handle(()=>client.submit('MarchSet',target));
}
worldMapCanvas.addEventListener('click',event=>mapClick(event));worldMapCanvas.addEventListener('contextmenu',event=>{event.preventDefault();mapClick(event,true);});
window.addEventListener('keydown',event=>{if(event.target.matches('input,button,select,textarea')||event.repeat)return;const key=event.key.toLowerCase();if(key==='b'||key==='i')$('tabBagBtn').click();else if(key==='escape'){closePerson();$('bagPanel').hidden=true;$('tradePanel').hidden=true;}else if(key===' '&&currentMode==='world'){event.preventDefault();handle(()=>client.pause());}});
new ResizeObserver(resizeLayers).observe(stageContainer);window.addEventListener('resize',resizeLayers);
let lastFrame=performance.now(),fatalFrameError=false;
function loop(now){
 try{
  const delta=Math.min(.1,(now-lastFrame)/1000);lastFrame=now;globalPhase=now/1000%1;
  if(interpolation){const t=interpolation.duration?Math.min(1,(now-interpolation.start)/interpolation.duration):1;worldPlayer.x=interpolation.from.x+(interpolation.to.x-interpolation.from.x)*t;worldPlayer.y=interpolation.from.y+(interpolation.to.y-interpolation.from.y)*t;}
  const focused=group?.map.actors.find(a=>a.actorId===mapFocusActorId),center=focused?pixel(focused):worldPlayer;
  worldCam.x=Math.max(0,Math.min(WORLD_W-stageW,center.x-stageW/2));worldCam.y=Math.max(0,Math.min(WORLD_H-stageH,center.y-stageH/2));
  if(currentMode==='world')drawWorldMap(now);else if(currentMode==='scene')drawVillageScene(delta);else drawBattle(now);
 }catch(error){if(!fatalFrameError){fatalFrameError=true;console.error(error);showStatus('绘制失败：'+error.message,true);void client.stop().catch(()=>{});}}
 requestAnimationFrame(loop);
}
resizeLayers();requestAnimationFrame(loop);
handle(async()=>{await client.start();setMode(group.encounter.encounter?.status==='active'?'battle':'world');});
