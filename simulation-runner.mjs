import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createClockSmoke, CLOCK_SMOKE_RULES } from './runtime/fixtures/clock-smoke.mjs';
import { createResourceVillage } from './runtime/fixtures/resource-village.mjs';
import { RESOURCE_RULES } from './runtime/core/resource-ledger.mjs';
import { createEcologyVillage, createDeerShock } from './runtime/fixtures/ecology-village.mjs';
import { ECOLOGY_RULES } from './runtime/core/ecology.mjs';
import { MARKET_RULES } from './runtime/core/market.mjs';
import { createMarketVillage, createMarketShortage, createMarketRoutePause } from './runtime/fixtures/market-village.mjs';
import { B4_SCENARIOS, createB4Fixture } from './runtime/fixtures/b4-calibrated.mjs';
import { ACTOR_RULES } from './runtime/core/actors.mjs';
import { createActorVillage,createActorNeeds,createActorShortage } from './runtime/fixtures/actor-village.mjs';
import { HUNTER_RULES } from './runtime/core/hunter.mjs';
import { createHunterVillage,createHunterRecovery,createHunterHunger } from './runtime/fixtures/hunter-village.mjs';
import { createSimulationSession } from './runtime/core/command-engine.mjs';
import { canonicalJson, fields, integer, record, fault, requireCondition } from './runtime/core/data-contract.mjs';
import { saveCheckpoint, loadCheckpoint } from './runtime/persistence/checkpoint-store.mjs';

const root = fileURLToPath(new URL('./', import.meta.url));
const hash = (value) => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
const profiles = new Map([
  ['clock-smoke', { rulesVersion: CLOCK_SMOKE_RULES, create: createClockSmoke }],
  ['resource-village', { rulesVersion: RESOURCE_RULES, create: createResourceVillage }],
  ['ecology-village', { rulesVersion: ECOLOGY_RULES, create: createEcologyVillage }],
  ['ecology-deer-shock', { rulesVersion: ECOLOGY_RULES, create: createDeerShock }],
  ['market-village', { rulesVersion: MARKET_RULES, create: createMarketVillage }],
  ['market-shortage', { rulesVersion: MARKET_RULES, create: createMarketShortage }],
  ['market-route-pause', { rulesVersion: MARKET_RULES, create: createMarketRoutePause }],
  ...B4_SCENARIOS.map(scenario=>['b4-'+scenario,{rulesVersion:MARKET_RULES,create:(seed,id)=>createB4Fixture(scenario,seed,id)}]),
  ['actor-village',{rulesVersion:ACTOR_RULES,create:createActorVillage}],
  ['actor-needs',{rulesVersion:ACTOR_RULES,create:createActorNeeds}],
  ['actor-shortage',{rulesVersion:ACTOR_RULES,create:createActorShortage}],
  ['hunter-village',{rulesVersion:HUNTER_RULES,create:createHunterVillage}],
  ['hunter-recovery',{rulesVersion:HUNTER_RULES,create:createHunterRecovery}],
  ['hunter-hunger',{rulesVersion:HUNTER_RULES,create:createHunterHunger}],
]);
const actorPayload=event=>event.type==='HunterDaySettled'?event.payload.actors:event.type==='ActorDaySettled'?event.payload:undefined;
const marketPayload=event=>actorPayload(event)?.market??(event.type==='EconomyDaySettled'?event.payload:undefined);

async function selectSimulation(options) {
  if (!options.resume) {
    const profile = profiles.get(options.fixture);
    requireCondition(profile, 'Unknown fixture');
    return profile.create(options.seed, `${options.fixture}-seed-${options.seed}`);
  }
  // Explicit registered-version dispatch. Only a version mismatch permits the next profile;
  // corruption, I/O errors and budget failures stop immediately. No legacy shape inference.
  for (const profile of profiles.values()) {
    const { systems } = profile.create();
    let bundle;
    try { bundle = await loadCheckpoint(options.resume, { rulesVersion: profile.rulesVersion, systems }); }
    catch (error) { if (error.code === 'UNSUPPORTED_VERSION') continue; throw error; }
    requireCondition(profiles.get(bundle.snapshot.fixtureId)?.rulesVersion === profile.rulesVersion && bundle.snapshot.fixtureVersion === '1', 'Unknown fixture version', 'UNSUPPORTED_VERSION');
    return { bundle, systems };
  }
  throw fault('UNSUPPORTED_VERSION', 'Checkpoint does not match a registered fixture/rules version');
}

