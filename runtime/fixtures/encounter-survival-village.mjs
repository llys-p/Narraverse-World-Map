// D3-5A fixture: the playable encounter village. It is the frozen M4A survival config deep-copied
// and re-stamped with exactly five new configuration versions; no parameter, no roster, no recipe
// input and no frozen economics value is changed here. The five recipes stay the frozen inputs of
// §7 of the survival contract, so an unknown name is still rejected.
import { createInitialBundle } from '../core/world-state.mjs';
import { fields, cloneData } from '../core/data-contract.mjs';
import { defaultSurvivalVillageConfig, survivalSystems } from './survival-village.mjs';
import { inspectDescriptorTree } from '../core/experience-state.mjs';
import { ENCOUNTER_RULES, encounterRuntimeHooks } from '../core/encounter-runtime.mjs';

const RECIPE = 'affordable';

// The five version replacements are the whole difference between the survival and the encounter
// config; every other byte is the deep copy taken from the survival recipe input.
function applyEncounterVersions(config) {
  config.memory.version = 'memory-config-v5';
  config.memory.society.version = 'society-config-v4';
  config.memory.society.actors.version = 'actor-config-v4';
  config.memory.society.actors.market.version = 'market-config-v2';
  config.memory.society.actors.market.ecology.version = 'ecology-config-v2';
  return config;
}

export function defaultEncounterVillageConfig(recipe = RECIPE) {
  const config = cloneData(defaultSurvivalVillageConfig(recipe));
  return applyEncounterVersions(config);
}

export function encounterSystems() {
  return {
    // The daily settlement is the frozen survival settlement, but it must run over the encounter
    // world: the survival settlement validates the world against an exact field set, so the
    // encounter-aware wrapper detaches `encounterModel` for the settlement and re-attaches it to
    // the result. The tick-1 publication task stays the frozen survival no-op system.
    society(ctx) {
      const result = encounterRuntimeHooks.settleDay(ctx.snapshot.world, ctx.rng.next());
      ctx.snapshot.world = result.world;
      ctx.emitFact({ type: 'SocietyDaySettled', sourceSystem: 'society', commandId: null,
        entityIds: [], causationEventSeqs: ctx.populationCauses, payload: result.payload });
    },
    survival() {},
    // The encounter profile registers its own empty pulse system so that the three systems are
    // declared up front; the encounter domain itself is driven by the intent entry point.
    encounter() {},
  };
}

export function createEncounterVillage(seed = 42, simulationId = 'encounter-survival-village',
  config = defaultEncounterVillageConfig()) {
  fields(config, ['memory', 'mind', 'motivation', 'experience', 'cognition']);
  inspectDescriptorTree(config);
  const input = cloneData(config);
  const systems = encounterSystems();
  const bundle = createInitialBundle(
    {
      rulesVersion: ENCOUNTER_RULES,
      simulationId,
      fixtureId: 'encounter-survival-village',
      fixtureVersion: '1',
      seed,
      world: encounterRuntimeHooks.createWorld(input.memory, input.mind, input.motivation,
        input.experience, input.cognition, simulationId),
      commands: [],
      scheduledTasks: [{ taskId: 'survival-quote', systemId: 'survival', nextDueTick: 1, intervalTicks: 288, priority: 20 },
        { taskId: 'daily-memory', systemId: 'society', nextDueTick: 144, intervalTicks: 144, priority: 10 }],
    },
    systems
  );
  return { bundle, systems };
}
