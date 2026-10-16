const statusLabels = Object.freeze({
  succeeded:'已完成', rejected:'已拒绝', 'no-action':'未行动', settled:'日结记录', 'waiting-resolved':'等待结果已结算',
});
const locationLabels = Object.freeze({village:'村庄',forest:'森林'});

const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const integer = value => Number.isSafeInteger(value) && value >= 0;

// Keep the complete D4E4 response contract here so every consumer accepts the
// same identity, version, bounds, ordering, and byte-size guarantees.
export function validActivityView(view, world) {
  if (!exact(view,['apiVersion','activityViewVersion','perspective','simulationId','revision','tick','actors','window','entries']) ||
    view.apiVersion !== 1 || view.activityViewVersion !== 1 || view.perspective !== 'developer-world' ||
    view.simulationId !== world?.simulationId || view.revision !== world?.revision || view.tick !== world?.tick ||
    !Array.isArray(view.actors) || !Array.isArray(view.entries) ||
    !exact(view.window,['maxSourceEvents','maxEntries','sourceEventsConsidered','truncated']) ||
    view.window.maxSourceEvents !== 256 || view.window.maxEntries !== 64 || !integer(view.window.sourceEventsConsidered) ||
    view.window.sourceEventsConsidered > 256 || typeof view.window.truncated !== 'boolean' ||
    view.entries.length > 64 || view.actors.length > 16) return false;
  const actorIds = new Set();
  if (!view.actors.every(actor => exact(actor,['actorId','name']) && typeof actor.actorId === 'string' && actor.actorId.length > 0 &&
    typeof actor.name === 'string' && !actorIds.has(actor.actorId) && actorIds.add(actor.actorId))) return false;
  const statuses = new Set(['succeeded','rejected','no-action','settled','waiting-resolved']);
  const kinds = new Set(['npc-action','player-action','gift','daily-person','daily-population','waiting-result','encounter-end']);
  const evidence = new Set(['event-location','travel-receipt','successful-forest-encounter-rule','unknown','encounter-fact']);
  let previous = null;
  for (const entry of view.entries) {
    if (!exact(entry,['activityId','sourceEventSeq','sourceItemIndex','tick','actorIds','location','locationEvidence','kind','status','summary']) ||
      typeof entry.activityId !== 'string' || !Number.isSafeInteger(entry.sourceEventSeq) || entry.sourceEventSeq < 1 ||
      !integer(entry.sourceItemIndex) || !integer(entry.tick) || entry.tick > view.tick || !Array.isArray(entry.actorIds) ||
      !entry.actorIds.every(id => actorIds.has(id)) || ![null,'village','forest'].includes(entry.location) ||
      !evidence.has(entry.locationEvidence) || !kinds.has(entry.kind) || !statuses.has(entry.status) ||
      typeof entry.summary !== 'string' || entry.summary.length > 300 ||
      entry.activityId !== `event-${entry.sourceEventSeq}-item-${entry.sourceItemIndex}`) return false;
    if (previous && (entry.sourceEventSeq < previous.sourceEventSeq ||
      (entry.sourceEventSeq === previous.sourceEventSeq && entry.sourceItemIndex <= previous.sourceItemIndex))) return false;
    previous = entry;
  }
  return new TextEncoder().encode(JSON.stringify(view)).length <= 65536;
}

export function filterActivityEntries(entries, location) {
  if (location === null) return entries.slice();
  if (!['village','forest'].includes(location)) return [];
  return entries.filter(entry => entry.location === location);
}

export function buildPersonTrackingModel(snapshot, activity, actorId) {
  if (!snapshot || !activity || snapshot.simulationId !== activity.simulationId ||
    snapshot.revision !== activity.revision || snapshot.tick !== activity.tick) return null;
  if (actorId === 'all') return { selected:false, actor:null, entries:[], counts:{succeeded:0,rejected:0,'no-action':0,settled:0,'waiting-resolved':0}, latestFactTick:null,
    revision:snapshot.revision,tick:snapshot.tick };
  const actor = snapshot.actors.find(item => item.actorId === actorId);
  if (!actor) return null;
  const entries = activity.entries.filter(entry => entry.actorIds.includes(actorId));
  const counts = {succeeded:0,rejected:0,'no-action':0,settled:0,'waiting-resolved':0};
  for (const entry of entries) counts[entry.status]++;
  return { selected:true, actor:{actorId:actor.actorId,name:actor.name,occupation:actor.occupation,location:actor.location,alive:actor.alive},
    entries,counts,latestFactTick:entries.length ? Math.max(...entries.map(entry => entry.tick)) : null,
    revision:snapshot.revision,tick:snapshot.tick };
}

