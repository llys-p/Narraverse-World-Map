import { createInitialBundle } from '../core/world-state.mjs';
import { createResourceWorld, defaultResourceConfig, settleResourceDay, RESOURCE_RULES } from '../core/resource-ledger.mjs';

export function createResourceVillage(seed = 42, simulationId = 'resource-village', config = defaultResourceConfig()) {
  const systems = { resources(context) {
    const result = settleResourceDay(context.snapshot.world);
    context.snapshot.world = result.world;
    context.emitFact({ type: 'ResourceDaySettled', sourceSystem: 'resources', commandId: null,
      causationEventSeqs: [], entityIds: [], payload: result.payload });
  } };
  const bundle = createInitialBundle({ rulesVersion: RESOURCE_RULES, simulationId, fixtureId: 'resource-village',
    fixtureVersion: '1', seed, world: createResourceWorld(config), commands: [],
    scheduledTasks: [{ taskId: 'daily-resources', systemId: 'resources', nextDueTick: 144, intervalTicks: 144, priority: 10 }],
  }, systems);
  return { bundle, systems };
}
