import { createInitialBundle } from '../core/world-state.mjs';
import { fields, cloneData } from '../core/data-contract.mjs';
import { defaultMotivationVillageConfig } from './motivation-village.mjs';
import { EXPERIENCE_RULES, EXPERIENCE_CONFIG_VERSION, inspectDescriptorTree } from '../core/experience-state.mjs';
import { experienceRuntimeHooks } from '../core/motivation-runtime.mjs';

export function defaultExperienceVillageConfig() {
  const { memory, mind, motivation } = cloneData(defaultMotivationVillageConfig());
  const experience = { version: EXPERIENCE_CONFIG_VERSION, useWorkExperience: true };
  return { memory, mind, motivation, experience };
}

export function experienceSystems() {
  return {
    society(ctx) {
      const result = experienceRuntimeHooks.settleDay(ctx.snapshot.world, ctx.rng.next());
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

export function createExperienceVillage(seed = 42, simulationId = 'experience-village', config = defaultExperienceVillageConfig()) {
  fields(config, ['memory', 'mind', 'motivation', 'experience']);
  inspectDescriptorTree(config);
  const input = cloneData(config);
  const systems = experienceSystems();
  const bundle = createInitialBundle(
    {
      rulesVersion: EXPERIENCE_RULES,
      simulationId,
      fixtureId: 'experience-village',
      fixtureVersion: '1',
      seed,
      world: experienceRuntimeHooks.createWorld(input.memory, input.mind, input.motivation, input.experience, simulationId),
      commands: [],
      scheduledTasks: [{ taskId: 'daily-memory', systemId: 'society', nextDueTick: 144, intervalTicks: 144, priority: 10 }],
    },
    systems
  );
  return { bundle, systems };
}
