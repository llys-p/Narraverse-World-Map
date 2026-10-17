const ACTION_TYPE = 'EncounterAction';
const EVENT_KINDS = new Set(['player-strike', 'wolf-counter', 'world-settlement', 'defeat', 'flee']);
const asText = value => typeof value === 'string' ? value : '';
const integer = value => Number.isSafeInteger(value) && value >= 0;

function one(root, selector) { return root.querySelector(selector); }

export function mountCampaignBattle({ element, onCommand, onStateChange } = {}) {
  if (!element || typeof element.replaceChildren !== 'function') throw new TypeError('element must be a DOM container');
  if (typeof onCommand !== 'function') throw new TypeError('onCommand must be a function');

  if (!document.querySelector('link[data-campaign-battle-style]')) {
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/runtime-campaign-battle.css';
    style.dataset.campaignBattleStyle = 'true'; document.head.append(style);
  }

  element.classList.add('campaign-battle');
  element.setAttribute('aria-label', '回合制战斗');
  element.innerHTML = `
    <div class="cb-shell">
      <header class="cb-heading"><div><p class="cb-eyebrow">WORLD MAP · ENCOUNTER</p><h1>遭遇战</h1></div>
        <button class="cb-map-return" type="button" data-action="map">返回地图</button></header>
      <section class="cb-arena" aria-label="战场">
        <canvas class="cb-atmosphere" aria-hidden="true"></canvas>
        <div class="cb-spot cb-player-spot"><div class="cb-status-card cb-player-card"><strong data-player-name>玩家</strong><span>HP <b data-player-hp>—</b></span><div class="cb-hp-track"><i data-player-fill></i></div></div>
          <canvas class="cb-player-art" aria-hidden="true"></canvas><div class="cb-shadow"></div></div>
        <div class="cb-vs" aria-hidden="true">VS</div>
        <div class="cb-spot cb-wolf-spot"><div class="cb-status-card cb-wolf-card"><strong data-wolf-name>遭遇狼</strong><span>HP <b data-wolf-hp>—</b></span><div class="cb-hp-track"><i data-wolf-fill></i></div></div>
          <canvas class="cb-wolf-art" aria-hidden="true"></canvas><div class="cb-shadow"></div></div>
        <p class="cb-empty" data-empty>等待森林中的当前遭遇。</p>
        <div class="cb-flash" aria-hidden="true"></div>
      </section>
      <section class="cb-console" aria-label="战斗指令">
        <div class="cb-message" data-message role="status" aria-live="polite">读取同一世界修订后显示战场。</div>
        <div class="cb-menu" data-menu>
          <button type="button" data-action="begin">开始遭遇</button>
          <button type="button" data-action="attack">攻击</button>
          <button type="button" data-action="flee">逃跑</button>
          <button type="button" data-action="cancel">取消遭遇</button>
        </div>
        <div class="cb-target" data-target hidden><p>选择攻击目标</p><button type="button" data-action="target">遭遇狼 · 当前真实目标</button><div class="cb-inline-actions"><button type="button" data-action="back">返回指令</button></div></div>
        <div class="cb-confirm" data-confirm hidden><p data-confirm-text>确认攻击目标？</p><div class="cb-inline-actions"><button type="button" data-action="confirm">确认</button><button type="button" data-action="back">返回</button></div></div>
        <div class="cb-playback" data-playback hidden><button type="button" data-action="skip">跳过表现</button><button type="button" data-action="stop">停止并显示确认状态</button></div>
        <div class="cb-events" data-events aria-live="polite"></div>
        <details class="cb-receipt"><summary>查看完整服务回执</summary><pre data-receipt>尚无回执。</pre></details>
      </section>
    </div>`;

  const arena = one(element, '.cb-arena');
  const atmosphere = one(element, '.cb-atmosphere');
  const atmosphereCtx = atmosphere.getContext('2d');
  const canvas = one(element, '.cb-player-art');
  const playerHp = one(element, '[data-player-hp]');
  const wolfHp = one(element, '[data-wolf-hp]');
  const playerFill = one(element, '[data-player-fill]');
  const wolfFill = one(element, '[data-wolf-fill]');
  const playerName = one(element, '[data-player-name]');
  const wolfName = one(element, '[data-wolf-name]');
  const message = one(element, '[data-message]');
  const menu = one(element, '[data-menu]');
  const target = one(element, '[data-target]');
  const confirm = one(element, '[data-confirm]');
  const playback = one(element, '[data-playback]');
  const eventsNode = one(element, '[data-events]');
  const receiptNode = one(element, '[data-receipt]');
  const empty = one(element, '[data-empty]');
  const playerSpot = one(element, '.cb-player-spot');
  const wolfSpot = one(element, '.cb-wolf-spot');
  const wolfCanvas = one(element, '.cb-wolf-art');
  const flash = one(element, '.cb-flash');
  let stage = null;
  try { stage = window.DemoStickman?.createStage(canvas, { height: 370, ground: true, bg: null }) ?? null; } catch { stage = null; }
  const wolfAsset = window.StickArt?.get('shadow_wolf') ?? null;
  const wolfCtx = wolfCanvas.getContext('2d');
  const wolfOffscreen = document.createElement('canvas');
  const wolfOffCtx = wolfOffscreen.getContext('2d');
  if (wolfAsset?.size) { wolfOffscreen.width = wolfAsset.size.width; wolfOffscreen.height = wolfAsset.size.height; }

  let group = null, groupKey = null, mode = 'menu', chosenTarget = false;
  let requestBusy = false, animationBusy = false, suppressPendingPlayback = false;
  let epoch = 0, frameId = 0, timerId = 0, playbackToken = 0, seenReceipts = new Set();
  let playerValue = null, wolfValue = null, wolfPose = 'idle', wolfPhase = 0;

  const emitState = () => onStateChange?.(requestBusy || animationBusy);
  function commandLocked() { return requestBusy || animationBusy; }
  function forestGroup(value) {
    const location = value?.player?.self?.identity?.location ?? value?.encounter?.self?.location;
    const current = value?.encounter?.encounter;
    return location === 'forest' && current && typeof current.encounterId === 'string' && current.encounterId.length > 0 ? current : null;
  }
  function playerFields(value) {
    const self = value?.player?.self;
    return {
      name: asText(self?.identity?.name) || '玩家',
      id: asText(self?.identity?.actorId) || 'actor-4',
      location: self?.identity?.location ?? value?.encounter?.self?.location ?? null,
      hp: integer(value?.encounter?.self?.health) ? value.encounter.self.health : integer(self?.health) ? self.health : null,
      alive: typeof value?.encounter?.self?.alive === 'boolean' ? value.encounter.self.alive : self?.identity?.alive === true
    };
  }
  function setBar(node, fill, value, max) {
    node.textContent = integer(value) ? String(value) : '—';
    const ratio = integer(value) && integer(max) && max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    fill.style.width = `${ratio * 100}%`;
    fill.setAttribute('aria-valuenow', String(integer(value) ? value : 0));
    fill.setAttribute('aria-valuemax', String(integer(max) ? max : 0));
  }
  function setHealth(p, w) {
    const actor = playerFields(group);
    const encounter = forestGroup(group);
    const pmax = integer(group?.encounter?.self?.maxHealth) ? group.encounter.self.maxHealth : 1000;
    const wmax = integer(encounter?.maxHealth) ? encounter.maxHealth : 300;
    playerValue = integer(p) ? p : null;
    wolfValue = integer(w) ? w : null;
    setBar(playerHp, playerFill, playerValue, pmax);
    setBar(wolfHp, wolfFill, wolfValue, wmax);
    playerName.textContent = actor.name;
    wolfName.textContent = asText(encounter?.wolfName) || '遭遇狼';
  }
  function drawWolf() {
    const rect = wolfCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    if (wolfCanvas.width !== Math.round(width * dpr) || wolfCanvas.height !== Math.round(height * dpr)) {
      wolfCanvas.width = Math.round(width * dpr); wolfCanvas.height = Math.round(height * dpr);
    }
    wolfCtx.setTransform(dpr, 0, 0, dpr, 0, 0); wolfCtx.clearRect(0, 0, width, height);
    if (!forestGroup(group) || !wolfAsset || !wolfOffscreen.width) return;
    wolfOffCtx.clearRect(0, 0, wolfOffscreen.width, wolfOffscreen.height);
    try { window.StickArt.draw(wolfOffCtx, 'shadow_wolf', { action: wolfPose, phase: wolfPhase, facing: 'left', color: '#253d33' }); } catch { return; }
    const scale = Math.min(width / (wolfOffscreen.width * 1.08), height / (wolfOffscreen.height * 1.08));
    const drawW = wolfOffscreen.width * scale, drawH = wolfOffscreen.height * scale;
    wolfCtx.drawImage(wolfOffscreen, (width - drawW) / 2, height - drawH, drawW, drawH);
  }
  function drawAtmosphere() {
    const rect = atmosphere.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
    atmosphere.width = Math.round(width * dpr); atmosphere.height = Math.round(height * dpr);
    atmosphereCtx.setTransform(dpr, 0, 0, dpr, 0, 0); atmosphereCtx.clearRect(0, 0, width, height);
    const fog = atmosphereCtx.createLinearGradient(0, height * .54, 0, height * .96);
    fog.addColorStop(0, 'rgba(187, 190, 145, 0)'); fog.addColorStop(.52, 'rgba(187, 190, 145, .12)'); fog.addColorStop(1, 'rgba(187, 190, 145, 0)');
    atmosphereCtx.fillStyle = fog; atmosphereCtx.fillRect(0, height * .52, width, height * .45);
    for (let i = 0; i < 26; i++) {
      const x = (i * 137.5 + 31) % width, y = height * (.15 + ((i * 43) % 70) / 100);
      const radius = i % 5 === 0 ? 1.7 : .75;
      atmosphereCtx.beginPath(); atmosphereCtx.arc(x, y, radius, 0, Math.PI * 2);
      atmosphereCtx.fillStyle = i % 4 === 0 ? 'rgba(234, 211, 153, .48)' : 'rgba(205, 217, 176, .32)'; atmosphereCtx.fill();
    }
  }
  function renderCharacters() {
    const actor = playerFields(group), encounter = forestGroup(group);
    const present = !!encounter && actor.location === 'forest';
    empty.hidden = present;
    arena.classList.toggle('cb-no-encounter', !present);
    playerSpot.hidden = !present; wolfSpot.hidden = !present;
    if (present) {
      const action = !actor.alive ? 'knockdown' : encounter.resolution === 'win' ? 'victory' : 'idle';
      try { stage?.scene([{ id: actor.id, x: .50, scale: 1.72, color: '#e7c77e', action, prop: 'sword' }]); } catch { stage?.scene([{ id: actor.id, x: .50, scale: 1.72, color: '#e7c77e', action }]); }
      setHealth(actor.hp, encounter.wolfHealth);
      wolfPose = encounter.wolfHealth === 0 ? 'dead' : 'idle'; wolfPhase = 0; drawWolf();
    } else {
      stage?.scene([{ id: 'empty', hidden: true }]);
      setHealth(null, null); wolfCtx.clearRect(0, 0, wolfCanvas.width, wolfCanvas.height);
    }
    const map = group?.map;
    element.dataset.revision = String(group?.encounter?.revision ?? group?.snapshot?.revision ?? '');
    element.dataset.location = asText(actor.location);
    element.dataset.encounterId = asText(encounter?.encounterId);
    element.dataset.mapOrder = asText(map?.order?.status);
    element.dataset.contact = asText(map?.contact?.actorId);
  }
  function displayEvent(kind, text) {
    const line = document.createElement('p'); line.className = `cb-event cb-event-${kind}`; line.textContent = text;
    eventsNode.append(line);
  }
  function showMode(next) {
    mode = next;
    menu.hidden = next !== 'menu'; target.hidden = next !== 'target'; confirm.hidden = next !== 'confirm'; playback.hidden = next !== 'playback';
    renderButtons();
  }
  function renderButtons() {
    const current = forestGroup(group);
    const active = current?.status === 'active';
    const canWrite = group?.capabilities?.writes === true && Number.isSafeInteger(group?.capabilities?.commandDtoVersion) && group.capabilities.commandDtoVersion === 5;
    const actor = playerFields(group);
    for (const button of element.querySelectorAll('[data-action]')) {
      const action = button.dataset.action;
      let enabled = !commandLocked();
      if (['begin', 'attack', 'flee', 'cancel', 'target', 'confirm'].includes(action)) enabled &&= canWrite;
      if (action === 'begin') enabled &&= actor.alive && actor.location === 'forest' && !active && group?.encounter?.actions?.canBegin === true;
      if (['attack', 'flee', 'cancel'].includes(action)) enabled &&= actor.alive && actor.location === 'forest' && active;
      if (action === 'attack') enabled &&= integer(current?.wolfHealth) && current.wolfHealth > 0;
      if (action === 'target') enabled &&= active && mode === 'target';
      if (action === 'confirm') enabled &&= active && mode === 'confirm' && chosenTarget;
      if (action === 'skip' || action === 'stop') enabled = animationBusy;
      if (action === 'back') enabled = !commandLocked();
      button.disabled = !enabled;
    }
  }
  function cancelAnimation() {
    epoch++; playbackToken++;
    if (frameId) cancelAnimationFrame(frameId);
    if (timerId) clearTimeout(timerId);
    frameId = 0; timerId = 0;
    flash.classList.remove('cb-flashing'); playerSpot.classList.remove('cb-lunge', 'cb-hit', 'cb-fall');
    wolfSpot.classList.remove('cb-lunge', 'cb-hit', 'cb-fall');
    wolfPose = forestGroup(group)?.wolfHealth === 0 ? 'dead' : 'idle'; wolfPhase = 0;
    renderCharacters();
    if (animationBusy) { animationBusy = false; renderButtons(); emitState(); }
  }
  function finishPlayback(reason) {
    if (!animationBusy) return;
    cancelAnimation();
    const resolution = forestGroup(group)?.resolution;
    const ending = ({ win: '战斗胜利。', lose: '战斗失败。', flee: '已逃离遭遇。', 'player-died': '玩家倒下，遭遇结束。', cancel: '遭遇已取消。' })[resolution];
    message.textContent = ending ?? reason;
    showMode('menu');
  }
  function interpolateEvent(event, token, done) {
    const type = event.kind;
    const startPlayer = playerValue, startWolf = wolfValue;
    const afterPlayer = type === 'wolf-counter' ? event.afterHealth : startPlayer;
    const afterWolf = type === 'player-strike' ? event.afterHealth : startWolf;
    const duration = type === 'world-settlement' ? 760 : type === 'defeat' || type === 'flee' ? 640 : 920;
    if (type === 'player-strike') { playerSpot.classList.add('cb-lunge'); stage?.setActor(playerFields(group).id, { action: 'attack' }); wolfPose = 'hurt'; flash.classList.add('cb-flashing'); }
    else if (type === 'wolf-counter') { wolfSpot.classList.add('cb-lunge'); playerSpot.classList.add('cb-hit'); stage?.setActor(playerFields(group).id, { action: 'hit' }); wolfPose = 'attack'; flash.classList.add('cb-flashing'); }
    else if (type === 'defeat') {
      if (event.actorId === playerFields(group).id) { playerSpot.classList.add('cb-fall'); stage?.setActor(playerFields(group).id, { action: 'knockdown' }); }
      else wolfSpot.classList.add('cb-fall');
    } else if (type === 'flee') stage?.setActor(playerFields(group).id, { action: 'run' });
    const from = performance.now();
    const tick = now => {
      if (token !== epoch) return;
      const t = Math.min(1, (now - from) / duration);
      if (type === 'player-strike') setHealth(startPlayer, t >= .66 ? afterWolf : startWolf);
      else if (type === 'wolf-counter') setHealth(t >= .66 ? afterPlayer : startPlayer, startWolf);
      else if (type === 'world-settlement') {
        const actor = playerFields(group), encounter = forestGroup(group);
        const playerSettlement = event.actorId === actor.id;
        const wolfSettlement = event.actorId !== null && event.actorId === encounter?.wolfActorId;
        setHealth(t < 1 || !playerSettlement ? startPlayer : event.afterHealth,
          t < 1 || !wolfSettlement ? startWolf : event.afterHealth);
      }
      wolfPhase = t; drawWolf();
      if (t < 1) { frameId = requestAnimationFrame(tick); return; }
      frameId = 0; playerSpot.classList.remove('cb-lunge', 'cb-hit', 'cb-fall'); wolfSpot.classList.remove('cb-lunge', 'cb-hit', 'cb-fall');
      flash.classList.remove('cb-flashing'); wolfPose = forestGroup(group)?.wolfHealth === 0 ? 'dead' : 'idle';
      const actor = playerFields(group), encounter = forestGroup(group);
      stage?.setActor(actor.id, { action: !actor.alive ? 'knockdown' : encounter?.resolution === 'win' ? 'victory' : 'idle' });
      done();
    };
    frameId = requestAnimationFrame(tick);
  }
  function eventText(event) {
    const p = playerFields(group), wolf = forestGroup(group);
    const value = integer(event.beforeHealth) && integer(event.afterHealth) ? `${event.beforeHealth} → ${event.afterHealth}` : '按服务确认状态变化';
    if (event.kind === 'player-strike') return `玩家攻击遭遇狼 · 狼 HP ${value}`;
    if (event.kind === 'wolf-counter') return `遭遇狼反击玩家 · 玩家 HP ${value}`;
    if (event.kind === 'world-settlement') {
      const subject = event.actorId === p.id ? '玩家' : event.actorId !== null && event.actorId === wolf?.wolfActorId ? '遭遇狼' : '角色';
      return `世界结算影响${subject}健康 · HP ${value}`;
    }
    if (event.kind === 'defeat') return `${event.actorId === p.id ? '玩家' : '遭遇狼'}倒下`;
    if (event.kind === 'flee') return '已按服务回执结束遭遇并逃离';
    return '已确认战斗事件';
  }
  function playReceipt(receipt, command, resultGroup, allowPlayback = true) {
    const id = receipt?.commandId;
    if (!id || seenReceipts.has(id)) return false;
    seenReceipts.add(id);
    if (seenReceipts.size > 64) seenReceipts.delete(seenReceipts.values().next().value);
    const events = receipt?.outcome === 'succeeded' && receipt?.type === ACTION_TYPE && command?.type === ACTION_TYPE &&
      receipt.result?.encounterId === command.payload?.encounterId && Array.isArray(receipt.result.turnEvents) ? receipt.result.turnEvents : [];
    const validEvents = events.filter(event => event && EVENT_KINDS.has(event.kind) && (event.actorId === null || typeof event.actorId === 'string') &&
      (event.targetId === null || typeof event.targetId === 'string') && (event.beforeHealth === null || integer(event.beforeHealth)) &&
      (event.afterHealth === null || integer(event.afterHealth)));
    receiptNode.textContent = JSON.stringify(receipt, null, 2);
    if (!allowPlayback || receipt.outcome !== 'succeeded' || receipt.type !== ACTION_TYPE || !validEvents.length || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      message.textContent = receipt.outcome === 'succeeded' ? '命令已确认；已显示最新权威状态。' : '服务已拒绝命令；已显示最新权威状态。';
      renderCharacters(); return true;
    }
    eventsNode.replaceChildren();
    const initial = receipt.result.before;
    if (initial && integer(initial.playerHealth) && integer(initial.wolfHealth)) setHealth(initial.playerHealth, initial.wolfHealth);
    const token = ++epoch;
    playbackToken++;
    animationBusy = true; requestBusy = false; showMode('playback');
    message.textContent = '正在播放服务确认的战斗事件。';
    emitState();
    let index = 0;
    const step = () => {
      if (token !== epoch) return;
      if (index >= validEvents.length) { finishPlayback('事件播放完成；战斗状态来自最新确认回执。'); return; }
      const event = validEvents[index++];
      displayEvent(event.kind, eventText(event));
      interpolateEvent(event, token, () => { timerId = window.setTimeout(() => { timerId = 0; step(); }, 90); });
    };
    step();
    return true;
  }
  async function submit(type, payload) {
    if (commandLocked() || !group || group.capabilities?.writes !== true) return;
    cancelAnimation(); suppressPendingPlayback = false; requestBusy = true; renderButtons(); emitState();
    message.textContent = '正在提交指令；等待权威结果。';
    try {
      const result = await onCommand(type, payload);
      
      const receipt = result?.receipt, command = result?.command;
      const allowPlayback = !suppressPendingPlayback;
      suppressPendingPlayback = false;
      if (result?.group) sync(result.group);
      if (!receipt || !command) throw new Error('命令结果缺少已验证回执');
      requestBusy = false;
      if (type === ACTION_TYPE) playReceipt(receipt, command, result.group, allowPlayback);
      else {
        receiptNode.textContent = JSON.stringify(receipt, null, 2);
        message.textContent = receipt.outcome === 'succeeded' ? '遭遇状态已更新。' : '服务已拒绝该指令。';
        showMode('menu');
      }
      renderButtons(); emitState();
    } catch (error) {
      
      requestBusy = false; message.textContent = `指令未确认：${error instanceof Error ? error.message : '连接或验证失败'}`;
      showMode('menu'); renderButtons(); emitState();
    }
  }
  function sync(nextGroup) {
    if (!nextGroup || typeof nextGroup !== 'object') return;
    const revision = nextGroup.encounter?.revision ?? nextGroup.snapshot?.revision ?? null;
    const simulationId = nextGroup.encounter?.simulationId ?? nextGroup.snapshot?.simulationId ?? '';
    const tick = nextGroup.encounter?.tick ?? nextGroup.snapshot?.tick ?? null;
    const nextKey = `${simulationId}:${revision}:${tick}`;
    const oldRevision = group?.encounter?.revision ?? group?.snapshot?.revision;
    const oldSimulationId = group?.encounter?.simulationId ?? group?.snapshot?.simulationId;
    if (group && simulationId === oldSimulationId && Number.isSafeInteger(revision) && Number.isSafeInteger(oldRevision) && revision < oldRevision) return;
    if (groupKey !== null && nextKey !== groupKey) {
      cancelAnimation();
      eventsNode.replaceChildren();
      if (!requestBusy) showMode('menu');
      message.textContent = '世界修订已更新；旧动画已停止。';
    }
    if(nextKey===groupKey&&animationBusy){group=nextGroup;renderButtons();return;}
    group = nextGroup;
    groupKey = nextKey;
    renderCharacters();
    if (!requestBusy && !animationBusy) {
      const current = forestGroup(group);
      if (!current) { showMode('menu'); message.textContent = '玩家不在森林或当前没有遭遇；战场保持空态。'; }
      else if (current.status === 'active') message.textContent = `遭遇进行中 · ${current.encounterId}`;
      else message.textContent = `遭遇状态 · ${current.resolution ?? '已结束'}`;
    }
    renderButtons();
  }
  function onClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button || !element.contains(button)) return;
    const action = button.dataset.action;
    if (action === 'map') {
      if (requestBusy) suppressPendingPlayback = true;
      cancelAnimation(); showMode('menu');
      const hostButton = document.getElementById('campaign-back-to-map');
      if (hostButton && hostButton !== button) hostButton.click();
      else element.dispatchEvent(new CustomEvent('campaign-battle-close', { bubbles: true }));
      return;
    }
    if (action === 'skip' || action === 'stop') { finishPlayback(action === 'skip' ? '已跳过表现；权威战斗结果不变。' : '已停止表现；显示最新确认状态。'); return; }
    if (commandLocked()) return;
    if (action === 'begin') { void submit('EncounterBegin', {}); return; }
    if (action === 'attack') { chosenTarget = false; showMode('target'); message.textContent = '选择本次遭遇中的真实目标。'; return; }
    if (action === 'target') { chosenTarget = true; one(element, '[data-confirm-text]').textContent = `确认攻击${asText(forestGroup(group)?.wolfName) || '遭遇狼'}？`; showMode('confirm'); return; }
    if (action === 'confirm' && chosenTarget) { chosenTarget = false; void submit(ACTION_TYPE, { action: 'attack', encounterId: forestGroup(group)?.encounterId }); return; }
    if (action === 'flee') { void submit(ACTION_TYPE, { action: 'flee', encounterId: forestGroup(group)?.encounterId }); return; }
    if (action === 'cancel') { void submit('EncounterCancel', { encounterId: forestGroup(group)?.encounterId }); return; }
    if (action === 'back') { chosenTarget = false; showMode(mode === 'confirm' ? 'target' : 'menu'); return; }
  }
  function resize() { drawAtmosphere(); drawWolf(); try { stage?.resize(); } catch { /* Missing or stale drawing assets do not affect commands. */ } }
  const handlePageHide = () => { if (requestBusy) suppressPendingPlayback = true; cancelAnimation(); showMode('menu'); };
  element.addEventListener('click', onClick);
  window.addEventListener('resize', resize);
  window.addEventListener('pagehide', handlePageHide, { once: true });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  observer?.observe(arena);
  resize();
  renderButtons();
  return {
    sync,
    cancel() {
      if (requestBusy) suppressPendingPlayback = true;
      cancelAnimation();
      showMode('menu');
      message.textContent = '表现已停止；显示当前确认状态。';
    },
    get busy() { return requestBusy || animationBusy; }
  };
}
