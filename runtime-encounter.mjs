import { mountActivityPanel, readActivity } from './runtime-activity.mjs';
const byId = id => document.getElementById(id);
const nodes = Object.fromEntries(['scene-status','scene-revision','scene-tick','scene-player-health','scene-player-state',
  'scene-wolf-health','scene-wolf-count','encounter-state','encounter-begin','encounter-attack','encounter-flee',
  'encounter-cancel','encounter-refresh','encounter-retry','scene-command-status','scene-log','world-action-block','scene-player-location','scene-village-link']
  .map(id => [id, byId(id)]));
const activityPanel = mountActivityPanel(byId('forest-activity'),'forest');
const PENDING_KEY = 'narraverse.encounter.pending.v1';
const RECEIPTS_KEY = 'narraverse.encounter.receipts.v1';
const RECEIPT_FIELDS = ['apiVersion','receiptVersion','commandId','status','fromRevision','toRevision','fromTick','tick',
  'durationTicks','type','outcome','result'];
const ACTION_TYPES = {begin:'EncounterBegin',attack:'EncounterAction',flee:'EncounterAction',cancel:'EncounterCancel'};
let current = null, capabilities = null, pending = restorePending(), submitting = false, readingsFresh = false, receipts = restoreReceipts();

function safeInteger(value) { return Number.isSafeInteger(value) && value >= 0; }
function readJsonResponse(response, text) {
  try { return JSON.parse(text); } catch { return null; }
}
function restorePending() {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null');
    return value && [3,4].includes(value.version) && typeof value.commandId === 'string' && safeInteger(value.expectedRevision) &&
      typeof value.type === 'string' && value.payload && typeof value.payload === 'object' ? value : null;
  } catch { return null; }
}
function savePending(value) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(value)); return true; }
  catch { return false; }
}
function clearPending() {
  pending = null;
  try { sessionStorage.removeItem(PENDING_KEY); } catch { /* session storage may be unavailable */ }
}
function restoreReceipts() {
  try {
    const rows = JSON.parse(sessionStorage.getItem(RECEIPTS_KEY) ?? '[]');
    return Array.isArray(rows) ? rows.filter(row => row && row.receipt && Array.isArray(row.receiptKeys)).slice(-24) : [];
  } catch { return []; }
}
function saveReceipts() {
  try { sessionStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts.slice(-24))); } catch { /* UI history is optional */ }
}
function validateCapabilities(value) {
  return value?.apiVersion === 1 && [3,4].includes(value.commandDtoVersion) &&
    (value.commandDtoVersion === 4 ? value.playerWorkAvailable === true : value.playerWorkAvailable !== true) &&
    (value.playerWorkAvailable === undefined || typeof value.playerWorkAvailable === 'boolean') &&
    value.encounterAvailable === true && typeof value.writes === 'boolean';
}
async function fetchJson(path) {
  const response = await fetch(path, {cache:'no-store', signal:AbortSignal.timeout(6000)});
  const text = await response.text();
  return {response, text, json:readJsonResponse(response, text)};
}
function coherent(cap, player, encounter) {
  return validateCapabilities(cap) && player?.apiVersion === 1 && encounter?.apiVersion === 1 && encounter?.encounterViewVersion === 1 &&
    typeof player.simulationId === 'string' && player.simulationId === encounter.simulationId &&
    safeInteger(player.revision) && player.revision === encounter.revision && safeInteger(encounter.tick) && player.tick === encounter.tick &&
    player.self?.identity?.actorId === 'actor-4' && safeInteger(player.self?.health) &&
    typeof encounter.self?.alive === 'boolean' && encounter.self.alive === player.self.identity.alive &&
    encounter.self.health === player.self.health && encounter.self.location === player.self.identity.location && encounter.population &&
    safeInteger(encounter.population.availableWolves) && safeInteger(encounter.population.totalLivingWolves) &&
    (encounter.encounter === null || typeof encounter.encounter === 'object');
}
function displayWorld(player, view) {
  const encounter = view.encounter;
  nodes['scene-revision'].textContent = String(view.revision);
  nodes['scene-tick'].textContent = String(view.tick);
  nodes['scene-player-health'].textContent = String(view.self.health);
  nodes['scene-player-location'].textContent = player.self.identity.location === 'village' ? '村庄' : '森林';
  nodes['scene-village-link'].hidden = capabilities?.sceneAvailable !== true;
  nodes['scene-player-state'].textContent = view.self.alive ? '存活' : `已逝 · ${view.self.deathTick ?? '死亡时刻未知'}`;
  nodes['scene-wolf-count'].textContent = String(view.population.availableWolves);
  nodes['scene-wolf-health'].textContent = encounter ? String(encounter.wolfHealth) : '—';
  const active = encounter?.status === 'active';
  nodes['encounter-state'].textContent = !view.self.alive ? '玩家已逝' : active ? `遭遇进行中 · ${encounter.encounterId}` :
    encounter?.status === 'closed' ? `遭遇结束 · ${resolutionText(encounter.resolution)}` : '尚无遭遇';
  nodes['world-action-block'].hidden = !active;
  const canWrite = readingsFresh && capabilities?.writes === true;
  nodes['encounter-begin'].disabled = submitting || pending !== null || !canWrite || !view.self.alive || view.self.location !== 'forest' || active ||
    !view.actions?.canBegin || view.population.availableWolves < 1;
  for (const id of ['encounter-attack','encounter-flee','encounter-cancel'])
    nodes[id].disabled = submitting || pending !== null || !canWrite || !view.self.alive || !active;
  nodes['encounter-refresh'].disabled = submitting;
  nodes['encounter-retry'].hidden = pending === null || submitting;
  nodes['encounter-retry'].disabled = pending === null || submitting;
  nodes['scene-status'].textContent = !view.self.alive ? '玩家已逝，当前场景仅供查看。' :
    view.self.location !== 'forest' ? '玩家当前不在森林；可以查看世界状态。' : active ? '遭遇正在持续，刷新后会读取同一场遭遇。' :
    '森林状态来自同一修订的玩家与遭遇投影。';
  renderLog(encounter);
  activityPanel.update(current.activity);
}
function resolutionText(value) {
  return ({win:'胜利',lose:'失败',flee:'逃跑',cancel:'取消', 'player-died':'玩家死亡'})[value] ?? '无结果';
}
function encounterSummary(encounter) {
  if (!encounter) return '尚无持久遭遇记录。';
  return `${encounter.encounterId} · ${encounter.status === 'active' ? '进行中' : resolutionText(encounter.resolution)} · ` +
    `森林 · 起始 ${encounter.startTick} tick · 结束 ${encounter.endTick ?? '—'} · 狼 ${encounter.wolfHealth}/300 · ` +
    `攻击 ${encounter.attackCount} 次 · 场景经过 ${encounter.elapsedTicks} tick`;
}
function renderLog(encounter) {
  const rows = [
    {kind:'summary', text:`持久场景摘要：${encounterSummary(encounter)}`},
    ...receipts.map(row => ({kind:'receipt', text:`本页缓存的真实服务回执：${row.receipt.type} · ${row.receipt.outcome} · ` +
      `${row.receipt.fromRevision} → ${row.receipt.toRevision} · tick ${row.receipt.fromTick} → ${row.receipt.tick}`, receipt:row.receipt}))
  ];
  if (!rows.length) rows.push({kind:'summary', text:'尚无遭遇记录。'});
  const items = rows.map(row => {
    const item = document.createElement('li');
    const text = document.createElement('p'); text.textContent = row.text; item.append(text);
    if (row.receipt) { const details = document.createElement('pre'); details.textContent = JSON.stringify(row.receipt, null, 2); item.append(details); }
    return item;
  });
  nodes['scene-log'].replaceChildren(...items);
}
async function refresh() {
  readingsFresh = false;
  for (const id of ['encounter-begin','encounter-attack','encounter-flee','encounter-cancel']) nodes[id].disabled = true;
  nodes['scene-status'].textContent = '正在读取同一修订的玩家与遭遇状态…';
  try {
    const [cap, player, encounter] = await Promise.all([
      fetchJson('/api/runtime/capabilities'), fetchJson('/api/runtime/player'), fetchJson('/api/runtime/encounter')
    ]);
    if (![cap,player,encounter].every(item => item.response.ok) || !coherent(cap.json, player.json, encounter.json))
      throw new Error('世界投影版本或修订不一致');
    if (cap.json.activityAvailable !== undefined && typeof cap.json.activityAvailable !== 'boolean') throw new Error('未知世界活动能力');
    const activity = await readActivity(cap.json,player.json);
    if (current && encounter.json.revision < current.view.revision) {
      nodes['scene-status'].textContent = '忽略了迟到的旧读数；保留最后一组一致世界状态。';
      displayWorld(current.player, current.view);
      return;
    }
    capabilities = cap.json;
    current = {player:player.json, view:encounter.json, activity};
    readingsFresh = true;
    displayWorld(current.player, current.view);
    if (!pending && !submitting) nodes['scene-command-status'].textContent = '只读读取不会推进世界时间。';
  } catch {
    if (current) displayWorld(current.player, current.view);
    nodes['scene-status'].textContent = current ? '读取暂时失败，保留最后一组一致世界读数；操作已暂停。' : '连接失败，尚未取得一致的世界读数。';
    if (pending) nodes['scene-command-status'].textContent = '请求结果尚未确认；重试会使用同一完整请求。';
  }
}function makeCommand(action) {
  if (!readingsFresh || !current || pending || submitting || !capabilities) return null;
  const type = ACTION_TYPES[action];
  if (!type) return null;
  const payload = action === 'begin' ? {} : action === 'cancel' ? {encounterId:current.view.encounter?.encounterId} :
    {encounterId:current.view.encounter?.encounterId, action};
  if (action !== 'begin' && !payload.encounterId) return null;
  return {version:capabilities.commandDtoVersion, commandId:crypto.randomUUID(), expectedRevision:current.view.revision, type, payload};
}
function validEncounterResult(result, command, receipt) {
  const resultFields = ['actorId','encounterId','action','before','after','reasonCode'];
  const viewFields = ['tick','playerHealth','playerAlive','wolfHealth','totalLivingWolves','reservedWolves','availableWolves','battleDeaths','status','resolution'];
  const validView = view => view && typeof view === 'object' && !Array.isArray(view) && Object.keys(view).length === viewFields.length &&
    viewFields.every(key => Object.hasOwn(view,key)) && safeInteger(view.tick) && safeInteger(view.playerHealth) &&
    typeof view.playerAlive === 'boolean' && (view.wolfHealth === null || safeInteger(view.wolfHealth)) &&
    safeInteger(view.totalLivingWolves) && safeInteger(view.reservedWolves) && view.reservedWolves <= view.totalLivingWolves &&
    view.availableWolves === view.totalLivingWolves - view.reservedWolves && safeInteger(view.battleDeaths) &&
    ['none','active','closed'].includes(view.status) && [null,'win','lose','flee','cancel','player-died'].includes(view.resolution);
  const expectedAction = command.type === 'EncounterBegin' ? 'begin' : command.type === 'EncounterCancel' ? 'cancel' : command.payload.action;
  return result && typeof result === 'object' && !Array.isArray(result) && Object.keys(result).length === resultFields.length &&
    resultFields.every(key => Object.hasOwn(result,key)) && result.actorId === 'actor-4' && result.action === expectedAction &&
    (result.encounterId === null || (typeof result.encounterId === 'string' && result.encounterId.length > 0)) &&
    (command.type === 'EncounterBegin' || result.encounterId === command.payload.encounterId) &&
    (result.reasonCode === null || typeof result.reasonCode === 'string') &&
    ((receipt.outcome === 'succeeded' && result.reasonCode === null) || (receipt.outcome === 'rejected' && result.reasonCode !== null)) &&
    validView(result.before) && validView(result.after) && result.before.tick === receipt.fromTick && result.after.tick === receipt.tick;
}
function receiptIsValid(receipt, command) {
  if (!receipt || typeof receipt !== 'object' || Object.keys(receipt).sort().join('|') !== [...RECEIPT_FIELDS].sort().join('|')) return false;
  const duration = receipt.durationTicks;
  if (!(receipt.apiVersion === 1 && receipt.receiptVersion === command.version && receipt.commandId === command.commandId &&
    receipt.type === command.type && receipt.status === 'committed' && receipt.fromRevision === command.expectedRevision &&
    safeInteger(receipt.fromRevision) && safeInteger(receipt.toRevision) && safeInteger(receipt.fromTick) && safeInteger(receipt.tick) &&
    safeInteger(duration) && receipt.fromTick <= receipt.fromRevision && receipt.tick === receipt.fromTick + duration &&
    receipt.toRevision === receipt.fromRevision + (duration === 0 ? 1 : duration) && ['succeeded','rejected'].includes(receipt.outcome))) return false;
  return validEncounterResult(receipt.result, command, receipt);
}function describeReceipt(receipt) {
  const domain = receipt.result?.code ?? receipt.result?.reasonCode ?? receipt.result?.reason ?? null;
  const result = domain ? `（${domain}）` : '';
  return `${receipt.type}：${receipt.outcome === 'succeeded' ? '已完成' : '已拒绝'}${result}；修订 ${receipt.fromRevision} → ${receipt.toRevision}，tick ${receipt.fromTick} → ${receipt.tick}。`;
}
async function sendPending() {
  if (!pending || submitting) return;
  if (capabilities && pending.version !== capabilities.commandDtoVersion) {
    nodes['scene-command-status'].textContent = '待确认请求版本与当前世界能力不匹配；保留请求并暂停发送。'; return;
  }
  submitting = true;
  nodes['encounter-begin'].disabled = nodes['encounter-attack'].disabled = nodes['encounter-flee'].disabled = nodes['encounter-cancel'].disabled = true;
  nodes['encounter-retry'].hidden = true;
  nodes['scene-command-status'].textContent = '正在提交固定请求…';
  const command = pending;
  try {
    const response = await fetch('/api/runtime/commands', {method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(command), cache:'no-store'});
    const text = await response.text(), body = readJsonResponse(response, text);
    if (response.status === 409) {
      clearPending(); nodes['scene-command-status'].textContent = '世界版本冲突；已清除旧请求，请刷新后发起新操作。';
      await refresh(); return;
    }
    if ([400,405,413,415].includes(response.status)) {
      clearPending(); nodes['scene-command-status'].textContent = `服务明确拒绝请求（HTTP ${response.status}）。请刷新后发起新操作。`;
      await refresh(); return;
    }
    if (!response.ok || !receiptIsValid(body, command)) {
      nodes['scene-command-status'].textContent = response.ok ? '服务回执格式不符；保留请求以便安全重试。' :
        `连接未确认（HTTP ${response.status}）；保留请求以便安全重试。`;
      return;
    }
    receipts = [...receipts, {receipt:body, receiptKeys:Object.keys(body)}].slice(-24); saveReceipts(); clearPending();
    nodes['scene-command-status'].textContent = describeReceipt(body);
    await refresh();
  } catch {
    nodes['scene-command-status'].textContent = '连接中断，结果尚未确认；重试会再次发送同一请求。';
  } finally {
    submitting = false;
    if (current) displayWorld(current.player, current.view);
    nodes['encounter-retry'].hidden = pending === null;
    nodes['encounter-refresh'].disabled = false;
  }
}
function start(action) {
  const command = makeCommand(action);
  if (!command) return;
  if (!savePending(command)) { nodes['scene-command-status'].textContent = '浏览器无法保存待确认请求，操作未发送。'; return; }
  pending = command;
  void sendPending();
}
nodes['encounter-begin'].addEventListener('click', () => start('begin'));
nodes['encounter-attack'].addEventListener('click', () => start('attack'));
nodes['encounter-flee'].addEventListener('click', () => start('flee'));
nodes['encounter-cancel'].addEventListener('click', () => start('cancel'));
nodes['encounter-retry'].addEventListener('click', () => { pending = restorePending() ?? pending; void sendPending(); });
nodes['encounter-refresh'].addEventListener('click', refresh);
if (pending) nodes['scene-command-status'].textContent = '发现一项结果未确认；准备按原请求恢复。';
void refresh().then(() => {
  if (pending && capabilities && capabilities.sceneAvailable !== true) void sendPending();
  else if (pending) nodes['scene-command-status'].textContent = '请求结果尚未确认；只有点击重试才会再次发送原请求。';
});
