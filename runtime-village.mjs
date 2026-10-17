import { mountActivityPanel, readActivity } from './runtime-activity.mjs';
const byId = id => document.getElementById(id);
const nodes = Object.fromEntries(['village-status','village-revision','village-tick','village-food','village-location','village-life',
  'village-player-location','village-people','village-refresh','village-retry','village-travel','village-forest-link','village-command-status','village-receipt','village-receipt-details']
  .map(id => [id, byId(id)]));
const activityPanel = mountActivityPanel(byId('village-activity'),'village');
const PENDING_PREFIX = 'narraverse.village.pending.v1:';
const RECEIPT_FIELDS = ['apiVersion','receiptVersion','commandId','status','fromRevision','toRevision','fromTick','tick','durationTicks','type','outcome','result'];
const GIFT_REASONS = ['PLAYER_DEAD','ENCOUNTER_BUSY','RECIPIENT_DEAD','NOT_COLOCATED','NO_FOOD','RECIPIENT_FULL'];
const occupations = {chief:'村长',hunter:'猎人',merchant:'商人',player:'玩家'};
const conditions = {healthy:'健康',wounded:'受伤',dead:'已逝'};
let current = null, pending = null, fresh = false, submitting = false, highestRevision = -1, storageBlocked = false;
const safeInteger = n => Number.isSafeInteger(n) && n >= 0;
const exact = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const locationText = value => ({village:'村庄',forest:'森林'})[value] ?? value;
function canonicalCommand(dto) {
  return JSON.stringify({commandId:dto.commandId,expectedRevision:dto.expectedRevision,payload:dto.payload,type:dto.type,version:dto.version});
}
function commandIsValid(dto) {
  return exact(dto,['version','commandId','expectedRevision','type','payload']) && [3,4].includes(dto.version) &&
    typeof dto.commandId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(dto.commandId) && safeInteger(dto.expectedRevision) &&
    ((dto.type === 'PlayerGiftFood' && exact(dto.payload,['recipientId']) && dto.payload.recipientId === 'actor-2') ||
    (dto.type === 'PlayerTravel' && exact(dto.payload,['destination']) && ['forest','village'].includes(dto.payload.destination)));
}
function setCommandStatus(text, error = false) {
  nodes['village-command-status'].textContent = text;
  nodes['village-command-status'].dataset.state = error ? 'error' : 'ready';
}
function restorePending(simulationId) {
  try {
    const raw = localStorage.getItem(PENDING_PREFIX + simulationId);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    if (!exact(value,['simulationId','dto','body','fromTick']) || value.simulationId !== simulationId ||
      !commandIsValid(value.dto) || value.body !== canonicalCommand(value.dto) || !safeInteger(value.fromTick) ||
      value.fromTick > value.dto.expectedRevision) throw new Error('Invalid stored intent');
    return value;
  } catch {
    storageBlocked = true;
    setCommandStatus('本地待确认请求无法安全读取，操作已暂停。', true);
    return null;
  }
}
function savePending(value) {
  try {
    const key = PENDING_PREFIX + value.simulationId, raw = JSON.stringify(value);
    localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw) throw new Error('Pending intent was not stored');
    return true;
  } catch { storageBlocked = true; return false; }
}
function clearPending(command) {
  try { localStorage.removeItem(PENDING_PREFIX + command.simulationId); pending = null; }
  catch { storageBlocked = true; setCommandStatus('回执已确认，但本地请求无法清除；操作已暂停。', true); }
}
async function fetchJson(route) {
  const response = await fetch(route, {cache:'no-store',signal:AbortSignal.timeout(6000)});
  if (!response.ok) throw new Error('Read failed');
  return response.json();
}
function validMemory(memory, actorId, tick) {
  const gift = memory?.observable;
  return exact(memory,['memoryId','sourceEventSeq','occurrenceTick','observedTick','channel','importance','observable']) &&
    typeof memory.memoryId === 'string' && safeInteger(memory.sourceEventSeq) && memory.sourceEventSeq > 0 &&
    safeInteger(memory.occurrenceTick) && memory.occurrenceTick === memory.observedTick && memory.observedTick <= tick &&
    memory.channel === 'self' && memory.importance === 1 &&
    exact(gift,['type','donorId','recipientId','product','quantity','direction','commandId']) && gift.type === 'food-gift' &&
    gift.donorId === 'actor-4' && gift.recipientId === actorId && gift.product === 'food' && gift.quantity === 1 &&
    gift.direction === 'received' && typeof gift.commandId === 'string';
}
function coherent(cap, scene, player, encounter) {
  if (!(cap?.apiVersion === 1 && [3,4].includes(cap.commandDtoVersion) &&
    (cap.commandDtoVersion === 4 ? cap.playerWorkAvailable === true : cap.playerWorkAvailable !== true) &&
    (cap.playerWorkAvailable === undefined || typeof cap.playerWorkAvailable === 'boolean') && cap.sceneAvailable === true && cap.encounterAvailable === true &&
    cap.playerAvailable === true && typeof cap.writes === 'boolean' && scene?.apiVersion === 1 && scene.sceneViewVersion === 1 &&
    player?.apiVersion === 1 && encounter?.apiVersion === 1 && encounter.encounterViewVersion === 1 &&
    typeof scene.simulationId === 'string' && scene.simulationId.length > 0 && safeInteger(scene.revision) && safeInteger(scene.tick) &&
    [player,encounter].every(view => view.simulationId === scene.simulationId && view.revision === scene.revision && view.tick === scene.tick) &&
    ['village','forest'].includes(scene.location) && exact(scene.self,['actorId','alive','food']) && scene.self.actorId === 'actor-4' &&
    typeof scene.self.alive === 'boolean' && safeInteger(scene.self.food) && player.self?.identity?.actorId === 'actor-4' &&
    player.self.identity.alive === scene.self.alive && player.self.identity.location === scene.location &&
    player.self.inventory?.food === scene.self.food && encounter.self?.alive === scene.self.alive &&
    encounter.self.location === scene.location && (encounter.encounter === null || typeof encounter.encounter === 'object') &&
    Array.isArray(scene.actors) && (scene.location === 'village' || scene.actors.length === 0))) return false;
  const ids = new Set();
  return scene.actors.every(actor => {
    if (!(exact(actor,['actorId','name','occupation','location','alive','condition','receivedGifts','gift']) &&
      typeof actor.actorId === 'string' && actor.actorId !== 'actor-4' && !ids.has(actor.actorId) && typeof actor.name === 'string' &&
      typeof actor.occupation === 'string' && actor.location === scene.location && typeof actor.alive === 'boolean' &&
      (actor.alive ? ['healthy','wounded'].includes(actor.condition) : actor.condition === 'dead') &&
      Array.isArray(actor.receivedGifts) && actor.receivedGifts.every(memory => validMemory(memory, actor.actorId, scene.tick)) &&
      exact(actor.gift,['available','reasonCode']) && typeof actor.gift.available === 'boolean' &&
      (actor.gift.available ? actor.gift.reasonCode === null : typeof actor.gift.reasonCode === 'string'))) return false;
    ids.add(actor.actorId); return true;
  });
}
function canWrite() { return fresh && current?.cap.writes === true && !pending && !submitting && !storageBlocked; }
function controls() {
  const scene = current?.scene, active = current?.encounter.encounter?.status === 'active';
  nodes['village-refresh'].disabled = submitting;
  nodes['village-retry'].hidden = pending === null;
  nodes['village-retry'].disabled = pending === null || submitting || storageBlocked || current?.cap.writes !== true;
  nodes['village-travel'].disabled = !canWrite() || !scene?.self.alive || active;
  for (const button of nodes['village-people'].querySelectorAll('[data-action="gift"]')) {
    const actor = scene?.actors.find(row => row.actorId === button.dataset.recipientId);
    button.disabled = !canWrite() || !actor?.gift.available;
  }
}
function render() {
  if (!current) { controls(); return; }
  const {scene,encounter} = current;
  nodes['village-revision'].textContent = String(scene.revision);
  nodes['village-tick'].textContent = String(scene.tick);
  nodes['village-food'].textContent = String(scene.self.food);
  nodes['village-location'].textContent = locationText(scene.location);
  nodes['village-player-location'].textContent = locationText(playerLocation(current.player));
  nodes['village-life'].textContent = scene.self.alive ? '存活' : '已逝 · 身份与记忆保留';
  nodes['village-travel'].textContent = scene.location === 'village' ? '前往森林 · 12 tick' : '返回村庄 · 12 tick';
  const items = scene.actors.map(actor => {
    const item = document.createElement('li'); item.dataset.actorId = actor.actorId; item.id = actor.actorId;
    const heading = document.createElement('div'); heading.className = 'person-heading';
    const name = document.createElement('h3'); name.textContent = actor.name; heading.append(name);
    if (actor.actorId === 'actor-2') {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = '赠 1 份口粮';
      button.dataset.action = 'gift'; button.dataset.recipientId = actor.actorId;
      button.addEventListener('click', () => start('PlayerGiftFood', {recipientId:actor.actorId})); heading.append(button);
    }
    const detail = document.createElement('p'); detail.className = 'person-detail';
    detail.textContent = `${occupations[actor.occupation] ?? actor.occupation} · ${locationText(actor.location)} · ${actor.alive ? '存活' : '已逝'} · ${conditions[actor.condition]}`;
    item.append(heading,detail);
    if (actor.actorId === 'actor-2' && !actor.gift.available) {
      const reason = document.createElement('p'); reason.className = 'gift-availability'; reason.textContent = `赠粮不可用：${actor.gift.reasonCode}`; item.append(reason);
    }
    const memories = document.createElement('ul'); memories.className = 'gift-memories'; memories.setAttribute('aria-label','本人收粮记忆');
    for (const memory of actor.receivedGifts) {
      const entry = document.createElement('li');
      const sentence = document.createElement('p');
      sentence.textContent = actor.alive ? '我记得，你给过我一份口粮。' : '生前记录：曾收到你赠的一份口粮。';
      const record = document.createElement('details'), summary = document.createElement('summary'), source = document.createElement('p');
      summary.textContent = '查看记忆记录';
      source.textContent = `发生时刻：${memory.occurrenceTick} tick；来源事实：${memory.sourceEventSeq}；请求编号：${memory.observable.commandId}`;
      record.append(summary,source); entry.append(sentence,record);
      memories.append(entry);
    }
    if (!actor.receivedGifts.length) { const entry = document.createElement('li'); entry.textContent = '尚无来自玩家的收粮记忆。'; memories.append(entry); }
    item.append(memories); return item;
  });
  if (!items.length) { const empty = document.createElement('li'); empty.textContent = '玩家当前在森林，村庄人物不在同地点；返回村庄后可查看。'; items.push(empty); }
  nodes['village-people'].replaceChildren(...items);
  activityPanel.update(current.activity);
  document.documentElement.dataset.revision = String(scene.revision);
  if (fresh) {
    nodes['village-status'].dataset.state = 'ready';
    nodes['village-status'].textContent = !scene.self.alive ? '玩家已逝，场景仅供查看。' : encounter.encounter?.status === 'active' ?
      '遭遇进行中，赠粮与旅行已暂停；可进入森林查看同一场遭遇。' : '已更新村庄读数，刷新不会推进时间。';
  }
  controls();
}
function playerLocation(player) { return player?.self?.identity?.location ?? '未知'; }
async function refresh() {
  fresh = false; controls();
  nodes['village-status'].textContent = '正在读取村庄读数…';
  try {
    const [cap,scene,player,encounter] = await Promise.all(['/api/runtime/capabilities','/api/runtime/scene','/api/runtime/player','/api/runtime/encounter'].map(fetchJson));
    if (!coherent(cap,scene,player,encounter) || (current && scene.simulationId !== current.scene.simulationId) || scene.revision < highestRevision)
      throw new Error('Incoherent or late world projection');
    if (cap.activityAvailable !== undefined && typeof cap.activityAvailable !== 'boolean') throw new Error('Unknown activity capability');
    const activity = await readActivity(cap,scene);
    highestRevision = scene.revision; current = {cap,scene,player,encounter,activity};
    if (!pending && !storageBlocked) pending = restorePending(scene.simulationId);
    fresh = true; render();
    if (pending) setCommandStatus('发现结果未确认的请求；只有点击重试才会发送同一完整请求。');
  } catch {
    fresh = false; render();
    nodes['village-status'].dataset.state = 'error';
    nodes['village-status'].textContent = current ? '读数不一致、迟到或连接中断；保留上次完整读数，操作已暂停。' : '尚未取得一致的世界读数，操作已暂停。';
  }
}
function validTravelResult(result, command, receipt) {
  const stateFields = ['location','fatigue','wallet','inventory','publicStock','communalGold'];
  const validState = value => exact(value,stateFields) && ['village','forest'].includes(value.location) &&
    [value.fatigue,value.wallet,value.communalGold].every(safeInteger) && [value.inventory,value.publicStock].every(stock =>
      exact(stock,['food','herbs']) && safeInteger(stock.food) && safeInteger(stock.herbs));
  return exact(result,['actorId','type','startTick','endTick','product','quantity','unitPrice','amount','before','after']) &&
    result.actorId === 'actor-4' && result.type === 'PlayerTravel' && result.startTick === receipt.fromTick && result.endTick === receipt.tick &&
    result.product === null && result.quantity === 0 && result.unitPrice === 0 && result.amount === 0 &&
    validState(result.before) && validState(result.after) && result.before.location !== command.payload.destination && result.after.location === command.payload.destination;
}
function receiptIsValid(receipt, saved) {
  const command = saved.dto;
  if (!(exact(receipt,RECEIPT_FIELDS) && receipt.apiVersion === 1 && receipt.receiptVersion === command.version && receipt.status === 'committed' &&
    receipt.commandId === command.commandId && receipt.type === command.type && receipt.fromRevision === command.expectedRevision &&
    receipt.fromTick === saved.fromTick && [receipt.fromRevision,receipt.toRevision,receipt.fromTick,receipt.tick,receipt.durationTicks].every(safeInteger) &&
    receipt.tick === receipt.fromTick + receipt.durationTicks && receipt.toRevision === receipt.fromRevision + (receipt.durationTicks === 0 ? 1 : receipt.durationTicks) &&
    ['succeeded','rejected'].includes(receipt.outcome))) return false;
  if (command.type === 'PlayerGiftFood') {
    const result = receipt.result;
    return receipt.durationTicks === 0 && exact(result,['donorId','recipientId','product','quantity','sourceEventSeq','reasonCode']) &&
      result.donorId === 'actor-4' && result.recipientId === command.payload.recipientId && result.product === 'food' && result.quantity === 1 &&
      (receipt.outcome === 'succeeded' ? safeInteger(result.sourceEventSeq) && result.sourceEventSeq > 0 && result.reasonCode === null :
        result.sourceEventSeq === null && GIFT_REASONS.includes(result.reasonCode));
  }
  if (receipt.outcome === 'rejected') return exact(receipt.result,['code']) && ['ENCOUNTER_BUSY','PLAYER_DEAD','RULE_REJECTED'].includes(receipt.result.code) &&
    (receipt.result.code === 'ENCOUNTER_BUSY' ? receipt.durationTicks === 0 : [0,12].includes(receipt.durationTicks));
  return receipt.durationTicks === 12 && validTravelResult(receipt.result,command,receipt);
}
async function sendPending() {
  if (!pending || submitting || storageBlocked || !current || current.cap.writes !== true || pending.simulationId !== current.scene.simulationId) return;
  if (pending.dto.version !== current.cap.commandDtoVersion) {
    setCommandStatus('待确认请求版本与当前世界能力不匹配；保留请求并暂停发送。', true); return;
  }
  const command = pending; submitting = true; fresh = false; controls(); setCommandStatus('正在提交已保存的固定请求…');
  nodes['village-status'].textContent = '请求正在等待确认；显示上一组完整读数，其他操作已暂停。';
  try {
    const response = await fetch('/api/runtime/commands', {method:'POST',headers:{'Content-Type':'application/json'},body:command.body,
      cache:'no-store'});
    if (response.status === 409 || [400,405,413,415].includes(response.status)) {
      clearPending(command);
      setCommandStatus(response.status === 409 ? '世界修订或请求冲突（HTTP 409）；旧意图已清除，请读取后明确选择操作。' :
        `服务明确拒绝请求（HTTP ${response.status}）；旧意图已清除。`, true);
      await refresh(); return;
    }
    let receipt = null; try { receipt = JSON.parse(await response.text()); } catch { /* An unconfirmed response retains the original intent. */ }
    if (!response.ok || !receiptIsValid(receipt,command)) {
      setCommandStatus(`结果未确认（HTTP ${response.status}，${response.ok ? '回执不匹配' : '服务未完成'}）；保留原请求，请明确点击重试。`, true); return;
    }
    highestRevision = Math.max(highestRevision,receipt.toRevision);
    nodes['village-receipt'].textContent = JSON.stringify(receipt,null,2); nodes['village-receipt'].hidden = false;
    nodes['village-receipt-details'].hidden = false;
    clearPending(command);
    const reason = receipt.result?.reasonCode ?? receipt.result?.code;
    const operation = receipt.type === 'PlayerGiftFood' ? '赠粮' : '旅行';
    setCommandStatus(`${operation}：${receipt.outcome === 'succeeded' ? '已完成' : '已拒绝'}${reason ? '（' + reason + '）' : ''}；修订 ${receipt.fromRevision} → ${receipt.toRevision}，tick ${receipt.fromTick} → ${receipt.tick}。`, receipt.outcome === 'rejected');
    await refresh();
  } catch { setCommandStatus('连接中断，结果尚未确认；保留原请求，请明确点击重试。', true); }
  finally { submitting = false; render(); }
}
function start(type,payload) {
  if (!canWrite() || !current.scene.self.alive || current.encounter.encounter?.status === 'active') return;
  if (type === 'PlayerGiftFood' && !current.scene.actors.find(actor => actor.actorId === payload.recipientId)?.gift.available) return;
  const dto = {version:current.cap.commandDtoVersion,commandId:crypto.randomUUID(),expectedRevision:current.scene.revision,type,payload};
  const value = {simulationId:current.scene.simulationId,dto,body:canonicalCommand(dto),fromTick:current.scene.tick};
  if (!commandIsValid(dto) || !savePending(value)) { setCommandStatus('浏览器无法保存待确认请求，操作未发送。', true); controls(); return; }
  pending = value; void sendPending();
}
nodes['village-refresh'].addEventListener('click', () => { void refresh(); });
nodes['village-retry'].addEventListener('click', () => { void sendPending(); });
nodes['village-travel'].addEventListener('click', () => start('PlayerTravel',{destination:current?.scene.location === 'village' ? 'forest' : 'village'}));
void refresh();
