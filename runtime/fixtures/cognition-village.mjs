import { createInitialBundle } from '../core/world-state.mjs';
import { fields, cloneData } from '../core/data-contract.mjs';
import { defaultExperienceVillageConfig } from './experience-village.mjs';
import { COGNITION_RULES, COGNITION_CONFIG_VERSION } from '../core/cognition-state.mjs';
import { inspectDescriptorTree } from '../core/experience-state.mjs';
import { cognitionRuntimeHooks } from '../core/motivation-runtime.mjs';

// The first four blocks are the M3-2 experience defaults, deep-copied so that no fixture ever
// shares a mutable sub-object with another fixture or with the runtime.
export function defaultCognitionVillageConfig() {
  const { memory, mind, motivation, experience } = cloneData(defaultExperienceVillageConfig());
  const cognition = { version: COGNITION_CONFIG_VERSION, profiles: [
    { actorId: 'actor-2', importancePermille: 700 },
    { actorId: 'actor-3', importancePermille: 400 }] };
  return { memory, mind, motivation, experience, cognition };
}

export function cognitionSystems() {
  return {
    society(ctx) {
      const result = cognitionRuntimeHooks.settleDay(ctx.snapshot.world, ctx.rng.next());
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
  };
}

export function createCognitionVillage(seed = 42, simulationId = 'cognition-village', config = defaultCognitionVillageConfig()) {
  fields(config, ['memory', 'mind', 'motivation', 'experience', 'cognition']);
  inspectDescriptorTree(config);
  const input = cloneData(config);
  const systems = cognitionSystems();
  const bundle = createInitialBundle(
    {
      rulesVersion: COGNITION_RULES,
      simulationId,
      fixtureId: 'cognition-village',
      fixtureVersion: '1',
      seed,
      world: cognitionRuntimeHooks.createWorld(input.memory, input.mind, input.motivation, input.experience, input.cognition, simulationId),
      commands: [],
      scheduledTasks: [{ taskId: 'daily-memory', systemId: 'society', nextDueTick: 144, intervalTicks: 144, priority: 10 }],
    },
    systems
  );
  return { bundle, systems };
}
