import { cloneData, requireCondition } from '../core/data-contract.mjs';
import { canonicalJson } from '../core/data-contract.mjs';
import { SCENE_RULES } from '../core/scene-runtime.mjs';
import { validateBundle } from '../core/world-state.mjs';
import { runtimeProfile } from './http-contract.mjs';

const MAX_SOURCE_EVENTS = 256;
const MAX_ENTRIES = 64;
const MAX_BYTES = 65536;
const ENTRY_KEYS = ['activityId','sourceEventSeq','sourceItemIndex','tick','actorIds','location','locationEvidence','kind','status','summary'];
const STATUS = new Set(['succeeded','rejected','no-action','settled','waiting-resolved']);
const ACTION_NAMES = Object.freeze({
  WorkForPay:'做工', Hunt:'狩猎', Rest:'休息', BuyFood:'买粮', BuyMedicine:'买药',
  UseMedicine:'用药', SellMedicine:'卖药', NoAction:'未行动', PlayerGiftFood:'赠粮',
  PlayerTravel:'旅行', PlayerRest:'休整', PlayerBuy:'买入', PlayerSell:'卖出',
  EncounterBegin:'遭遇开始', EncounterAction:'遭遇行动', EncounterCancel:'结束遭遇', AdvanceTime:'推进时间',
  attack:'攻击', flee:'逃跑',
});
const REASONS = Object.freeze({
  RULE_REJECTED:'规则拒绝', ENCOUNTER_BUSY:'遭遇进行中', PLAYER_DEAD:'玩家已死亡',
  RECIPIENT_DEAD:'收粮人已死亡', NOT_COLOCATED:'双方不在村庄', NO_FOOD:'玩家口粮不足',
  RECIPIENT_FULL:'收粮人库存已满', ENCOUNTER_UNAVAILABLE:'遭遇不存在', ENCOUNTER_CLOSED:'遭遇已结束',
  ENCOUNTER_ID_MISMATCH:'遭遇编号不匹配',
});
const integer = value => Number.isSafeInteger(value) && value >= 0;
const actorLabel = (actors, actorId) => actors.get(actorId) ?? '居民';
const actionLabel = action => ACTION_NAMES[action] ?? null;
const cleanIds = ids => [...new Set(ids.filter(id => typeof id === 'string'))].sort();

function addEntry(rows, event, fields) {
  if (!STATUS.has(fields.status)) return;
  const entry = {
    activityId:`event-${event.eventSeq}-item-${fields.sourceItemIndex}`,
    sourceEventSeq:event.eventSeq,
    sourceItemIndex:fields.sourceItemIndex,
    tick:event.tick,
    actorIds:cleanIds(fields.actorIds ?? []),
    location:['village','forest'].includes(fields.location) ? fields.location : null,
    locationEvidence:fields.locationEvidence ?? 'unknown',
    kind:fields.kind,
    status:fields.status,
    summary:fields.summary,
  };
  rows.push(entry);
}

function deltaSummary(delta) {
  const labels = {food:'口粮',herbs:'药材',wallet:'金币',health:'健康',fatigue:'疲劳'};
  return Object.entries(labels).flatMap(([key,label]) => {
    const value = delta?.[key];
    return Number.isSafeInteger(value) && value !== 0 ? [`${label}${value > 0 ? '+' : ''}${value}`] : [];
  });
}

function commandSummary(dto, receipt, actorName) {
  const result = receipt?.result;
  if (receipt?.outcome === 'rejected') {
    const typeName = actionLabel(dto?.payload?.action) ?? actionLabel(dto?.type) ?? '居民动作';
    return `${actorName}${typeName}：已拒绝（${REASONS[result?.reasonCode ?? result?.code] ?? '规则拒绝'}）`;
  }
  if (dto?.type === 'PlayerTravel' && ['village','forest'].includes(result?.before?.location) && ['village','forest'].includes(result?.after?.location))
    return `${actorName}旅行：${result.before.location === 'village' ? '村庄' : '森林'}→${result.after.location === 'village' ? '村庄' : '森林'}，已完成`;
  if (dto?.type === 'AdvanceTime' && integer(receipt?.fromTick) && integer(receipt?.tick) && integer(receipt?.durationTicks))
    return `${actorName}推进时间：tick ${receipt.fromTick}→${receipt.tick}（${receipt.durationTicks}刻）`;
  if (['EncounterBegin','EncounterAction','EncounterCancel'].includes(dto?.type)) {
    const action = dto.type === 'EncounterAction' ? actionLabel(dto?.payload?.action) : actionLabel(dto.type);
    const before = result?.before, after = result?.after;
    const facts = [];
    if (integer(before?.playerHealth) && integer(after?.playerHealth)) facts.push(`健康${before.playerHealth}→${after.playerHealth}`);
    if (integer(before?.wolfHealth) && integer(after?.wolfHealth)) facts.push(`狼血${before.wolfHealth}→${after.wolfHealth}`);
    const resolution = ({win:'胜利',lose:'失败',flee:'逃跑结束',cancel:'遭遇已结束','player-died':'玩家倒下'})[after?.resolution] ??
      (after?.status === 'active' ? '遭遇继续' : '结果已记录');
    return `${actorName}${action ?? '遭遇行动'}：${[...facts,resolution].join('，')}`;
  }
  if (['PlayerBuy','PlayerSell'].includes(dto?.type)) {
    const product = ({food:'口粮',herbs:'药材'})[result?.product];
    if (product && integer(result?.quantity)) return `${actorName}${dto.type === 'PlayerBuy' ? '买入' : '卖出'}${product}${result.quantity}份，已完成`;
  }
  const typeName = actionLabel(dto?.payload?.action) ?? actionLabel(dto?.type) ?? '居民动作';
  return `${actorName}${typeName}：已完成`;
}

