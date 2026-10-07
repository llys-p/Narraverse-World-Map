import { createInitialBundle } from '../core/world-state.mjs';

export const CLOCK_SMOKE_RULES = 'a-smoke-v1';
export function createClockSmoke(seed = 42, simulationId = 'clock-smoke') {
  const systems = { pulse(context, task) {
    context.emitFact({ type: 'FixturePulse', sourceSystem: task.systemId, commandId: null,
      causationEventSeqs: [], entityIds: [], payload: { sample: context.rng.next() } });
  } };
  const commands = [1, 50 * 144, 90 * 144].map((targetTick, index) => ({
    commandId: 'transfer-' + (index + 1), targetTick, type: 'TransferResource',
    payload: { from: 'A', to: 'B', amount: index + 1 },
  }));
  const bundle = createInitialBundle({ rulesVersion: CLOCK_SMOKE_RULES, simulationId,
    fixtureId: 'clock-smoke', fixtureVersion: '1', seed, resources: { A: 1000, B: 0 }, commands,
    scheduledTasks: [{ taskId: 'daily-pulse', systemId: 'pulse', nextDueTick: 144, intervalTicks: 144, priority: 10 }],
  }, systems);
  return { bundle, systems };
}
