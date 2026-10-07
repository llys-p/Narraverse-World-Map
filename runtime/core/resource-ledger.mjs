import { cloneData, fields, integer, denseArray, canonicalJson, requireCondition } from './data-contract.mjs';

export const RESOURCE_RULES = 'b-resources-v1';
export const MAX_RESOURCE_DAYS = 10000; // Protection budget, not a performance promise.
const IDS = ['food', 'herbs', 'gold'];
const TOTALS = ['production', 'inflow', 'consumption', 'outflow', 'loss', 'capacityLoss', 'unmetConsumption', 'unmetOutflow'];
const ROW_FIELDS = ['resource', 'opening', 'production', 'inflow', 'demand', 'consumption', 'unmetConsumption',
  'requestedOutflow', 'outflow', 'unmetOutflow', 'loss', 'capacityLoss', 'closing', 'remainders'];
const carry = () => ({ production: 0, consumption: 0, loss: 0 });
const totals = () => Object.fromEntries(TOTALS.map(key => [key, 0]));
function safe(value) {
  requireCondition(value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER), 'Resource arithmetic overflow', 'LIMIT_EXCEEDED');
  return Number(value);
}
function rate(value) {
  fields(value, ['numerator', 'denominator']); integer(value.numerator); integer(value.denominator, 1);
}

export function defaultResourceConfig() {
  return { version: 'resource-config-v1', periodTicks: 144,
    units: { food: 'ration', herbs: 'treatment', gold: 'minor-coin' },
    settlement: { humanCount: 80, foodWorkers: 60, herbWorkers: 4, injuredCount: 0 },
    populations: { deer: 120, wolves: 14 },
    resources: {
      food: { initial: 900, capacity: 1800, production: { numerator: 8, denominator: 5 },
        consumption: { numerator: 1, denominator: 1 }, lossPermille: 5 },
      herbs: { initial: 80, capacity: 160, production: { numerator: 3, denominator: 8 },
        consumption: { numerator: 1, denominator: 1 }, lossPermille: 10 },
      gold: { initial: 20000 },
    }, flows: [] };
}

function validateConfig(config) {
  fields(config, ['version', 'periodTicks', 'units', 'settlement', 'populations', 'resources', 'flows']);
  requireCondition(config.version === 'resource-config-v1', 'Unknown resource configuration version', 'UNSUPPORTED_VERSION');
  requireCondition(config.periodTicks === 144, 'Daily settlement requires 144 ticks');
  fields(config.units, IDS);
  requireCondition(config.units.food === 'ration' && config.units.herbs === 'treatment' && config.units.gold === 'minor-coin', 'Unknown resource units');
  fields(config.settlement, ['humanCount', 'foodWorkers', 'herbWorkers', 'injuredCount']);
  const village = config.settlement;
  for (const value of Object.values(village)) integer(value);
  requireCondition(BigInt(village.foodWorkers) + BigInt(village.herbWorkers) + BigInt(village.injuredCount) <= BigInt(village.humanCount), 'Impossible labour/injury allocation');
  fields(config.populations, ['deer', 'wolves']); for (const value of Object.values(config.populations)) integer(value);
  fields(config.resources, IDS);
  for (const id of ['food', 'herbs']) {
    const spec = config.resources[id]; fields(spec, ['initial', 'capacity', 'production', 'consumption', 'lossPermille']);
    integer(spec.initial); integer(spec.capacity); integer(spec.lossPermille);
    requireCondition(spec.initial <= spec.capacity && spec.lossPermille <= 1000, 'Invalid initial stock/capacity/loss');
    rate(spec.production); rate(spec.consumption);
  }
  fields(config.resources.gold, ['initial']); integer(config.resources.gold.initial);
  denseArray(config.flows, 1000);
  for (const flow of config.flows) {
    fields(flow, ['day', 'resource', 'direction', 'amount']); integer(flow.day, 1); integer(flow.amount, 1);
    requireCondition(flow.day <= MAX_RESOURCE_DAYS && ['food', 'herbs'].includes(flow.resource) && ['in', 'out'].includes(flow.direction), 'Invalid fixture resource flow');
  }
}

