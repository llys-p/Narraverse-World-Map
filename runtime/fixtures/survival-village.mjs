// M4A bounded survival fixture: a five-recipe village built from a deep copy of the frozen
// M3-3A cognition defaults. Nothing here shares a mutable sub-object with another fixture or
// with the runtime. The five recipes are the frozen inputs of §7; any other name is rejected.
import { createInitialBundle } from '../core/world-state.mjs';
import { fields, cloneData, canonicalJson } from '../core/data-contract.mjs';
import { defaultCognitionVillageConfig } from './cognition-village.mjs';
import { SURVIVAL_RULES, SURVIVAL_FIXTURE_ID, SURVIVAL_RECIPES } from '../core/survival-state.mjs';
import { inspectDescriptorTree } from '../core/experience-state.mjs';
import { survivalRuntimeHooks } from '../core/motivation-runtime.mjs';

const RECIPE = 'affordable';

// Every recipe keeps no stimuli (the M1 memory block has no stimuli field) and leaves the
// profiles, experience switch and cognition importance weights exactly as the frozen defaults.
function applyRecipe(config, recipe) {
  const village = config.memory.society.actors.market.ecology.resources.resources;
  const market = config.memory.society.actors.market;
  const estates = config.memory.society.estates;
  const chief = config.memory.society.actors.initialActors[0];
  const actor2 = config.memory.society.actors.initialActors[1];
  const peer = config.memory.society.actors.initialActors[2];
  const playerBody = config.memory.society.actors.initialActors[3];

  // Shared M4A framing: everybody starts at health 1000 / fatigue 0, actor-2 is the hungry one.
  for (const actor of [chief, actor2, peer, playerBody]) Object.assign(actor, { health: 1000, fatigue: 0 });
  actor2.hunger = 200;

  // Private starting assets: the other three hold the rations, actor-2 starts with none.
  const privateFood = { 'actor-1': 20, 'actor-2': 0, 'actor-3': 20 };
  for (const estate of estates) {
    estate.initialHerbs = 0;
    estate.initialWallet = estate.actorId === 'actor-2' ? 0 : 0;
    estate.initialFood = privateFood[estate.actorId];
  }
  config.memory.society.player.initialFood = 20;
  config.memory.society.player.initialHerbs = 0;
  config.memory.society.player.initialWallet = 0;

  // Public opening stock before any private allocation: food 600, gold 1000, herbs 20.
  village.food.initial = 600;
  village.gold.initial = 1000;
  village.herbs.initial = 20;
  village.herbs.production = { numerator: 0, denominator: 8 };
  // No resupply of food at all: no farm output, no loss, no scripted flows.
  village.food.production = { numerator: 0, denominator: 5 };
  village.food.lossPermille = 0;
  config.memory.society.actors.market.ecology.resources.flows = [];
  // No hunting, no transport and no merchant restock.
  config.memory.society.actors.market.ecology.maxHunters = 0;
  market.transportCapacity = 0;
  market.products.food.maxOrder = 0;
  market.products.herbs.maxOrder = 0;
  // Frozen prices with no daily drift.
  market.products.food.basePrice = 10; market.products.food.minPrice = 10; market.products.food.maxPrice = 10;
  market.products.food.maxDailyChange = 0;
  market.products.herbs.basePrice = 50; market.products.herbs.minPrice = 50; market.products.herbs.maxPrice = 50;
  market.products.herbs.maxDailyChange = 0;
  // Work pays a wage and produces no food; nothing else about the economy changes.
  Object.assign(config.memory.society.economics, { wage: 20, workFood: 0 });
  config.memory.society.reserveFoodDays = 2;

  if (recipe === 'affordable') { estates[1].initialWallet = 30; config.motivation.requests = []; }
  else if (recipe === 'earn-then-buy' || recipe === 'wage-refused') {
    estates[1].initialWallet = 0;
    config.motivation.requests = [{ requestId: 's-food-01', tick: 100, speakerId: 'actor-1', listenerId: 'actor-2',
      urgencyPermille: 1000, expiresTick: 200 }];
    if (recipe === 'wage-refused') village.gold.initial = 0;
  } else if (recipe === 'no-opportunity') {
    estates[1].initialWallet = 0;
    config.motivation.requests = [];
  } else if (recipe === 'no-food') {
    village.food.initial = 0;
    for (const estate of estates) estate.initialFood = 0;
    config.memory.society.player.initialFood = 0;
    estates[1].initialWallet = 30;
    actor2.health = 50; actor2.hunger = 400;
    config.motivation.requests = [];
  }
  return config;
}

