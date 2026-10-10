import { createRng, restoreRng } from './rng.mjs';
import { restoreClock } from './simulation-clock.mjs';
import { createScheduler, restoreScheduler } from './scheduler.mjs';
import { validateEventLog } from './event-log.mjs';
import { RESOURCE_RULES, MAX_RESOURCE_DAYS, validateResourceWorld } from './resource-ledger.mjs';
import { ECOLOGY_RULES, validateEcologyWorld } from './ecology.mjs';
import { MARKET_RULES, validateMarketWorld } from './market.mjs';
import { ACTOR_RULES, validateActorWorld } from './actors.mjs';
import { HUNTER_RULES,validateHunterWorld,validateHunterActionResult } from './hunter.mjs';
import { SOCIETY_RULES,validateSocietyWorld,validateSocietyActionResult } from './society.mjs';
import { PERSONALITY_RULES,MEMORY_RULE_VERSIONS,isMemoryRules,validateMemoryWorld } from './memory-runtime.mjs';
import { MIND_RULES,validateMindWorld } from './mind-runtime.mjs';
import { MOTIVATION_RULES } from './motivation-state.mjs';
import { validateMotivationWorld, validateExperienceWorld, validateCognitionWorld, validateSurvivalWorld } from './motivation-runtime.mjs';
import { EXPERIENCE_RULES, inspectDescriptorTree, preflightExperienceData } from './experience-state.mjs';
import { COGNITION_RULES } from './cognition-state.mjs';
import { SURVIVAL_RULES } from './survival-state.mjs';
import { PLAYER_RULES,PLAY_RULES,playerIntentDuration,validatePlayerActionResult } from './player-state.mjs';
import { cloneData, fields, record, identifier, integer, denseArray, normalizeSystems,
  commandInput, inputFingerprint, requireCondition, fault, MAX_EVENTS } from './data-contract.mjs';

const SNAPSHOT_FIELDS = ['schemaVersion', 'rulesVersion', 'simulationId', 'fixtureId', 'fixtureVersion',
  'tick', 'tickMinutes', 'revision', 'rng', 'nextEntityId', 'nextEventSeq', 'nextInputSeq',
  'scheduledTasks', 'pendingCommands', 'commandReceipts', 'world'];

export function cloneBundle(bundle) {
  preflightExperienceData(bundle, true);
  fields(bundle, ['snapshot', 'eventLog']);
  return cloneData(bundle);
}

function checkBudgets(snapshot, events) {
  if (preflightExperienceData(snapshot)) inspectDescriptorTree(events);
  record(snapshot);
  denseArray(events, MAX_EVENTS);
  denseArray(snapshot.scheduledTasks); denseArray(snapshot.pendingCommands);
  record(snapshot.commandReceipts); record(snapshot.world); record(snapshot.world.resources);
  if (snapshot.rulesVersion === RESOURCE_RULES) {
    denseArray(events, MAX_RESOURCE_DAYS); validateResourceWorld(snapshot.world);
  } else if (snapshot.rulesVersion === ECOLOGY_RULES) {
    denseArray(events, MAX_RESOURCE_DAYS + 100000); validateEcologyWorld(snapshot.world);
  } else if (snapshot.rulesVersion === MARKET_RULES) {
    denseArray(events, MAX_RESOURCE_DAYS + 100000); validateMarketWorld(snapshot.world);
  } else if (snapshot.rulesVersion === ACTOR_RULES) {
    denseArray(events, MAX_RESOURCE_DAYS + 100000); validateActorWorld(snapshot.world);
  }else if(snapshot.rulesVersion===HUNTER_RULES){
    denseArray(events,MAX_RESOURCE_DAYS*2+100000);validateHunterWorld(snapshot.world);
  }else if(isMemoryRules(snapshot.rulesVersion)){
    denseArray(events,MAX_RESOURCE_DAYS*4+100000);validateMemoryWorld(snapshot.world);
  }else if(snapshot.rulesVersion===SOCIETY_RULES){
    denseArray(events,MAX_RESOURCE_DAYS*4+100000);validateSocietyWorld(snapshot.world);
  }else if(snapshot.rulesVersion===MOTIVATION_RULES){
    denseArray(events,MAX_RESOURCE_DAYS*4+100000);validateMotivationWorld(snapshot.world);
  }else if(snapshot.rulesVersion===EXPERIENCE_RULES){
    denseArray(events,MAX_RESOURCE_DAYS*4+100000);validateExperienceWorld(snapshot.world);
  }else if(snapshot.rulesVersion===COGNITION_RULES){
    denseArray(events,MAX_RESOURCE_DAYS*4+100000);validateCognitionWorld(snapshot.world);
  }else if(snapshot.rulesVersion===SURVIVAL_RULES){
    denseArray(events,MAX_RESOURCE_DAYS*4+100000);validateSurvivalWorld(snapshot.world);
  }else if(snapshot.rulesVersion===MIND_RULES){
    denseArray(events,MAX_RESOURCE_DAYS*4+100000);validateMindWorld(snapshot.world);
  }
}

