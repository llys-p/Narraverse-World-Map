import { cloneBundle, validateBundle, validateSnapshotStructure,createAuditedBundle } from './world-state.mjs';
import { restoreRng } from './rng.mjs';
import { restoreClock, MAX_ADVANCE_TICKS } from './simulation-clock.mjs';
import { advanceScheduler } from './scheduler.mjs';
import { validateFact } from './event-log.mjs';
import { RESOURCE_RULES, settleResourceDay } from './resource-ledger.mjs';
import { ECOLOGY_RULES, removePopulation, ecologyCauses, settleEcologyDay } from './ecology.mjs';
import { MARKET_RULES, applyMarketCommand, marketCommandFact, marketCauses, settleMarketDay } from './market.mjs';
import { ACTOR_RULES,applyActorCommand,settleActorDay } from './actors.mjs';
import { HUNTER_RULES,applyHunterCommand,planHunterDay,applyHunterAction,hunterActionFact,hunterCauses,settleHunterDay } from './hunter.mjs';
import { SOCIETY_RULES,applySocietyCommand,planSocietyDay,applySocietyAction,societyActionFact,societyCauses,settleSocietyDay } from './society.mjs';
import { MEMORY_RULE_VERSIONS,isMemoryRules,prepareMemoryDay,planMemoryDay,applyMemoryAction,applyMemoryCommand,settleMemorySocietyDay,finishMemoryDay,validateMemoryDayPayload } from './memory-runtime.mjs';
import { MIND_RULES,applyMindAction,applyMindCommand,applyMindStimuliTick,planMindDay,finishMindDay,prepareMindDay,settleMindSocietyDay,finishMindMemoryDay,mindDecisionPlannedFact,mindResolvedOutcome,mindResolvedFact,sealMindOutcome,pushMindObservation,mindRejectionObservation } from './mind-runtime.mjs';
import { MOTIVATION_RULES } from './motivation-state.mjs';
import { motivationRuntimeHooks, experienceRuntimeHooks, cognitionRuntimeHooks, survivalRuntimeHooks } from './motivation-runtime.mjs';
import { EXPERIENCE_RULES, inspectDescriptorTree, preflightExperienceData } from './experience-state.mjs';
import { COGNITION_RULES } from './cognition-state.mjs';
import { SURVIVAL_RULES } from './survival-state.mjs';
import { ENCOUNTER_RULES, encounterRuntimeHooks } from './encounter-runtime.mjs';
import {LIVELIHOOD_RULES,livelihoodRuntimeHooks} from './scene-livelihood-runtime.mjs';
import {CAMPAIGN_RULES,campaignRuntimeHooks} from './scene-campaign-runtime.mjs';
import {applyPlayerWork,playerWorkFact} from './player-work.mjs';
import {SCENE_RULES,sceneRuntimeHooks} from './scene-runtime.mjs';
import { validateMedicineAnnouncement } from './public-medicine.mjs';
import { PLAYER_RULES,PLAY_RULES,playerDayFact,applyPlayerAction,playerActionFact } from './player-state.mjs';
import { commandInput, inputFingerprint, cloneData, canonicalJson, fields, record, denseArray, own, put, fault,
  requireCondition, integer, normalizeSystems, MAX_COLLECTION, MAX_EVENTS } from './data-contract.mjs';

export function lookupCommand(bundle, raw) {
  if (preflightExperienceData(bundle, true)) inspectDescriptorTree(raw);
  const input = commandInput(raw, false), fingerprint = inputFingerprint(input);
  const { snapshot } = cloneBundle(bundle);
  record(snapshot); denseArray(snapshot.pendingCommands); record(snapshot.commandReceipts);
  const queued = snapshot.pendingCommands.find((entry) => entry.commandId === input.commandId);
  const receipt = own(snapshot.commandReceipts, input.commandId) ? snapshot.commandReceipts[input.commandId] : undefined;
  if (queued || receipt) {
    requireCondition((queued ? inputFingerprint(queued) : receipt.fingerprint) === fingerprint, 'Command ID has different input', 'COMMAND_ID_CONFLICT');
    return queued ? { status: 'pending', inputSeq: queued.inputSeq } : cloneData(receipt);
  }
  return { status: 'not_found' };
}

export function advanceOneTick(bundle, systems) {
  return performTick(bundle, systems, 'full');
}