export function defaultSurvivalVillageConfig(recipe = RECIPE) {
  if (typeof recipe !== 'string' || !SURVIVAL_RECIPES.includes(recipe))
    throw Object.assign(new Error('Unknown survival recipe: ' + String(recipe)), { code: 'UNSUPPORTED_VERSION' });
  const source = defaultCognitionVillageConfig();
  const config = cloneData({ memory: source.memory, mind: source.mind, motivation: source.motivation,
    experience: source.experience, cognition: source.cognition });
  config.mind.stimuli = [];
  return applyRecipe(config, recipe);
}

export function survivalSystems() {
  return {
    // The daily settlement, unchanged from the M3-3A cognition systems.
    society(ctx) {
      const result = survivalRuntimeHooks.settleDay(ctx.snapshot.world, ctx.rng.next());
      ctx.snapshot.world = result.world;
      ctx.emitFact({
        type: 'SocietyDaySettled',
        sourceSystem: 'society',
        commandId: null,
        entityIds: [],
        causationEventSeqs: ctx.populationCauses,
        payload: result.payload,
      });
    },
    // Publishes nothing. It exists so that tick 1 is a real activity tick: §7 empties the
    // mind stimuli and the scheduler is frozen, and the public food quote must be published at
    // tick 1 with the real posted price and the real "there is food" state of that moment.
    survival() {},
  };
}

export function createSurvivalVillage(seed = 42, simulationId = 'survival-village',
  config = defaultSurvivalVillageConfig()) {
  fields(config, ['memory', 'mind', 'motivation', 'experience', 'cognition']);
  inspectDescriptorTree(config);
  const input = cloneData(config);
  const systems = survivalSystems();
  const bundle = createInitialBundle(
    {
      rulesVersion: SURVIVAL_RULES,
      simulationId,
      fixtureId: SURVIVAL_FIXTURE_ID,
      fixtureVersion: '1',
      seed,
      world: survivalRuntimeHooks.createWorld(input.memory, input.mind, input.motivation, input.experience,
        input.cognition, simulationId),
      commands: [],
      scheduledTasks: [{ taskId: 'survival-quote', systemId: 'survival', nextDueTick: 1, intervalTicks: 288, priority: 20 },
        { taskId: 'daily-memory', systemId: 'society', nextDueTick: 144, intervalTicks: 144, priority: 10 }],
    },
    systems
  );
  return { bundle, systems };
}

// Frozen input report for tests and for the CLI `survival-config.json` export. It is derived
// from the same config the fixture is built from, never from a module output.
export function survivalRecipeInputs(recipe = RECIPE) {
  if (typeof recipe !== 'string' || !SURVIVAL_RECIPES.includes(recipe))
    throw Object.assign(new Error('Unknown survival recipe: ' + String(recipe)), { code: 'UNSUPPORTED_VERSION' });
  const config = defaultSurvivalVillageConfig(recipe);
  const village = config.memory.society.actors.market.ecology.resources.resources;
  const market = config.memory.society.actors.market;
  const estate = config.memory.society.estates[1];
  return {
    recipe,
    publicFood: village.food.initial,
    publicGold: village.gold.initial,
    publicHerbs: village.herbs.initial,
    actor2Wallet: estate.initialWallet,
    actor2PrivateFood: estate.initialFood,
    wage: config.memory.society.economics.wage,
    workFood: config.memory.society.economics.workFood,
    foodPrice: market.products.food.basePrice,
    foodProductionNumerator: village.food.production.numerator,
    foodLossPermille: village.food.lossPermille,
    maxHunters: market.ecology.maxHunters,
    transportCapacity: market.transportCapacity,
    foodMaxOrder: market.products.food.maxOrder,
    requests: canonicalJson(config.motivation.requests),
  };
}