export function parseArguments(argv) {
  requireCondition(Array.isArray(argv) && argv.every((value) => typeof value === 'string'), 'Expected argument strings');
  const flags = new Map(); const allowed = new Set(['--fixture', '--resume', '--days', '--seed', '--out']);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    requireCondition(allowed.has(flag) && !flags.has(flag) && value && !value.startsWith('--'), 'Unknown/duplicate/missing argument');
    flags.set(flag, value);
  }
  const decimal = (value) => {
    requireCondition(typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value), 'Expected decimal integer');
    const result = Number(value); integer(result); return result;
  };
  const days = decimal(flags.get('--days')); requireCondition(days >= 1, 'Days must be positive');
  requireCondition(days <= 1000, 'Advance budget exceeded', 'LIMIT_EXCEEDED');
  const fixture = flags.get('--fixture'), resume = flags.get('--resume'), out = flags.get('--out');
  requireCondition(typeof out === 'string' && out.length > 0, 'New output directory required');
  requireCondition(Boolean(fixture) !== Boolean(resume), 'Select exactly one of fixture or resume');
  requireCondition(!resume || !flags.has('--seed'), 'Resume cannot supply seed');
  const seed = resume ? undefined : decimal(flags.get('--seed') ?? '42');
  if (!resume) requireCondition(seed <= 0xffffffff, 'Seed must be uint32');
  return { fixture, resume, days, ticks: days * 144, seed, out };
}

async function codeIdentity() {
  let codeSha = null, codeDirty = null, codeMetadataStatus = 'unavailable';
  try {
    const opts = { cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] };
    codeSha = execFileSync('git', ['rev-parse', 'HEAD'], opts).trim();
    codeDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], opts).trim().length > 0;
    codeMetadataStatus = 'available';
  } catch { codeSha = null; codeDirty = null; }
  const files = { 'simulation-runner.mjs': createHash('sha256').update(await fs.readFile(path.join(root, 'simulation-runner.mjs'))).digest('hex') };
  for (const directory of ['runtime/core', 'runtime/persistence', 'runtime/fixtures', 'runtime/experiments']) {
    for (const name of (await fs.readdir(path.join(root, directory))).filter((name) => name.endsWith('.mjs')).sort()) {
      files[directory + '/' + name] = createHash('sha256').update(await fs.readFile(path.join(root, directory, name))).digest('hex');
    }
  }
  return { codeSha, codeDirty, codeMetadataStatus, sourceHash: hash(files) };
}

function completeInputs(snapshot) {
  return [...snapshot.pendingCommands, ...Object.entries(snapshot.commandReceipts).map(([commandId, receipt]) =>
    ({ commandId, inputSeq: receipt.inputSeq, ...receipt.input }))].sort((a, b) => a.inputSeq - b.inputSeq);
}
async function writeEvents(file, events) {
  const columns = ['eventSeq', 'tick', 'type', 'schemaVersion', 'sourceSystem', 'commandId', 'causationEventSeqs', 'entityIds', 'payload'];
  const cell = (value) => '"' + (value === null ? '' : typeof value === 'object' ? canonicalJson(value) : String(value)).replaceAll('"', '""') + '"';
  const handle = await fs.open(file, 'wx');
  try {
    await handle.writeFile(columns.join(',') + '\n');
    for (const event of events) await handle.writeFile(columns.map((key) => cell(event[key])).join(',') + '\n');
  } finally { await handle.close(); }
}

async function writeEconomy(file, events) {
  const columns = ['day', 'resource', 'opening', 'production', 'inflow', 'demand', 'consumption', 'unmetConsumption',
    'requestedOutflow', 'outflow', 'unmetOutflow', 'loss', 'capacityLoss', 'closing',
    'productionRemainder', 'consumptionRemainder', 'lossRemainder'];
  const handle = await fs.open(file, 'wx');
  try {
    await handle.writeFile(columns.join(',') + '\n');
    for (const event of events) {
      if (!['ResourceDaySettled', 'EcologyDaySettled', 'EconomyDaySettled','ActorDaySettled','HunterDaySettled'].includes(event.type)) continue;
      const market=marketPayload(event);
      const payload = market ? market.ecology.resources :
        event.type === 'EcologyDaySettled' ? event.payload.resources : event.payload;
      for (const row of payload.entries) {
        const data = { day: payload.day, ...row, productionRemainder: row.remainders.production,
          consumptionRemainder: row.remainders.consumption, lossRemainder: row.remainders.loss };
        if (market && row.resource === 'gold') {
          // The ecology sub-ledger precedes purchases; export the complete day's cash ledger.
          data.demand = market.goldSpent; data.consumption = market.goldSpent;
          data.closing = market.goldClosing;
        }
        await handle.writeFile(columns.map(key => String(data[key])).join(',') + '\n');
      }
    }
  } finally { await handle.close(); }
}