const campaignExecution = Symbol('registered campaign execution');
const campaignBatchExecution = Symbol('detached synchronous campaign batch');
// Only fixed campaign handlers run here, over detached JSON data. No caller
// supplies callbacks or a validation flag. Running those same handlers again
// cannot add an independent check; full history/fact/receipt audit remains with
// validateBundle. The public custom-system path keeps its canonical comparison.
export function performCampaignTick(bundle) {
  // runTick validates the descriptor tree and detaches the candidate itself.
  // A second clone of the entire historic event log adds no independent audit.
  // Check the campaign rules on that detached snapshot, not on a mutable caller view.
  return runTick(bundle, canonicalSystems(CAMPAIGN_RULES), 'session', campaignExecution);
}

// 入口完整预检并深复制；中间结果只存在于此同步循环，不能被调用者修改。
// 固定系统每刻仍执行结构、事件计数、保护字段与账本检查。无调用者信任开关。
export function performCampaignTicks(bundle,count){
  integer(count);requireCondition(count<=MAX_ADVANCE_TICKS,'Tick batch exceeds budget','LIMIT_EXCEEDED');
  let working=cloneBundle(bundle);
  requireCondition(working.snapshot.rulesVersion===CAMPAIGN_RULES,'Campaign ticks require campaign rules','UNSUPPORTED_VERSION');
  const systems=canonicalSystems(CAMPAIGN_RULES);
  for(let i=0;i<count;i++)working=runTick(working,systems,'session',campaignBatchExecution);
  return working;
}

export function performTick(bundle, systems, mode) {
  return runTick(bundle, systems, mode);
}