export function createResourceWorld(config = defaultResourceConfig()) {
  validateConfig(config); // Reject budgets/record shapes before allocating copies.
  const copy = cloneData(config);
  return { resources: Object.fromEntries(IDS.map(id => [id, copy.resources[id].initial])),
    resourceModel: { config: copy, configFingerprint: canonicalJson(copy), day: 0,
      remainders: { food: carry(), herbs: carry() }, ledger: Object.fromEntries(IDS.map(id => [id, totals()])) } };
}

export function validateResourceWorld(world, currencySpent = 0) {
  integer(currencySpent);
  fields(world, ['resources', 'resourceModel']); fields(world.resources, IDS);
  const model = world.resourceModel; fields(model, ['config', 'configFingerprint', 'day', 'remainders', 'ledger']); validateConfig(model.config);
  requireCondition(model.configFingerprint === canonicalJson(model.config), 'Resource configuration fingerprint mismatch');
  integer(model.day); requireCondition(model.day <= MAX_RESOURCE_DAYS, 'Resource history day budget exceeded', 'LIMIT_EXCEEDED');
  fields(model.remainders, ['food', 'herbs']); fields(model.ledger, IDS);
  for (const id of IDS) {
    const balance = world.resources[id], ledger = model.ledger[id]; integer(balance); fields(ledger, TOTALS);
    for (const value of Object.values(ledger)) integer(value);
    const expected = BigInt(model.config.resources[id].initial) + BigInt(ledger.production) + BigInt(ledger.inflow)
      - BigInt(ledger.consumption) - BigInt(ledger.outflow) - BigInt(ledger.loss) - BigInt(ledger.capacityLoss);
    requireCondition(expected === BigInt(balance), 'Cumulative resource ledger does not reconcile');
    if (id === 'gold') {
      requireCondition(TOTALS.every(key => ledger[key] === (key === 'consumption' ? currencySpent : 0)), 'Currency payment ledger mismatch'); continue;
    }
    const spec = model.config.resources[id], remainder = model.remainders[id];
    fields(remainder, ['production', 'consumption', 'loss']); for (const value of Object.values(remainder)) integer(value);
    requireCondition(balance <= spec.capacity && remainder.production < spec.production.denominator &&
      remainder.consumption < spec.consumption.denominator && remainder.loss < 1000, 'Invalid stock or carried remainder');
  }
}

function fractional(quantity, fraction, remainder) {
  const numerator = BigInt(quantity) * BigInt(fraction.numerator) + BigInt(remainder);
  const denominator = BigInt(fraction.denominator);
  return { amount: safe(numerator / denominator), remainder: safe(numerator % denominator) };
}