async function writeEcology(directory, events) {
  const hasActors=events.some(event=>actorPayload(event));
  const populationColumns = ['day','deer','wolves','injuredCount',...(hasActors?['totalAlive','namedAlive','unnamedAlive']:[])];
  const ecologyColumns = ['day','predationDemand','unmetPredation','pressurePermille','hungryWolves','farmLossRequested','farmLoss',
    'hunters','huntTarget','foodWorkers','herbWorkers','injuredOpening','newInjuries','healed','injuredClosing','sample',
    'deerOpening','deerBirths','deerNaturalDeaths','deerPredation','deerHunted','deerClosing',
    'wolvesOpening','wolvesBirths','wolvesNaturalDeaths','wolvesStarvationDeaths','wolvesHunted','wolvesClosing'];
  for (const [file, columns] of [['population.csv',populationColumns],['ecology.csv',ecologyColumns]]) {
    const handle = await fs.open(path.join(directory,file),'wx');
    try {
      await handle.writeFile(columns.join(',')+'\n');
      for (const event of events) if (['EcologyDaySettled', 'EconomyDaySettled','ActorDaySettled','HunterDaySettled'].includes(event.type)) {
        const p = marketPayload(event)?.ecology??event.payload;
        const row = file === 'population.csv' ? {day:p.day,deer:p.deer.closing,wolves:p.wolves.closing,injuredCount:p.injuredClosing} : {...p};
        if(file==='population.csv' && hasActors)Object.assign(row,actorPayload(event).populationClosing);
        if (file === 'ecology.csv') for (const id of ['deer','wolves']) for (const [key,value] of Object.entries(p[id]))
          row[id+key[0].toUpperCase()+key.slice(1)] = value;
        await handle.writeFile(columns.map(key=>String(row[key])).join(',')+'\n');
      }
    } finally { await handle.close(); }
  }
}

async function writeMarket(directory, events) {
  const marketColumns = ['day','resource','previous','gapPermille','target','current','routeOpen','inTransitUnits'];
  const tradeColumns = ['day','action','shipmentId','resource','amount','unitPrice','cost','paidAmount','orderDay','dueDay'];
  for (const [file,columns] of [['market.csv',marketColumns],['trade.csv',tradeColumns]]) {
    const handle = await fs.open(path.join(directory,file),'wx');
    try {
      await handle.writeFile(columns.join(',')+'\n');
      for (const event of events) if (marketPayload(event)) {
        const p = marketPayload(event);
        if (file === 'market.csv') for (const resource of ['food','herbs']) {
          const row = {day:p.day,resource,...p.prices[resource],routeOpen:p.routeOpen,inTransitUnits:p.inTransitUnits};
          await handle.writeFile(columns.map(key=>String(row[key])).join(',')+'\n');
        } else for (const [action,orders] of [['ordered',p.orders],['arrived',p.arrivals]]) for (const order of orders) {
          const row = {day:p.day,action,...order,paidAmount:action==='ordered'?order.cost:0};
          await handle.writeFile(columns.map(key=>String(row[key])).join(',')+'\n');
        }
      }
    } finally { await handle.close(); }
  }
}

async function writeActors(file,events) {
  const columns=['day','actorId','name','occupation','location','simulationLevel','alive','health','hunger','fatigue','foodNeed','healingNeed','restNeed','food','herbs','died','deathTick','lastNeedsTick'];
  const cell=value=>'"'+(value===null?'':String(value)).replaceAll('"','""')+'"';
  const handle=await fs.open(file,'wx');
  try {
    await handle.writeFile(columns.join(',')+'\n');
    for(const event of events)if(actorPayload(event))for(const row of actorPayload(event).rows) {
      const actor=row.closing,data={day:actorPayload(event).day,...actor,foodNeed:actor.needs.food,healingNeed:actor.needs.healing,restNeed:actor.needs.rest,
        food:row.food,herbs:row.herbs,died:row.died};
      await handle.writeFile(columns.map(key=>cell(data[key])).join(',')+'\n');
    }
  } finally { await handle.close(); }
}