function runTick(bundle, systems, mode, execution = undefined) {
  let failedTick;
  let active = true;
  try {
    if(execution!==campaignBatchExecution)preflightExperienceData(bundle, true);
    fields(bundle, ['snapshot', 'eventLog']); record(bundle.snapshot);
    if (mode === 'full') validateBundle(bundle, { rulesVersion: bundle.snapshot.rulesVersion, systems });
    const candidate = mode === 'full' ? cloneBundle(bundle) :
      { snapshot: cloneData(bundle.snapshot), eventLog: bundle.eventLog.slice() };
    const s = candidate.snapshot;
    const rulesVersion = s.rulesVersion;
    if(execution===campaignExecution||execution===campaignBatchExecution)requireCondition(rulesVersion===CAMPAIGN_RULES,'Campaign tick requires campaign rules','UNSUPPORTED_VERSION');
    const clock = restoreClock({ tick: s.tick, tickMinutes: s.tickMinutes });
    clock.advanceTicks(1); failedTick = clock.tick;
    requireCondition(s.revision < Number.MAX_SAFE_INTEGER, 'Revision overflow', 'LIMIT_EXCEEDED');
    const rng = Object.freeze(restoreRng(s.rng));
    let nextEventSeq = s.nextEventSeq;
    let receiptCount = Object.keys(s.commandReceipts).length;
    const append = (fact) => {
      requireCondition(active, 'Tick context is closed');
      requireCondition(s.nextEventSeq === nextEventSeq, 'System rewrote event counter');
      requireCondition(candidate.eventLog.length < MAX_EVENTS && nextEventSeq < Number.MAX_SAFE_INTEGER, 'Event budget/counter exceeded', 'LIMIT_EXCEEDED');
      const eventSeq = nextEventSeq++;
      s.nextEventSeq = nextEventSeq;
      candidate.eventLog.push({ ...cloneData(fact), eventSeq, tick: failedTick, schemaVersion: 1 });
      return eventSeq;
    };
    const commitInput=(input)=>{
      requireCondition(receiptCount < MAX_COLLECTION, 'Receipt budget exceeded', 'LIMIT_EXCEEDED');
      let success, result, eventSeqs = [];
      if((rulesVersion===PLAY_RULES||rulesVersion===MIND_RULES||rulesVersion===MOTIVATION_RULES||rulesVersion===EXPERIENCE_RULES||rulesVersion===COGNITION_RULES||rulesVersion===SURVIVAL_RULES||rulesVersion===ENCOUNTER_RULES||rulesVersion===SCENE_RULES||rulesVersion===LIVELIHOOD_RULES||rulesVersion===CAMPAIGN_RULES) && input.type==='PlayerAction'){
        const applied=[LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion)&&input.payload.intent.type==='PlayerWork'?applyPlayerWork(s.world,input):applyPlayerAction(s.world,input);s.world=applied.world;success=applied.success;result=applied.result;
        if(success)eventSeqs=[append(input.payload.intent.type==='PlayerWork'?playerWorkFact(input,result):playerActionFact(input,result))];
      }else if(rulesVersion===MOTIVATION_RULES){
        requireCondition(input.type==='SocietyAction','Unexpected motivation command');
        const applied=motivationRuntimeHooks.applyAction(s.world,input.payload,input.payload.action==='Hunt'?rng.next():null);
        s.world=applied.world;success=applied.success;result=applied.result;
        if(success)eventSeqs=[append(societyActionFact(input,result))];
      }else if(rulesVersion===EXPERIENCE_RULES){
        requireCondition(input.type==='SocietyAction','Unexpected experience command');
        const applied=experienceRuntimeHooks.applyAction(s.world,input.payload,input.payload.action==='Hunt'?rng.next():null);
        s.world=applied.world;success=applied.success;result=applied.result;
        if(success)eventSeqs=[append(societyActionFact(input,result))];
      }else if(rulesVersion===COGNITION_RULES){
        requireCondition(input.type==='SocietyAction','Unexpected cognition command');
        const applied=cognitionRuntimeHooks.applyAction(s.world,input.payload,input.payload.action==='Hunt'?rng.next():null);
        s.world=applied.world;success=applied.success;result=applied.result;
        if(success)eventSeqs=[append(societyActionFact(input,result))];
      }else if(rulesVersion===SURVIVAL_RULES||rulesVersion===ENCOUNTER_RULES||rulesVersion===SCENE_RULES||rulesVersion===LIVELIHOOD_RULES||rulesVersion===CAMPAIGN_RULES){
        requireCondition(input.type==='SocietyAction','Unexpected survival/encounter command');
        const hooks=rulesVersion===CAMPAIGN_RULES?campaignRuntimeHooks:rulesVersion===LIVELIHOOD_RULES?livelihoodRuntimeHooks:rulesVersion===SCENE_RULES?sceneRuntimeHooks:rulesVersion===ENCOUNTER_RULES?encounterRuntimeHooks:survivalRuntimeHooks;
        const applied=hooks.applyAction(s.world,input.payload,input.payload.action==='Hunt'?rng.next():null);
        s.world=applied.world;success=applied.success;result=applied.result;
        if(success)eventSeqs=[append(societyActionFact(input,result))];
      }else if(rulesVersion===MIND_RULES){
        const applied=input.type==='SocietyAction'?applyMindAction(s.world,input.payload,input.payload.action==='Hunt'?rng.next():null):applyMindCommand(s.world,{type:input.type,payload:input.payload});
        s.world=applied.world;success=applied.success;result=applied.result;
        if(success)eventSeqs=[append(input.type==='SocietyAction'?societyActionFact(input,result):marketCommandFact(input,result))];
      }else if([SOCIETY_RULES,...MEMORY_RULE_VERSIONS].includes(rulesVersion)){
        const action=isMemoryRules(rulesVersion)?applyMemoryAction:applySocietyAction,command=isMemoryRules(rulesVersion)?applyMemoryCommand:applySocietyCommand;
        const applied=input.type==='SocietyAction'?action(s.world,input.payload,input.payload.action==='Hunt'?rng.next():null):command(s.world,{type:input.type,payload:input.payload});
        s.world=applied.world;success=applied.success;result=applied.result;
        if(success)eventSeqs=[append(input.type==='SocietyAction'?societyActionFact(input,result):marketCommandFact(input,result))];
      }else if(rulesVersion===HUNTER_RULES){
        const applied=input.type==='ActorAction'?applyHunterAction(s.world,input.payload,input.payload.action==='Hunt'?rng.next():null):applyHunterCommand(s.world,{type:input.type,payload:input.payload});
        s.world=applied.world;success=applied.success;result=applied.result;
        if(success)eventSeqs=[append(input.type==='ActorAction'?hunterActionFact(input,result):marketCommandFact(input,result))];
      }else if ([MARKET_RULES,ACTOR_RULES].includes(rulesVersion)) {
        const applied = (rulesVersion===ACTOR_RULES?applyActorCommand:applyMarketCommand)(s.world, { type: input.type, payload: input.payload });
        s.world = applied.world; success = applied.success; result = applied.result;
        if (success) eventSeqs = [append(marketCommandFact(input, result))];
      } else if (rulesVersion === ECOLOGY_RULES) {
        const removal = removePopulation(s.world, input.payload);
        s.world = removal.world; success = removal.success; result = removal.result;
        if (success) eventSeqs = [append({ type: 'PopulationRemoved', sourceSystem: 'command-engine', commandId: input.commandId,
          causationEventSeqs: [], entityIds: [result.species], payload: result })];
      } else {
        const { from, to, amount } = input.payload, balances = s.world.resources;
        success = from !== to && own(balances, from) && own(balances, to) && balances[from] >= amount && balances[to] <= Number.MAX_SAFE_INTEGER - amount;
        if (success) {
          balances[from] -= amount; balances[to] += amount; result = { from, to, amount };
          eventSeqs = [append({ type: 'ResourceTransferred', sourceSystem: 'command-engine', commandId: input.commandId,
            causationEventSeqs: [], entityIds: [from, to], payload: result })];
        } else result = { code: 'RULE_REJECTED' };
      }
      put(s.commandReceipts, input.commandId, { inputSeq: input.inputSeq,
        input: { type: input.type, payload: cloneData(input.payload), targetTick: input.targetTick },
        fingerprint: inputFingerprint(input), status: success ? 'succeeded' : 'rejected', result, eventSeqs });
      receiptCount++;
    };
    const remaining = [];
    for (const input of s.pendingCommands) {
      if (input.targetTick !== failedTick) { remaining.push(input); continue; }
      commitInput(input);
    }
    s.pendingCommands = remaining;
    // §6.1/6.2: due stimuli are consumed right after player completions and before any
    // daily business; observations only update on activity ticks, never via extra loops.
    if (rulesVersion === MIND_RULES) applyMindStimuliTick(s.world, failedTick, append);
    if (rulesVersion === MIND_RULES) s.world.mindModel.cursor = s.nextEventSeq - 1;
    const motivationContext=(rulesVersion===MOTIVATION_RULES?motivationRuntimeHooks:rulesVersion===EXPERIENCE_RULES?experienceRuntimeHooks:rulesVersion===COGNITION_RULES?cognitionRuntimeHooks:rulesVersion===SURVIVAL_RULES?survivalRuntimeHooks:rulesVersion===CAMPAIGN_RULES?campaignRuntimeHooks:rulesVersion===LIVELIHOOD_RULES?livelihoodRuntimeHooks:rulesVersion===SCENE_RULES?sceneRuntimeHooks:rulesVersion===ENCOUNTER_RULES?encounterRuntimeHooks:null)?.beforeSystems(s,candidate.eventLog,failedTick,append,(raw)=>{
      const input=commandInput(raw);requireCondition(input.targetTick===failedTick&&!own(s.commandReceipts,input.commandId),'Motivation/experience internal due tick/ID mismatch');
      requireCondition(s.nextInputSeq<Number.MAX_SAFE_INTEGER,'Motivation/experience input overflow','LIMIT_EXCEEDED');
      commitInput({...input,inputSeq:s.nextInputSeq++});return s.commandReceipts[input.commandId];
    })??null;
    const plan = advanceScheduler({ currentTick: s.tick, tasks: s.scheduledTasks }, failedTick, Object.keys(systems));
    if(rulesVersion===HUNTER_RULES && plan.dueTasks.length){
      const decision=planHunterDay(s.world);s.world=decision.world;
      if(decision.command){
        const input=commandInput(decision.command);
        requireCondition(input.targetTick===failedTick && !own(s.commandReceipts,input.commandId),'Internal command identity/due tick mismatch');
        requireCondition(s.nextInputSeq<Number.MAX_SAFE_INTEGER,'Internal input counter overflow','LIMIT_EXCEEDED');
        commitInput({...input,inputSeq:s.nextInputSeq++});
      }
    }
    if(rulesVersion===MIND_RULES && plan.dueTasks.length){
      const prepared=prepareMindDay(s.world,failedTick);s.world=prepared.world;
      for(const fact of prepared.facts){validateMedicineAnnouncement(fact);append(fact);}
      const planned=planMindDay(s.world,candidate.eventLog,failedTick,s.simulationId);s.world=planned.world;
      const plannedSeqs=new Map();
      for(const p of planned.plans)plannedSeqs.set(p.actorId,append(mindDecisionPlannedFact(p.decision)));
      const submits=[...planned.chiefs.map(command=>({actorId:null,command,decision:null,selfHealth:null})),
        ...planned.plans.map(p=>({actorId:p.actorId,command:p.command,decision:p.decision,selfHealth:p.selfHealth}))];
      for(const item of submits){
        if(item.command){
          const input=commandInput(item.command);
          requireCondition(input.targetTick===failedTick && !own(s.commandReceipts,input.commandId),'Mind internal due tick/ID mismatch');
          requireCondition(s.nextInputSeq<Number.MAX_SAFE_INTEGER,'Mind input counter overflow','LIMIT_EXCEEDED');
          commitInput({...input,inputSeq:s.nextInputSeq++});
        }
        if(item.actorId!==null){
          const receipt=item.command?s.commandReceipts[item.command.commandId]:null;
          const outcome=mindResolvedOutcome({decision:item.decision,command:item.command,selfHealth:item.selfHealth,receipt},s.world);
          const seq=append(mindResolvedFact(plannedSeqs.get(item.actorId),outcome));
          sealMindOutcome(s.world,outcome);
          if(item.decision.choice==='BuyMedicine'&&receipt&&receipt.status==='rejected'){
            pushMindObservation(s.world,item.actorId,mindRejectionObservation(seq,failedTick));
            // The rejection observation cites the fact appended this tick; the cursor must
            // advance before any other mid-tick world validation sees it.
            s.world.mindModel.cursor=s.nextEventSeq-1;}
        }
      }
    }
    if([SOCIETY_RULES,...MEMORY_RULE_VERSIONS].includes(rulesVersion) && plan.dueTasks.length){
      if(isMemoryRules(rulesVersion)){const prepared=prepareMemoryDay(s.world,failedTick);s.world=prepared.world;
        for(const fact of prepared.facts){validateMedicineAnnouncement(fact);append(fact);}}
      const planned=(isMemoryRules(rulesVersion)?planMemoryDay:planSocietyDay)(s.world);s.world=planned.world;
      for(const raw of planned.commands){const input=commandInput(raw);
        requireCondition(input.targetTick===failedTick && !own(s.commandReceipts,input.commandId),'Society internal due tick/ID mismatch');
        requireCondition(s.nextInputSeq<Number.MAX_SAFE_INTEGER,'Society input counter overflow','LIMIT_EXCEEDED');
        commitInput({...input,inputSeq:s.nextInputSeq++});}
    }
    // Rules may change resources and allocate entity IDs, never rewrite the input/identity envelope.
    const envelope = () => {
      const { world, nextEntityId, nextEventSeq: eventCounter, ...protectedFields } = s;
      return canonicalJson({ ...protectedFields,
        ...([RESOURCE_RULES, ECOLOGY_RULES, MARKET_RULES,ACTOR_RULES,HUNTER_RULES,SOCIETY_RULES,...MEMORY_RULE_VERSIONS,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion) ? { resourceConfig: world.resourceModel.config } : {}),
        ...([ECOLOGY_RULES, MARKET_RULES,ACTOR_RULES,HUNTER_RULES,SOCIETY_RULES,...MEMORY_RULE_VERSIONS,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion) ? { ecologyConfig: world.ecologyModel.config } : {}),
        ...([MARKET_RULES,ACTOR_RULES,HUNTER_RULES,SOCIETY_RULES,...MEMORY_RULE_VERSIONS,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion) ? { marketConfig: world.marketModel.config } : {}),
        ...([ACTOR_RULES,HUNTER_RULES,SOCIETY_RULES,...MEMORY_RULE_VERSIONS,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion)?{actorConfig:world.actorModel.config}:{}),
        ...(rulesVersion===HUNTER_RULES?{hunterConfig:world.hunterModel.config}:{}),
        ...([SOCIETY_RULES,...MEMORY_RULE_VERSIONS,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion)?{societyConfig:world.societyModel.config}:{}),
        ...((isMemoryRules(rulesVersion)||[MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion))?{memoryConfig:world.memoryModel.config}:{}),
        ...([MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion)?{mindConfig:world.mindModel.config}:{}),
        ...([MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion)?{motivationConfig:world.motivationModel.config}:{}),
        ...([EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion)?{experienceConfig:world.experienceModel.config}:{}),
        ...([COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion)?{cognitionConfig:world.cognitionModel.config}:{}) });
    };
    // 固定规则在没有到期系统时不会调用任何系统回调，两次相邻全量编码恒等。
    // 有回调时保留完整保护字段比较；公开自定义系统路径也保持原检查。
    const checkEnvelope=plan.dueTasks.length>0||(execution!==campaignExecution&&execution!==campaignBatchExecution);
    const beforeSystems = checkEnvelope?envelope():null, previousEntityId = s.nextEntityId;
    for (const due of plan.dueTasks) {
      const context = { snapshot: s, rng,
        ...(rulesVersion === ECOLOGY_RULES ? { populationCauses: Object.freeze(ecologyCauses(candidate.eventLog)) } : {}),
        ...([MARKET_RULES,ACTOR_RULES].includes(rulesVersion) ? { populationCauses: Object.freeze(marketCauses(candidate.eventLog)) } : {}),
        ...(rulesVersion===HUNTER_RULES?{populationCauses:Object.freeze(hunterCauses(candidate.eventLog))}:{}),
        ...([SOCIETY_RULES,...MEMORY_RULE_VERSIONS,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion)?{populationCauses:Object.freeze(societyCauses(candidate.eventLog))}:{}),
        emitFact(fact) { return append(validateFact(fact, due.systemId, rulesVersion)); } };
      const returned = systems[due.systemId](context, Object.freeze({ ...due }));
      if (returned && typeof returned.then === 'function') {
        // Observe rejection so a rejected Promise does not escape as an unhandled host error.
        Promise.resolve(returned).catch(() => {});
        throw fault('INVALID_INPUT', 'Asynchronous systems are not supported');
      }
    }
    if(checkEnvelope)requireCondition(envelope() === beforeSystems, 'System changed protected snapshot fields');
    if([PLAYER_RULES,PLAY_RULES,MIND_RULES].includes(rulesVersion) && plan.dueTasks.length){
      const daily=candidate.eventLog.findLast(e=>e.type==='SocietyDaySettled' && e.tick===failedTick);
      requireCondition(daily,'Missing player daily source');append(playerDayFact(s.world,daily.payload));
    }
    if((isMemoryRules(rulesVersion)||rulesVersion===MIND_RULES) && plan.dueTasks.length){
      const memory=rulesVersion===MIND_RULES?finishMindMemoryDay(s.world,candidate.eventLog,failedTick):finishMemoryDay(s.world,candidate.eventLog,failedTick);
      s.world=memory.world;validateMemoryDayPayload(memory.fact.payload);append(memory.fact);
    }
    if(rulesVersion===MIND_RULES && plan.dueTasks.length)s.world=finishMindDay(s.world,candidate.eventLog,failedTick);
    if(rulesVersion===MIND_RULES)s.world.mindModel.cursor=s.nextEventSeq-1;
    if(rulesVersion===MOTIVATION_RULES)motivationRuntimeHooks.afterSystems(s,candidate.eventLog,failedTick,append,motivationContext);
    if(rulesVersion===EXPERIENCE_RULES)experienceRuntimeHooks.afterSystems(s,candidate.eventLog,failedTick,append,motivationContext);
    if(rulesVersion===COGNITION_RULES)cognitionRuntimeHooks.afterSystems(s,candidate.eventLog,failedTick,append,motivationContext);
    if(rulesVersion===SURVIVAL_RULES)survivalRuntimeHooks.afterSystems(s,candidate.eventLog,failedTick,append,motivationContext);
    if(rulesVersion===CAMPAIGN_RULES)campaignRuntimeHooks.afterSystems(s,candidate.eventLog,failedTick,append,motivationContext);
    if(rulesVersion===LIVELIHOOD_RULES)livelihoodRuntimeHooks.afterSystems(s,candidate.eventLog,failedTick,append,motivationContext);
    if(rulesVersion===SCENE_RULES)sceneRuntimeHooks.afterSystems(s,candidate.eventLog,failedTick,append,motivationContext);
    else if(rulesVersion===ENCOUNTER_RULES)encounterRuntimeHooks.afterSystems(s,candidate.eventLog,failedTick,append,motivationContext);
    requireCondition(s.nextEventSeq === nextEventSeq, 'System rewrote event counter');
    requireCondition(s.nextEntityId <= Number.MAX_SAFE_INTEGER, 'Entity ID overflow', 'LIMIT_EXCEEDED');
    requireCondition(Number.isSafeInteger(s.nextEntityId) && s.nextEntityId >= previousEntityId, 'System reduced/invalidated entity ID counter');
    s.nextEventSeq = nextEventSeq;
    s.scheduledTasks = plan.scheduler.tasks; s.rng = rng.getState(); s.tick = failedTick;
    // Encounter rules keep a world clock separate from the commit revision: a real tick advance
    // never moves instantCommits, so revision always equals tick + instantCommits. Legacy rules
    // have no instantCommits counter and keep the historical revision++ semantics.
    s.revision = [ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(rulesVersion) ? failedTick + s.instantCommits : s.revision + 1;
    if (mode === 'full') {
      validateBundle(candidate, { rulesVersion, systems }); return cloneBundle(candidate);
    }
    if (mode === 'session') {
      validateSnapshotStructure(s, { rulesVersion, systems }, candidate.eventLog.length);
      if (execution !== campaignExecution && execution !== campaignBatchExecution) {
        const expected = performTick(bundle, canonicalSystems(rulesVersion), 'proof');
        requireCondition(canonicalJson(s) === canonicalJson(expected.snapshot) &&
          canonicalJson(candidate.eventLog.slice(bundle.eventLog.length)) === canonicalJson(expected.eventLog.slice(bundle.eventLog.length)),
          'Session transition differs from registered rules');
      }
    }
    return candidate;
  } catch (cause) {
    const error = new Error(`Tick ${failedTick ?? 'input'} was not committed`, { cause });
    if (cause.code) error.code = cause.code;
    error.failedTick = failedTick;
    throw error;
  } finally {
    active = false;
  }
}

let canonicalSceneSystems,canonicalLivelihoodSystems,canonicalCampaignSystems;
export function canonicalSystems(rulesVersion) {
  const define = (id, type, settle, usesRng) => ({ [id](ctx) {
    const result = usesRng ? settle(ctx.snapshot.world, ctx.rng.next()) : settle(ctx.snapshot.world);
    ctx.snapshot.world = result.world;
    ctx.emitFact({ type, sourceSystem: id, commandId: null, causationEventSeqs: ctx.populationCauses ?? [], entityIds: [], payload: result.payload });
  } });
  // M4A: the survival profile registers the tick-1 publication task. It emits nothing, so the
  // canonical proof only needs the system id to exist; the quote itself is published by the
  // runtime's beforeSystems hook from the real world state at that tick.
  if (rulesVersion === SURVIVAL_RULES)
    return { society: define('society', 'SocietyDaySettled', survivalRuntimeHooks.settleDay, true).society,
      survival() {} };
  // The encounter profile extends survival: the same day settlement plus an inert encounter
  // system (encounter actions are committed through the DTO3 entry, not a scheduled task).
  if(rulesVersion===CAMPAIGN_RULES){
    canonicalCampaignSystems??=Object.freeze({society:define('society','SocietyDaySettled',campaignRuntimeHooks.settleDay,true).society,survival(){},encounter(){},scene(){}});
    return {...canonicalCampaignSystems};
  }
  if(rulesVersion===LIVELIHOOD_RULES){
    canonicalLivelihoodSystems??=Object.freeze({society:define('society','SocietyDaySettled',livelihoodRuntimeHooks.settleDay,true).society,survival(){},encounter(){},scene(){}});
    return {...canonicalLivelihoodSystems};
  }
  if(rulesVersion===SCENE_RULES){
    canonicalSceneSystems??=Object.freeze({society:define('society','SocietyDaySettled',sceneRuntimeHooks.settleDay,true).society,survival(){},encounter(){},scene(){}});
    return {...canonicalSceneSystems};
  }
  if (rulesVersion === ENCOUNTER_RULES)
    return { society: define('society', 'SocietyDaySettled', encounterRuntimeHooks.settleDay, true).society,
      survival() {}, encounter() {} };
  if (rulesVersion === RESOURCE_RULES) return define('resources', 'ResourceDaySettled', settleResourceDay, false);
  if (rulesVersion === ECOLOGY_RULES) return define('ecology', 'EcologyDaySettled', settleEcologyDay, true);
  if (rulesVersion === MARKET_RULES) return define('market', 'EconomyDaySettled', settleMarketDay, true);
  if (rulesVersion === ACTOR_RULES) return define('actors', 'ActorDaySettled', settleActorDay, true);
  if (rulesVersion === HUNTER_RULES) return define('hunter','HunterDaySettled',settleHunterDay,true);
  if (rulesVersion === SOCIETY_RULES) return define('society','SocietyDaySettled',settleSocietyDay,true);
  if (rulesVersion===MOTIVATION_RULES) return define('society','SocietyDaySettled',motivationRuntimeHooks.settleDay,true);
  if (rulesVersion===EXPERIENCE_RULES) return define('society','SocietyDaySettled',experienceRuntimeHooks.settleDay,true);
  if (rulesVersion===COGNITION_RULES) return define('society','SocietyDaySettled',cognitionRuntimeHooks.settleDay,true);
  if (rulesVersion===SURVIVAL_RULES) return define('society','SocietyDaySettled',survivalRuntimeHooks.settleDay,true);
  if (rulesVersion===MIND_RULES) return define('society','SocietyDaySettled',settleMindSocietyDay,true);
  if (isMemoryRules(rulesVersion)) return define('society','SocietyDaySettled',settleMemorySocietyDay,true);
  throw fault('UNSUPPORTED_VERSION', 'No canonical transition for these rules');
}

function freezeData(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}

export function createSimulationSession(bundle, systems) {
  preflightExperienceData(bundle, true);
  normalizeSystems(systems);
  fields(bundle, ['snapshot', 'eventLog']); record(bundle.snapshot);
  const registered = Object.freeze({ ...systems });
  const canonical=bundle.snapshot.rulesVersion===CAMPAIGN_RULES?canonicalSystems(CAMPAIGN_RULES):null;
  const campaign=canonical!==null&&Object.keys(registered).length===Object.keys(canonical).length&&
    Object.keys(canonical).every(key=>Object.hasOwn(registered,key)&&registered[key]===canonical[key]);
  if(!campaign)validateBundle(bundle, { rulesVersion: bundle.snapshot.rulesVersion, systems: registered });
  requireCondition(['a-smoke-v1', RESOURCE_RULES, ECOLOGY_RULES, MARKET_RULES,ACTOR_RULES,HUNTER_RULES,SOCIETY_RULES,...MEMORY_RULE_VERSIONS,MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(bundle.snapshot.rulesVersion),
    'Session rules are not registered', 'UNSUPPORTED_VERSION');
  // 私有不可变证明可复用；原始输入仍由同一完整审计创建隔离副本。
  let current = campaign?createAuditedBundle(bundle,{rulesVersion:CAMPAIGN_RULES,systems:registered}):freezeData(cloneBundle(bundle)), busy = false;
  const stats = { idleTicks: 0, activityTicks: 0 };
  return Object.freeze({
    advanceTicks(amount) {
      requireCondition(!busy, 'Session cannot be reentered'); integer(amount);
      requireCondition(amount <= MAX_ADVANCE_TICKS, 'Advance budget exceeded', 'LIMIT_EXCEEDED');
      const clock = restoreClock({ tick: current.snapshot.tick, tickMinutes: current.snapshot.tickMinutes });
      clock.advanceTicks(amount); const target = clock.tick;
      busy = true;
      const prior=current,priorStats={...stats};
      try {
        while (current.snapshot.tick < target) {
          let nextActivity = Infinity;
          for (const command of current.snapshot.pendingCommands) nextActivity = Math.min(nextActivity, command.targetTick);
          for (const task of current.snapshot.scheduledTasks) nextActivity = Math.min(nextActivity, task.nextDueTick);
          if ([MIND_RULES,MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(current.snapshot.rulesVersion)) {
            // Tick 1 is an activity tick under the survival rules so the public food quote is
            // published with the real opening price/stock instead of a later reconstruction.
            if ((current.snapshot.rulesVersion === SURVIVAL_RULES || current.snapshot.rulesVersion === ENCOUNTER_RULES || current.snapshot.rulesVersion === SCENE_RULES || current.snapshot.rulesVersion === LIVELIHOOD_RULES) && current.snapshot.tick === 0) nextActivity = 1;
            const mind = current.snapshot.world.mindModel;
            if (mind.scriptCursor < mind.config.stimuli.length)
              nextActivity = Math.min(nextActivity, mind.config.stimuli[mind.scriptCursor].tick);
          }
          if([MOTIVATION_RULES,EXPERIENCE_RULES,COGNITION_RULES,SURVIVAL_RULES,ENCOUNTER_RULES,SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(current.snapshot.rulesVersion)){const motivation=current.snapshot.world.motivationModel;
            if(motivation.requestCursor<motivation.config.requests.length)nextActivity=Math.min(nextActivity,motivation.config.requests[motivation.requestCursor].tick);}
          if(current.snapshot.rulesVersion===CAMPAIGN_RULES)nextActivity=current.snapshot.tick+1;
          const idleTarget = Math.min(target, nextActivity - 1);
          if (idleTarget > current.snapshot.tick) {
            const advanced = idleTarget - current.snapshot.tick;
            // Private unchanged history/world remain deeply frozen; no provider receives them.
            const snapshot = freezeData({ ...current.snapshot, tick: idleTarget,
              revision: idleTarget + (current.snapshot.instantCommits ?? 0) });
            current = Object.freeze({ snapshot, eventLog: current.eventLog }); stats.idleTicks += advanced;
          }
          if (current.snapshot.tick < target) {
            const mode = current.snapshot.rulesVersion === 'a-smoke-v1' ? 'full' : 'session';
            current = freezeData(performTick(current, registered, mode)); stats.activityTicks++;
          }
        }
        return { tick: current.snapshot.tick };
      } catch(error) {
        // Scene advances are one candidate transaction: a late failure publishes no prefix.
        if([SCENE_RULES,LIVELIHOOD_RULES,CAMPAIGN_RULES].includes(prior.snapshot.rulesVersion)){current=prior;Object.assign(stats,priorStats);}
        throw error;
      } finally { busy = false; }
    },
    getBundle() {
      validateBundle(current, { rulesVersion: current.snapshot.rulesVersion, systems: registered });
      return cloneBundle(current);
    },
    getStats() { return { ...stats }; },
  });
}