export function validateBundle(bundle, options) {
  preflightExperienceData(bundle, true);
  fields(options, ['rulesVersion', 'systems']); identifier(options.rulesVersion);
  normalizeSystems(options.systems); fields(bundle, ['snapshot', 'eventLog']);
  checkBudgets(bundle.snapshot, bundle.eventLog);
  const { snapshot: s, eventLog } = cloneBundle(bundle);
  validateSnapshotStructure(s, options, eventLog.length);
  validateEventLog(eventLog, s, options.systems);
}

// Structure only. Complete history/receipt/fact correspondence still requires validateBundle.
export function validateSnapshotStructure(snapshot, options, eventCount) {
  fields(options, ['rulesVersion', 'systems']); identifier(options.rulesVersion); normalizeSystems(options.systems);
  checkBudgets(snapshot, []); integer(eventCount);
  requireCondition(eventCount <= MAX_EVENTS, 'Event budget exceeded', 'LIMIT_EXCEEDED');
  const s = cloneData(snapshot); fields(s, SNAPSHOT_FIELDS);
  requireCondition(s.schemaVersion === 2 && s.rulesVersion === options.rulesVersion, 'Unsupported snapshot/rules version', 'UNSUPPORTED_VERSION');
  for (const key of ['rulesVersion', 'simulationId', 'fixtureId', 'fixtureVersion']) identifier(s[key]);
  restoreClock({ tick: s.tick, tickMinutes: s.tickMinutes }); restoreRng(s.rng);
  integer(s.revision); requireCondition(s.revision === s.tick, 'Revision does not match committed tick');
  for (const key of ['nextEntityId', 'nextEventSeq', 'nextInputSeq']) integer(s[key], 1);
  requireCondition(s.nextEventSeq === eventCount + 1, 'Event counter mismatch');
  restoreScheduler({ currentTick: s.tick, tasks: s.scheduledTasks }, Object.keys(options.systems));
  if (s.rulesVersion === RESOURCE_RULES) {
    validateResourceWorld(s.world);
    requireCondition(s.fixtureId === 'resource-village' && s.fixtureVersion === '1', 'Unknown resource fixture', 'UNSUPPORTED_VERSION');
    requireCondition(s.pendingCommands.length === 0 && Object.keys(s.commandReceipts).length === 0 && s.nextInputSeq === 1,
      'B1 does not accept cross-unit transfer commands');
    const day = Math.floor(s.tick / 144);
    requireCondition(s.world.resourceModel.day === day, 'Resource settlement clock mismatch');
    requireCondition(s.scheduledTasks.length === 1, 'B1 requires one daily resource task');
    const task = s.scheduledTasks[0];
    requireCondition(task.taskId === 'daily-resources' && task.systemId === 'resources' && task.intervalTicks === 144 &&
      task.priority === 10 && task.nextDueTick === (day + 1) * 144, 'Invalid B1 resource schedule');
  } else if (s.rulesVersion === ECOLOGY_RULES) {
    validateEcologyWorld(s.world);
    requireCondition(['ecology-village', 'ecology-deer-shock'].includes(s.fixtureId) && s.fixtureVersion === '1', 'Unknown ecology fixture', 'UNSUPPORTED_VERSION');
    const day = Math.floor(s.tick / 144), task = s.scheduledTasks[0];
    requireCondition(s.world.ecologyModel.day === day && s.scheduledTasks.length === 1 && task.taskId === 'daily-ecology' &&
      task.systemId === 'ecology' && task.intervalTicks === 144 && task.priority === 10 && task.nextDueTick === (day + 1) * 144, 'Invalid ecology settlement schedule');
  } else if (s.rulesVersion === MARKET_RULES) {
    validateMarketWorld(s.world);
    requireCondition(['market-village', 'market-shortage', 'market-route-pause', 'b4-baseline', 'b4-mild', 'b4-severe', 'b4-herb-shortage', 'b4-trade-blocked'].includes(s.fixtureId) && s.fixtureVersion === '1', 'Unknown market fixture', 'UNSUPPORTED_VERSION');
    const day = Math.floor(s.tick / 144), task = s.scheduledTasks[0];
    requireCondition(s.world.marketModel.day === day && s.scheduledTasks.length === 1 && task.taskId === 'daily-market' &&
      task.systemId === 'market' && task.intervalTicks === 144 && task.priority === 10 && task.nextDueTick === (day + 1) * 144, 'Invalid market settlement schedule');
  } else if (s.rulesVersion === ACTOR_RULES) {
    validateActorWorld(s.world);
    requireCondition(s.world.actorModel.config.version==='actor-config-v1','Actor rules/config mismatch','UNSUPPORTED_VERSION');
    requireCondition(['actor-village','actor-needs','actor-shortage'].includes(s.fixtureId) && s.fixtureVersion==='1', 'Unknown Actor fixture', 'UNSUPPORTED_VERSION');
    const day=Math.floor(s.tick/144),task=s.scheduledTasks[0];
    requireCondition(s.world.actorModel.day===day && s.nextEntityId===s.world.actorModel.actors.length+1 && s.scheduledTasks.length===1 &&
      task.taskId==='daily-actors' && task.systemId==='actors' && task.intervalTicks===144 && task.priority===10 && task.nextDueTick===(day+1)*144,'Invalid Actor schedule/identity counter');
  }else if(s.rulesVersion===HUNTER_RULES){
    validateHunterWorld(s.world);
    requireCondition(s.world.actorModel.config.version==='actor-config-v1','Hunter rules/Actor config mismatch','UNSUPPORTED_VERSION');
    requireCondition(['hunter-village','hunter-recovery','hunter-hunger'].includes(s.fixtureId) && s.fixtureVersion==='1','Unknown Hunter fixture','UNSUPPORTED_VERSION');
    const day=Math.floor(s.tick/144),task=s.scheduledTasks[0];
    requireCondition(s.world.hunterModel.day===day && s.world.hunterModel.lastActionDay<=day && s.nextEntityId===s.world.actorModel.actors.length+1 &&
      s.scheduledTasks.length===1 && task.taskId==='daily-hunter' && task.systemId==='hunter' && task.intervalTicks===144 && task.priority===10 && task.nextDueTick===(day+1)*144,'Invalid Hunter schedule/identity');
  }else if(isMemoryRules(s.rulesVersion)){
    validateMemoryWorld(s.world);
    const personality=s.rulesVersion===PERSONALITY_RULES,player=s.rulesVersion===PLAYER_RULES,play=s.rulesVersion===PLAY_RULES;
    requireCondition(s.world.memoryModel.config.version===(play?'memory-config-v4':player?'memory-config-v3':personality?'memory-config-v2':'memory-config-v1'),'Memory rules/config mismatch','UNSUPPORTED_VERSION');
    requireCondition((play?['player-play-village']:player?['player-village']:personality?['personality-neutral','personality-health','personality-food']:['memory-village','memory-relations','memory-relations-control','memory-medicine-race']).includes(s.fixtureId) && s.fixtureVersion==='1','Unknown Memory fixture','UNSUPPORTED_VERSION');
    const day=Math.floor(s.tick/144),task=s.scheduledTasks[0],m=s.world.memoryModel;
    requireCondition(m.day===day && m.observer.lastObservedTick===day*144 && s.nextEntityId===(player || play?5:4) &&
      m.observer.actors.every(a=>a.alive===s.world.actorModel.actors.find(p=>p.actorId===a.actorId).alive) &&
      m.announcements.every(a=>a.payload.expiresTick===day*144) && s.world.societyModel.agents.every(a=>a.state.lastActionDay<=day) &&
      s.scheduledTasks.length===1 && task.taskId==='daily-memory' && task.systemId==='society' && task.intervalTicks===144 && task.priority===10 && task.nextDueTick===(day+1)*144,'Invalid Memory schedule/identity/observation boundary');
  }else if([MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES].includes(s.rulesVersion)){
    const isExp=s.rulesVersion===EXPERIENCE_RULES;
    const isMot=s.rulesVersion===MOTIVATION_RULES;
    const isCog=s.rulesVersion===COGNITION_RULES;
    const isSur=s.rulesVersion===SURVIVAL_RULES;
    if(isSur)validateSurvivalWorld(s.world);
    else if(isCog)validateCognitionWorld(s.world);
    else if(isExp)validateExperienceWorld(s.world);
    else if(isMot)validateMotivationWorld(s.world);
    else validateMindWorld(s.world);
    requireCondition(s.world.memoryModel.config.version==='memory-config-v4','Mind rules/config mismatch','UNSUPPORTED_VERSION');
    requireCondition(s.fixtureId===(isSur?'survival-village':isCog?'cognition-village':isExp?'experience-village':isMot?'motivation-village':'mind-village') && s.fixtureVersion==='1','Unknown Mind fixture','UNSUPPORTED_VERSION');
    const day=Math.floor(s.tick/144),m=s.world.memoryModel,mind=s.world.mindModel;
    // M4A adds a tick-1 publication task alongside the daily settlement, so the survival
    // profile carries two scheduled tasks instead of one. Every other boundary is unchanged.
    const daily=s.scheduledTasks.find(t=>t.systemId==='society');
    requireCondition(m.day===day && m.observer.lastObservedTick===day*144 && s.nextEntityId===5 &&
      m.observer.actors.every(a=>a.alive===s.world.actorModel.actors.find(p=>p.actorId===a.actorId).alive) &&
      m.announcements.every(a=>a.payload.expiresTick===day*144) && s.world.societyModel.agents.every(a=>a.state.lastActionDay<=day) &&
      (isSur?s.scheduledTasks.length===2:s.scheduledTasks.length===1) && daily &&
      daily.taskId==='daily-memory' && daily.intervalTicks===144 && daily.priority===10 &&
      daily.nextDueTick===(day+1)*144,'Invalid Mind schedule/identity/observation boundary');
    if(isSur)requireCondition(s.scheduledTasks.some(t=>t.systemId==='survival' && t.taskId==='survival-quote'),
      'Survival profile must carry its public food quote publication task');
    requireCondition(mind.cursor===s.nextEventSeq-1,'Mind cursor differs from the committed event log');
    const dueStimuli=mind.config.stimuli.filter(stimulus=>stimulus.tick<=s.tick).length;
    requireCondition(mind.scriptCursor===dueStimuli,'Mind stimulus cursor disagrees with the committed tick');
    if(isMot||isExp||isCog||isSur){const m2=s.world.motivationModel;requireCondition(m2.cursor===s.nextEventSeq-1,'Motivation cursor differs from committed history');
      requireCondition(m2.requestCursor===m2.config.requests.filter(r=>r.tick<=s.tick).length,'Motivation request cursor disagrees with tick');}
    if(isExp||isCog||isSur){const exp=s.world.experienceModel;requireCondition(exp.cursor===s.nextEventSeq-1,'Experience cursor differs from committed history');}
    if(isCog||isSur){const cog=s.world.cognitionModel;requireCondition(cog.cursor===s.nextEventSeq-1,'Cognition cursor differs from committed history');}
  }else if(s.rulesVersion===SOCIETY_RULES){
    validateSocietyWorld(s.world);
    requireCondition(['society-village','society-medicine-race','society-peer-sale'].includes(s.fixtureId) && s.fixtureVersion==='1','Unknown Society fixture','UNSUPPORTED_VERSION');
    const day=Math.floor(s.tick/144),task=s.scheduledTasks[0];
    requireCondition(s.world.societyModel.day===day && s.world.societyModel.agents.every(a=>a.state.lastActionDay<=day) && s.nextEntityId===4 &&
      s.scheduledTasks.length===1 && task.taskId==='daily-society' && task.systemId==='society' && task.intervalTicks===144 && task.priority===10 && task.nextDueTick===(day+1)*144,'Invalid Society schedule/identity');
  } else fields(s.world, ['resources']);
  for (const [id, balance] of Object.entries(s.world.resources)) { identifier(id); integer(balance); }
  const ids = new Set(), sequences = new Set(); let previousInput = 0;
  const remember = (id, sequence) => {
    identifier(id); integer(sequence, 1);
    requireCondition(!ids.has(id) && !sequences.has(sequence) && sequence < s.nextInputSeq, 'Repeated command/input sequence');
    ids.add(id); sequences.add(sequence);
  };
  for (const entry of s.pendingCommands) {
    fields(entry, ['commandId', 'inputSeq', 'targetTick', 'type', 'payload']);
    const { inputSeq, ...input } = entry; commandInput(input);
    requireCondition([PLAY_RULES,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES].includes(s.rulesVersion)?input.type==='PlayerAction':[MARKET_RULES,ACTOR_RULES,HUNTER_RULES,SOCIETY_RULES,...MEMORY_RULE_VERSIONS].includes(s.rulesVersion) ? ['RemovePopulation', 'SetTradeRoute'].includes(input.type) :
      input.type === (s.rulesVersion === ECOLOGY_RULES ? 'RemovePopulation' : 'TransferResource'), 'Command does not belong to this rules version');
    requireCondition(s.rulesVersion!==HUNTER_RULES || !input.commandId.startsWith('hunter-day-'),'External input claimed internal command namespace');
    requireCondition(![SOCIETY_RULES,...MEMORY_RULE_VERSIONS,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES].includes(s.rulesVersion) || !input.commandId.startsWith('society-day-'),'External input claimed internal command namespace');
    requireCondition(![MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES].includes(s.rulesVersion) || !input.commandId.startsWith('mind-day-'),'External input claimed mind command namespace');
    requireCondition(![MOTIVATION_RULES,EXPERIENCE_RULES].includes(s.rulesVersion) || !input.commandId.startsWith('motivation-day-'),'External input claimed motivation command namespace');
    requireCondition(s.rulesVersion!==EXPERIENCE_RULES || !input.commandId.startsWith('experience-day-'),'External input claimed experience command namespace');
    requireCondition(s.rulesVersion!==EXPERIENCE_RULES || !input.commandId.startsWith('mind-settle-'),'External input claimed mind settlement namespace');
    requireCondition(s.rulesVersion!==COGNITION_RULES || !input.commandId.startsWith('cognition-day-'),'External input claimed cognition command namespace');
    requireCondition(s.rulesVersion!==COGNITION_RULES || !input.commandId.startsWith('cognition-eval-'),'External input claimed cognition evaluation namespace');
    requireCondition(s.rulesVersion!==COGNITION_RULES || !input.commandId.startsWith('mind-settle-'),'External input claimed mind settlement namespace');
    // Format7 keeps every format6 prefix and adds the survival namespace.
    requireCondition(s.rulesVersion!==SURVIVAL_RULES || !input.commandId.startsWith('survival-day-'),'External input claimed survival command namespace');
    requireCondition(s.rulesVersion!==SURVIVAL_RULES || !input.commandId.startsWith('cognition-day-'),'External input claimed cognition command namespace');
    requireCondition(s.rulesVersion!==SURVIVAL_RULES || !input.commandId.startsWith('cognition-eval-'),'External input claimed cognition evaluation namespace');
    requireCondition(s.rulesVersion!==SURVIVAL_RULES || !input.commandId.startsWith('mind-settle-'),'External input claimed mind settlement namespace');
    remember(entry.commandId, inputSeq);
    if(input.type==='PlayerAction')requireCondition(input.payload.startTick<=s.tick && input.targetTick===input.payload.startTick+playerIntentDuration({commandId:input.commandId,...input.payload.intent}),'Invalid pending player timing');
    requireCondition(inputSeq > previousInput && entry.targetTick > s.tick, 'Out-of-order or expired pending input'); previousInput = inputSeq;
  }
  for (const [id, receipt] of Object.entries(s.commandReceipts)) {
    fields(receipt, ['inputSeq', 'input', 'fingerprint', 'status', 'result', 'eventSeqs']);
    fields(receipt.input, ['type', 'payload', 'targetTick']);
    commandInput({ commandId: id, ...receipt.input }); remember(id, receipt.inputSeq);
    requireCondition([PLAY_RULES,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES].includes(s.rulesVersion)?['PlayerAction','SocietyAction'].includes(receipt.input.type):[SOCIETY_RULES,...MEMORY_RULE_VERSIONS].includes(s.rulesVersion)?['RemovePopulation','SetTradeRoute','SocietyAction'].includes(receipt.input.type):
      s.rulesVersion===HUNTER_RULES?['RemovePopulation','SetTradeRoute','ActorAction'].includes(receipt.input.type):
      [MARKET_RULES,ACTOR_RULES].includes(s.rulesVersion) ? ['RemovePopulation', 'SetTradeRoute'].includes(receipt.input.type) :
      receipt.input.type === (s.rulesVersion === ECOLOGY_RULES ? 'RemovePopulation' : 'TransferResource'), 'Receipt does not belong to this rules version');
    requireCondition(receipt.input.targetTick <= s.tick && receipt.fingerprint === inputFingerprint(receipt.input), 'Invalid receipt input/fingerprint');
    if (receipt.status === 'succeeded') {
      if(receipt.input.type==='PlayerAction')validatePlayerActionResult(receipt.result);
      else if(receipt.input.type==='SocietyAction')validateSocietyActionResult(receipt.result);
      else if(receipt.input.type==='ActorAction')validateHunterActionResult(receipt.result);
      else fields(receipt.result, receipt.input.type === 'SetTradeRoute' ? ['before', 'open'] :
        receipt.input.type === 'RemovePopulation' ? ['species', 'amount', 'before', 'after'] : ['from', 'to', 'amount']);
    } else {
      requireCondition(receipt.status === 'rejected', 'Unknown receipt status');
      fields(receipt.result, ['code']); requireCondition(receipt.result.code === 'RULE_REJECTED', 'Unknown rejection code');
    }
  }
  // Cardinality + unique positive values below nextInputSeq proves a contiguous range.
  requireCondition(sequences.size === s.nextInputSeq - 1, 'Input sequence gap/counter mismatch');
}