export function settleResourceDay(input, modifiers, trade, populationLoss = 0) {
  integer(populationLoss);
  if (trade !== undefined) {
    fields(trade, ['currencySpent', 'inflows']); integer(trade.currencySpent);
    fields(trade.inflows, ['food', 'herbs']); integer(trade.inflows.food); integer(trade.inflows.herbs);
  }
  const currencySpent = trade?.currencySpent ?? 0;
  validateResourceWorld(input, currencySpent);
  requireCondition(populationLoss <= input.resourceModel.config.settlement.humanCount, 'Invalid declared population loss');
  if (modifiers !== undefined) {
    fields(modifiers, ['settlement', 'foodBonus', 'foodDamage']);
    fields(modifiers.settlement, ['humanCount', 'foodWorkers', 'herbWorkers', 'injuredCount']);
    for (const value of Object.values(modifiers.settlement)) integer(value);
    requireCondition(BigInt(modifiers.settlement.foodWorkers) + BigInt(modifiers.settlement.herbWorkers) + BigInt(modifiers.settlement.injuredCount)
      <= BigInt(modifiers.settlement.humanCount), 'Invalid daily labour allocation');
    requireCondition(modifiers.settlement.humanCount === input.resourceModel.config.settlement.humanCount - populationLoss, 'Daily population does not match declared loss');
    integer(modifiers.foodBonus); integer(modifiers.foodDamage);
  }
  requireCondition(populationLoss === 0 || modifiers !== undefined, 'Population loss requires explicit settlement');
  const world = cloneData(input);
  const model = world.resourceModel, config = model.config, day = model.day + 1;
  requireCondition(day <= MAX_RESOURCE_DAYS, 'Resource history day budget exceeded', 'LIMIT_EXCEEDED');
  const entries = [];
  for (const id of IDS) {
    const opening = world.resources[id];
    const row = { resource: id, opening, production: 0, inflow: 0, demand: 0, consumption: 0,
      unmetConsumption: 0, requestedOutflow: 0, outflow: 0, unmetOutflow: 0, loss: 0, capacityLoss: 0,
      closing: opening, remainders: carry() };
    if (id !== 'gold') {
      const spec = config.resources[id], remainder = model.remainders[id], village = modifiers?.settlement ?? config.settlement;
      const production = fractional(id === 'food' ? village.foodWorkers : village.herbWorkers, spec.production, remainder.production);
      const demand = fractional(id === 'food' ? village.humanCount : village.injuredCount, spec.consumption, remainder.consumption);
      row.production = production.amount; row.demand = demand.amount;
      if (id === 'food' && modifiers) row.production = safe(BigInt(row.production) + BigInt(modifiers.foodBonus));
      for (const flow of config.flows) if (flow.day === day && flow.resource === id) {
        const key = flow.direction === 'in' ? 'inflow' : 'requestedOutflow';
        row[key] = safe(BigInt(row[key]) + BigInt(flow.amount));
      }
      if (trade) row.inflow = safe(BigInt(row.inflow) + BigInt(trade.inflows[id]));
      let stock = safe(BigInt(opening) + BigInt(row.production) + BigInt(row.inflow));
      const farmLoss = id === 'food' && modifiers ? Math.min(stock, modifiers.foodDamage) : 0;
      stock -= farmLoss;
      row.consumption = Math.min(stock, row.demand); row.unmetConsumption = row.demand - row.consumption; stock -= row.consumption;
      row.outflow = Math.min(stock, row.requestedOutflow); row.unmetOutflow = row.requestedOutflow - row.outflow; stock -= row.outflow;
      const loss = fractional(stock, { numerator: spec.lossPermille, denominator: 1000 }, remainder.loss);
      row.loss = safe(BigInt(loss.amount) + BigInt(farmLoss)); stock -= loss.amount;
      row.capacityLoss = Math.max(0, stock - spec.capacity); row.closing = stock - row.capacityLoss;
      row.remainders = { production: production.remainder, consumption: demand.remainder, loss: loss.remainder };
      model.remainders[id] = cloneData(row.remainders);
    }
    for (const key of TOTALS) model.ledger[id][key] = safe(BigInt(model.ledger[id][key]) + BigInt(row[key]));
    world.resources[id] = row.closing; entries.push(row);
  }
  model.day = day; validateResourceWorld(world, currencySpent);
  return { world, payload: { day, entries } };
}

export function validateResourcePayload(payload) {
  fields(payload, ['day', 'entries']); integer(payload.day, 1); denseArray(payload.entries, 3);
  requireCondition(payload.day <= MAX_RESOURCE_DAYS && payload.entries.length === 3, 'Invalid resource settlement day/rows');
  for (const [index, row] of payload.entries.entries()) {
    fields(row, ROW_FIELDS); requireCondition(row.resource === IDS[index], 'Wrong resource order/identity');
    for (const key of ROW_FIELDS.filter(key => key !== 'resource' && key !== 'remainders')) integer(row[key]);
    fields(row.remainders, ['production', 'consumption', 'loss']); for (const value of Object.values(row.remainders)) integer(value);
    requireCondition(BigInt(row.closing) === BigInt(row.opening) + BigInt(row.production) + BigInt(row.inflow) - BigInt(row.consumption)
      - BigInt(row.outflow) - BigInt(row.loss) - BigInt(row.capacityLoss), 'Daily resource ledger does not reconcile');
    requireCondition(row.demand === row.consumption + row.unmetConsumption && row.requestedOutflow === row.outflow + row.unmetOutflow, 'Resource demand/shortfall mismatch');
  }
}

// Recompute every settled day from saved configuration, rather than trusting cumulative totals.
export function validateResourceHistory(world, payloads) {
  validateResourceWorld(world); denseArray(payloads, MAX_RESOURCE_DAYS);
  requireCondition(payloads.length === world.resourceModel.day, 'Missing/duplicate resource day');
  let expected = createResourceWorld(world.resourceModel.config);
  for (const payload of payloads) {
    validateResourcePayload(payload);
    const result = settleResourceDay(expected);
    requireCondition(canonicalJson(result.payload) === canonicalJson(payload), 'Resource history disagrees with rules/configuration');
    expected = result.world;
  }
  requireCondition(canonicalJson(world) === canonicalJson(expected), 'Resource world disagrees with complete history');
}