export function renderPersonTracking(panel, snapshot, activity, actorId) {
  const model = buildPersonTrackingModel(snapshot,activity,actorId);
  panel.replaceChildren();
  if (!model || !model.selected) { panel.hidden=true; return model; }
  panel.hidden=false;
  const title=document.createElement('h3'); title.textContent=`${model.actor.name} · 当前状态`;
  const state=document.createElement('p');
  const places={village:'村庄',forest:'森林'};
  const occupations={chief:'村长',hunter:'猎人',merchant:'商人',player:'玩家'};
  state.textContent=`${occupations[model.actor.occupation]??model.actor.occupation} · ${places[model.actor.location]??model.actor.location} · ${model.actor.alive?'存活':'已逝'} · revision ${model.revision} · tick ${model.tick}`;
  const facts=document.createElement('p'); facts.textContent=`最近窗口（人物全部活动，不受地点筛选）：成功 ${model.counts.succeeded} · 拒绝 ${model.counts.rejected} · 未行动 ${model.counts['no-action']} · 日结 ${model.counts.settled} · 等待结果 ${model.counts['waiting-resolved']}`;
  const latest=document.createElement('p'); latest.textContent=model.latestFactTick===null?'最近事实：无活动记录':'最近事实：tick '+model.latestFactTick;
  panel.append(title,state,facts,latest);
  return model;
}

export async function readActivity(capabilities, world) {
  if (capabilities?.activityAvailable !== true) return null;
  const response = await fetch('/api/runtime/activities',{cache:'no-store',signal:AbortSignal.timeout(6000)});
  if (!response.ok) throw new Error('世界活动读取失败');
  const view = await response.json();
  if (!validActivityView(view,world)) throw new Error('世界活动投影不一致');
  return view;
}

export function mountActivityPanel(panel, location) {
  const list = panel.querySelector('[data-activity-list]');
  const count = panel.querySelector('[data-activity-count]');
  const actorFilter = panel.querySelector('[data-activity-actor]');
  let current = null;
  const render = () => {
    panel.hidden = current === null;
    if (!current) return;
    const entries = filterActivityEntries(current.entries,location);
    const prior = actorFilter.value;
    const all = document.createElement('option'); all.value = 'all'; all.textContent = '全部人物';
    actorFilter.replaceChildren(all,...current.actors.map(actor => {
      const option = document.createElement('option'); option.value = actor.actorId; option.textContent = actor.name; return option;
    }));
    actorFilter.value = current.actors.some(actor => actor.actorId === prior) ? prior : 'all';
    count.textContent = `${entries.filter(entry => actorFilter.value === 'all' || entry.actorIds.includes(actorFilter.value)).length} 条 · ` +
      `${current.window.truncated ? '最近窗口，历史已截断' : '当前来源窗口'} · 地点未知的旧记录请回地图查看`;
    renderActivityRows(list,entries,actorFilter.value,'all');
  };
  actorFilter.addEventListener('change',render);
  return {update(view) { current = view; render(); }};
}

export function renderActivityRows(list, entries, actorId, location) {
  const filtered = entries.filter(entry => (actorId === 'all' || entry.actorIds.includes(actorId)) &&
    (location === 'all' || (location === 'unknown' ? entry.location === null : entry.location === location)));
  const rows = filtered.map(entry => {
    const item = document.createElement('li'); item.dataset.activityId = entry.activityId;
    const headline = document.createElement('strong'); headline.textContent = entry.summary;
    const detail = document.createElement('small');
    const place = locationLabels[entry.location] ?? '地点未知';
    detail.textContent = `第 ${entry.tick} tick · ${place} · ${statusLabels[entry.status] ?? '已记录'} · 事实 ${entry.sourceEventSeq}`;
    item.append(headline,detail); return item;
  });
  if (!rows.length) { const empty = document.createElement('li'); empty.textContent = '当前筛选没有活动记录。'; rows.push(empty); }
  list.replaceChildren(...rows);
  return filtered.length;
}