async function writeHunter(directory,bundle) {
  const columns=['day','actorId','action','goalId','goalKind','goalStep','goalOutcome','goalFailures','deadlineDay','wallet','communalGold','privateFood','privateHerbs','foodUsed','herbsUsed','wages','spentFood','spentMedicine'];
  const handle=await fs.open(path.join(directory,'hunter.csv'),'wx');
  try {
    await handle.writeFile(columns.join(',')+'\n');
    for(const event of bundle.eventLog)if(event.type==='HunterDaySettled'){
      const p=event.payload,row={day:p.day,actorId:p.actors.privateAllocation.actorId,action:p.decision?.action??'None',goalId:p.decision?.goalId??0,
        goalKind:p.decision?.kind??'dead',goalStep:p.currentGoal?.step??'',goalOutcome:p.goalOutcome,goalFailures:p.currentGoal?.failures??0,deadlineDay:p.currentGoal?.deadlineDay??'',
        wallet:p.wallet,communalGold:p.communalGold,privateFood:p.inventory.food,privateHerbs:p.inventory.herbs,
        foodUsed:p.ledger.foodUsed,herbsUsed:p.ledger.herbsUsed,wages:p.ledger.wages,spentFood:p.ledger.spentFood,spentMedicine:p.ledger.spentMedicine};
      await handle.writeFile(columns.map(key=>String(row[key])).join(',')+'\n');
    }
  }finally{await handle.close();}
  const actionColumns=['inputSeq','day','commandId','actorId','goalId','action','status','price','walletBefore','walletAfter','communalBefore','communalAfter','foodProduced','deerKilled','injuryDamage','sample'];
  const actions=await fs.open(path.join(directory,'actions.csv'),'wx');
  try{
    await actions.writeFile(actionColumns.join(',')+'\n');
    const receipts=Object.entries(bundle.snapshot.commandReceipts).filter(([,r])=>r.input.type==='ActorAction').sort((a,b)=>a[1].inputSeq-b[1].inputSeq);
    for(const [commandId,r] of receipts){const result=r.result,row={inputSeq:r.inputSeq,day:r.input.targetTick/144,commandId,...r.input.payload,status:r.status,
      price:result.price??0,walletBefore:result.before?.wallet??'',walletAfter:result.after?.wallet??'',communalBefore:result.before?.communalGold??'',communalAfter:result.after?.communalGold??'',
      foodProduced:result.foodProduced??0,deerKilled:result.deerKilled??0,injuryDamage:result.injuryDamage??0,sample:result.sample??''};
      await actions.writeFile(actionColumns.map(key=>String(row[key])).join(',')+'\n');}
  }finally{await actions.close();}
}