/** A bounded, detached developer observation over the fully validated scene EventLog. */
export function projectWorldActivity(bundle) {
  const profile = runtimeProfile(bundle);
  requireCondition(profile.rulesVersion === SCENE_RULES && profile.serviceFormatVersion === 9,
    'World activity requires the scene profile', 'UNSUPPORTED_VERSION');
  validateBundle(bundle, {rulesVersion:profile.rulesVersion,systems:profile.systems});

  const events = bundle.eventLog;
  const sourceEvents = events.slice(-MAX_SOURCE_EVENTS);
  const actors = new Map(bundle.snapshot.world.actorModel.actors.map(actor => [actor.actorId, actor.name]));
  const sourceBySeq = new Map(sourceEvents.map(event => [event.eventSeq,event]));
  const allResolvedCommands = new Set(sourceEvents.filter(event => event.type === 'MotivationDecisionResolved' && event.payload.commandId !== null)
    .map(event => event.payload.commandId));
  const giftCommands = new Set(sourceEvents.filter(event => event.type === 'FoodGiftCommitted').map(event => event.commandId));
  const rows = [];

  for (const event of sourceEvents) {
    const p = event.payload;
    if (event.type === 'MotivationDecisionResolved') {
      const actorName = actorLabel(actors,p.actorId);
      const cause = event.causationEventSeqs.length === 1 ? sourceBySeq.get(event.causationEventSeqs[0]) : null;
      const plan = cause?.type === 'MotivationDecisionPlanned' && cause.payload.actorId === p.actorId ? cause.payload : null;
      const action = plan ? actionLabel(plan.choice) : null;
      const status = p.status === 'succeeded' || p.status === 'rejected' || p.status === 'no-action' ? p.status : null;
      const outcome = status === 'no-action' ? `${actorName}未行动` :
        `${actorName}${action ?? '动作未知'}：${status === 'succeeded' ? '已完成' : status === 'rejected' ? '已拒绝' : '结果已记录'}`;
      const deltas = status === 'succeeded' ? deltaSummary(p.delta) : [];
      addEntry(rows,event,{sourceItemIndex:0,actorIds:[p.actorId],location:null,locationEvidence:'unknown',
        kind:'npc-action',status,summary:deltas.length ? `${outcome}（${deltas.join('，')}）` : outcome});
    } else if (event.type === 'SocietyActionCommitted' && !allResolvedCommands.has(event.commandId)) {
      const action = actionLabel(p.action) ?? '居民行动';
      addEntry(rows,event,{sourceItemIndex:0,actorIds:[p.actorId,...(p.buyerId ? [p.buyerId] : [])],
        location:null,locationEvidence:'unknown',kind:'npc-action',status:'succeeded',
        summary:`${actorLabel(actors,p.actorId)}完成${action}`});
    } else if (event.type === 'FoodGiftCommitted') {
      addEntry(rows,event,{sourceItemIndex:0,actorIds:[p.donorId,p.recipientId],location:p.location,
        locationEvidence:'event-location',kind:'gift',status:'succeeded',
        summary:`${actorLabel(actors,p.donorId)}赠给${actorLabel(actors,p.recipientId)}1份口粮`});
    } else if (event.type === 'EncounterCommandResolved') {
      const dto = p.dto, receipt = p.receipt;
      if (dto?.type === 'PlayerGiftFood' && giftCommands.has(event.commandId)) continue;
      const status = receipt?.outcome === 'succeeded' ? 'succeeded' : receipt?.outcome === 'rejected' ? 'rejected' : null;
      if (!status) continue;
      const result = receipt.result;
      let location = null, locationEvidence = 'unknown';
      if (status === 'succeeded' && dto.type === 'PlayerTravel' && ['village','forest'].includes(result?.after?.location)) {
        location = result.after.location; locationEvidence = 'travel-receipt';
      } else if (status === 'succeeded' && typeof dto.type === 'string' && dto.type.startsWith('Encounter')) {
        // A fully replay-validated successful encounter command is admitted only in the
        // existing forest encounter domain; rejected commands carry no location evidence.
        location = 'forest'; locationEvidence = 'successful-forest-encounter-rule';
      }
      addEntry(rows,event,{sourceItemIndex:0,actorIds:['actor-4'],location,locationEvidence,
        kind:'player-action',status,summary:commandSummary(dto,receipt,actorLabel(actors,'actor-4'))});
    } else if (event.type === 'PlayerDaySettled') {
      addEntry(rows,event,{sourceItemIndex:0,actorIds:[p.actorId],location:null,locationEvidence:'unknown',
        kind:'daily-person',status:'settled',summary:`${actorLabel(actors,p.actorId)}日结：消耗${p.privateFood}份本人口粮`});
    } else if (event.type === 'SocietyDaySettled') {
      const dailyRows = Array.isArray(p.actors?.rows) ? [...p.actors.rows].sort((a,b) => a.actorId.localeCompare(b.actorId)) : [];
      let itemIndex = 0;
      for (const row of dailyRows) {
        if (row.actorId === 'actor-4' && row.died !== true) continue; // Consumption comes from the player's explicit daily fact below.
        if (row.actorId === 'actor-4') {
          addEntry(rows,event,{sourceItemIndex:itemIndex++,actorIds:[row.actorId],location:null,locationEvidence:'unknown',
            kind:'daily-person',status:'settled',summary:`${actorLabel(actors,row.actorId)}日结：本日死亡`});
          continue;
        }
        const summary = `${actorLabel(actors,row.actorId)}日结：口粮${integer(row.food)?row.food:0}份、药材${integer(row.herbs)?row.herbs:0}份${row.died === true ? '，本日死亡' : ''}`;
        addEntry(rows,event,{sourceItemIndex:itemIndex++,actorIds:[row.actorId],location:null,locationEvidence:'unknown',
          kind:'daily-person',status:'settled',summary});
      }
      const ecology = p.actors?.market?.ecology;
      for (const species of ['deer','wolves']) {
        const record = ecology?.[species];
        if (!record || !integer(record.opening) || !integer(record.closing)) continue;
        const name = species === 'deer' ? '鹿群' : '狼群';
        const changes = ['births','naturalDeaths','starvationDeaths','predation','hunted','battleDeaths']
          .filter(key => integer(record[key]) && record[key] > 0)
          .map(key => `${({births:'出生',naturalDeaths:'自然死亡',starvationDeaths:'饥饿死亡',predation:'被捕食',hunted:'被猎取',battleDeaths:'战斗死亡'})[key]}${record[key]}`);
        const ownership = species === 'wolves' ? ecology.encounterOwnership : null;
        let counts = `${record.opening}→${record.closing}可用群体`;
        if (ownership && integer(ownership.totalLivingOpening) && integer(ownership.totalLivingClosing) &&
          integer(ownership.reservedOpening) && integer(ownership.reservedClosing)) {
          counts = `总数${ownership.totalLivingOpening}→${ownership.totalLivingClosing}（可用${record.opening}→${record.closing}，保留${ownership.reservedOpening}→${ownership.reservedClosing}）`;
        }
        addEntry(rows,event,{sourceItemIndex:itemIndex++,actorIds:[],location:null,locationEvidence:'unknown',
          kind:'daily-population',status:'settled',summary:`${name}群体统计：${counts}${changes.length ? `（${changes.join('，')}）` : ''}`});
      }
    } else if (event.type === 'MemoryDaySettled' && p.waitingActorId !== null) {
      const delivered = p.waitingOutcome === 'delivered';
      const knownOutcome = delivered || p.waitingOutcome === 'failed';
      if (knownOutcome) addEntry(rows,event,{sourceItemIndex:0,actorIds:[p.waitingActorId],location:null,locationEvidence:'unknown',
        kind:'waiting-result',status:'waiting-resolved',summary:`${actorLabel(actors,p.waitingActorId)}等待结果${delivered ? '已送达' : '未送达'}`});
    } else if (event.type === 'EncounterTerminated') {
      addEntry(rows,event,{sourceItemIndex:0,actorIds:[p.actorId],location:'forest',locationEvidence:'encounter-fact',
        kind:'encounter-end',status:'settled',summary:`${actorLabel(actors,p.actorId)}在森林的遭遇因日结死亡结束`});
    }
  }

  rows.sort((a,b) => a.sourceEventSeq-b.sourceEventSeq || a.sourceItemIndex-b.sourceItemIndex);
  const truncated = events.length > MAX_SOURCE_EVENTS || rows.length > MAX_ENTRIES;
  const entries = rows.slice(-MAX_ENTRIES);
  const view = {
    apiVersion:1,activityViewVersion:1,perspective:'developer-world',
    simulationId:bundle.snapshot.simulationId,revision:bundle.snapshot.revision,tick:bundle.snapshot.tick,
    actors:bundle.snapshot.world.actorModel.actors.map(actor => ({actorId:actor.actorId,name:actor.name})),
    window:{maxSourceEvents:MAX_SOURCE_EVENTS,maxEntries:MAX_ENTRIES,sourceEventsConsidered:sourceEvents.length,truncated},
    entries,
  };
  requireCondition(entries.every(entry => ENTRY_KEYS.length === Object.keys(entry).length && ENTRY_KEYS.every(key => Object.hasOwn(entry,key))),
    'World activity entry shape mismatch');
  requireCondition(new TextEncoder().encode(canonicalJson(view)).length <= MAX_BYTES,'World activity projection exceeds byte budget','LIMIT_EXCEEDED');
  return cloneData(view);
}