export function createInitialBundle(config, systems) {
  preflightExperienceData(config);
  record(config);
  const worldField = [RESOURCE_RULES, ECOLOGY_RULES, MARKET_RULES,ACTOR_RULES,HUNTER_RULES,SOCIETY_RULES,...MEMORY_RULE_VERSIONS,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES].includes(config.rulesVersion) ? 'world' : 'resources';
  fields(config, ['rulesVersion', 'simulationId', 'fixtureId', 'fixtureVersion', 'seed', worldField, 'scheduledTasks', 'commands']);
  normalizeSystems(systems); denseArray(config.commands); denseArray(config.scheduledTasks); record(config[worldField]);
  const c = cloneData(config);
  for (const key of ['rulesVersion', 'simulationId', 'fixtureId', 'fixtureVersion']) identifier(c[key]);
  const commands = [], seen = new Map(); let nextInputSeq = 1;
  for (const raw of c.commands) {
    const input = commandInput(raw), fingerprint = inputFingerprint(input);
    if (seen.has(input.commandId)) {
      if (seen.get(input.commandId) !== fingerprint) throw fault('COMMAND_ID_CONFLICT', 'Command ID has different input');
      continue;
    }
    seen.set(input.commandId, fingerprint); commands.push({ ...input, inputSeq: nextInputSeq++ });
  }
  const result = { snapshot: {
    schemaVersion: 2, rulesVersion: c.rulesVersion, simulationId: c.simulationId,
    fixtureId: c.fixtureId, fixtureVersion: c.fixtureVersion, tick: 0, tickMinutes: 10, revision: 0,
    rng: createRng(c.seed).getState(), nextEntityId: [ACTOR_RULES,HUNTER_RULES,SOCIETY_RULES,...MEMORY_RULE_VERSIONS,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES].includes(c.rulesVersion) ? c.world.actorModel.actors.length+1 : 1, nextEventSeq: 1, nextInputSeq,
    scheduledTasks: createScheduler({ tasks: c.scheduledTasks }, Object.keys(systems)).tasks,
    pendingCommands: commands, commandReceipts: {}, world: worldField === 'world' ? c.world : { resources: c.resources },
  }, eventLog: [] };
  validateBundle(result, { rulesVersion: c.rulesVersion, systems });
  return result;
}