export async function runSimulation(options, hooks = {}) {
  fields(options, ['fixture', 'resume', 'days', 'ticks', 'seed', 'out']);
  record(hooks); requireCondition(Object.keys(hooks).every((key) => key === 'transformSystems'), 'Unknown test hook');
  requireCondition(hooks.transformSystems === undefined || typeof hooks.transformSystems === 'function', 'Invalid system hook');
  integer(options.days, 1);
  requireCondition(options.days <= 1000 && options.ticks === options.days * 144, 'Invalid advance budget', 'LIMIT_EXCEEDED');
  requireCondition(typeof options.out === 'string' && options.out.length > 0, 'New output directory required');
  requireCondition(Boolean(options.fixture) !== Boolean(options.resume), 'Select fixture or resume');
  if (options.resume) requireCondition(options.seed === undefined, 'Resume cannot supply seed');
  else { integer(options.seed); requireCondition(options.seed <= 0xffffffff, 'Seed must be uint32'); }
  const started = performance.now(), identity = await codeIdentity();
  let { bundle, systems } = await selectSimulation(options);
  if (hooks.transformSystems) systems = hooks.transformSystems(systems);
  const startTick = bundle.snapshot.tick, directory = path.resolve(options.out);
  try {
    await fs.mkdir(path.dirname(directory), { recursive: true });
    await fs.mkdir(directory); // Exclusive creation: even an existing empty directory is refused.
  } catch (cause) { throw Object.assign(fault('SAVE_FAILED', 'Output directory must be new'), { cause }); }
  let failure;
  const session = createSimulationSession(bundle, systems);
  try { session.advanceTicks(options.ticks); }
  catch (cause) { failure = cause; }
  bundle = session.getBundle();
  let checkpointPath;
  try {
    checkpointPath = await saveCheckpoint(bundle, { directory, rulesVersion: bundle.snapshot.rulesVersion, systems });
    await fs.writeFile(path.join(directory, 'inputs.json'), JSON.stringify(completeInputs(bundle.snapshot), null, 2), { flag: 'wx' });
    await writeEvents(path.join(directory, 'events.csv'), bundle.eventLog);
    const resourceConfig = [RESOURCE_RULES, ECOLOGY_RULES, MARKET_RULES,ACTOR_RULES,HUNTER_RULES].includes(bundle.snapshot.rulesVersion) ? bundle.snapshot.world.resourceModel.config : undefined;
    const ecologyConfig = [ECOLOGY_RULES, MARKET_RULES,ACTOR_RULES,HUNTER_RULES].includes(bundle.snapshot.rulesVersion) ? bundle.snapshot.world.ecologyModel.config : undefined;
    const marketConfig = [MARKET_RULES,ACTOR_RULES,HUNTER_RULES].includes(bundle.snapshot.rulesVersion) ? bundle.snapshot.world.marketModel.config : undefined;
    const actorConfig = [ACTOR_RULES,HUNTER_RULES].includes(bundle.snapshot.rulesVersion)?bundle.snapshot.world.actorModel.config:undefined;
    const hunterConfig=bundle.snapshot.rulesVersion===HUNTER_RULES?bundle.snapshot.world.hunterModel.config:undefined;
    if (resourceConfig) {
      await fs.writeFile(path.join(directory, 'resource-config.json'), JSON.stringify(resourceConfig, null, 2), { flag: 'wx' });
      await writeEconomy(path.join(directory, 'economy.csv'), bundle.eventLog);
    }
    if (ecologyConfig) {
      await fs.writeFile(path.join(directory,'ecology-config.json'),JSON.stringify(ecologyConfig,null,2),{flag:'wx'});
      await writeEcology(directory,bundle.eventLog);
    }
    if (marketConfig) {
      await fs.writeFile(path.join(directory,'market-config.json'),JSON.stringify(marketConfig,null,2),{flag:'wx'});
      await writeMarket(directory,bundle.eventLog);
    }
    if(actorConfig) {
      await fs.writeFile(path.join(directory,'actor-config.json'),JSON.stringify(actorConfig,null,2),{flag:'wx'});
      await writeActors(path.join(directory,'actors.csv'),bundle.eventLog);
    }
    if(hunterConfig){
      await fs.writeFile(path.join(directory,'hunter-config.json'),JSON.stringify(hunterConfig,null,2),{flag:'wx'});
      await writeHunter(directory,bundle);
    }
    const summary = { status: failure ? 'failed' : 'succeeded', ...identity, nodeVersion: process.version,
      fixtureId: bundle.snapshot.fixtureId, fixtureVersion: bundle.snapshot.fixtureVersion,
      rulesVersion: bundle.snapshot.rulesVersion, simulationId: bundle.snapshot.simulationId,
      seed: bundle.snapshot.rng.seed, startTick, tick: bundle.snapshot.tick, revision: bundle.snapshot.revision,
      eventCount: bundle.eventLog.length, stateHash: hash(bundle.snapshot), eventHash: hash(bundle.eventLog),
      ...(resourceConfig ? { resourceConfigHash: hash(resourceConfig) } : {}),
      ...(ecologyConfig ? { ecologyConfigHash: hash(ecologyConfig) } : {}),
      ...(marketConfig ? { marketConfigHash: hash(marketConfig) } : {}),
      ...(actorConfig ? { actorConfigHash: hash(actorConfig) } : {}),
      ...(hunterConfig?{hunterConfigHash:hash(hunterConfig)}:{}),
      systemOverride: Boolean(hooks.transformSystems), failedTick: failure?.failedTick ?? null,
      executionStats: session.getStats(),
      error: failure ? { code: failure.code ?? 'SIMULATION_FAILED', message: failure.cause?.message ?? failure.message } : null,
      elapsedMs: performance.now() - started, memoryUsage: process.memoryUsage(), checkpointPath };
    await fs.writeFile(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2), { flag: 'wx' });
    if (failure) throw Object.assign(fault(failure.code ?? 'SIMULATION_FAILED', 'Simulation stopped at failed tick'),
      { cause: failure, failedTick: failure.failedTick, summary });
    return summary;
  } catch (cause) {
    if (cause.summary) throw cause;
    throw Object.assign(fault('SAVE_FAILED', 'Simulation artifacts were not fully saved'), { cause, lastCommittedTick: bundle.snapshot.tick, checkpointPath });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = await runSimulation(parseArguments(process.argv.slice(2)));
    console.log(JSON.stringify({ status: summary.status, tick: summary.tick, checkpointPath: summary.checkpointPath,
      stateHash: summary.stateHash, eventHash: summary.eventHash }));
  } catch (error) {
    console.error(`ERROR ${error.code ?? 'SIMULATION_FAILED'}: ${error.message}`);
    process.exitCode = 1;
  }
}
