// M3-2A work experience adapter: projects a verified MotivationDecisionResolved
// event and its causation/receipt chain into the 9-field work experience outcome.
import { record, identifier, denseArray, canonicalJson, requireCondition, fault } from './data-contract.mjs';
import { EXPERIENCE_RULES, inspectDescriptorTree } from './experience-state.mjs';

const CONTEXT_FIELDS = ['simulationId', 'rulesVersion', 'eventLog', 'commandReceipts'];

export function projectOwnWorkOutcome(context, actorId, resolvedEventSeq) {
  requireCondition(context !== null && typeof context === 'object', 'Expected context record');
  inspectDescriptorTree(context);
  record(context);
  for (const key of CONTEXT_FIELDS) {
    requireCondition(Object.hasOwn(context, key), 'Missing context field: ' + key);
  }
  requireCondition(context.rulesVersion === EXPERIENCE_RULES, 'Work experience adapter is for experience rules only');
  identifier(context.simulationId);
  requireCondition(typeof actorId === 'string' && ['actor-1', 'actor-2', 'actor-3', 'actor-4'].includes(actorId), 'Unknown actor identity for work experience');
  denseArray(context.eventLog, 140000);
  record(context.commandReceipts);

  if (actorId !== 'actor-2' && actorId !== 'actor-3') return null;

  const resolvedEvent = context.eventLog.find((e) => e.eventSeq === resolvedEventSeq);
  requireCondition(resolvedEvent !== undefined, 'Missing resolved event in eventLog');
  if (resolvedEvent.type !== 'MotivationDecisionResolved') return null;
  requireCondition(resolvedEvent.schemaVersion === 1, 'Invalid resolved event schemaVersion');
  requireCondition(resolvedEvent.sourceSystem === 'motivation', 'Invalid resolved event sourceSystem');
  denseArray(resolvedEvent.entityIds, 1);
  requireCondition(resolvedEvent.entityIds.length === 1, 'Resolved event must carry single entityId');
  requireCondition(resolvedEvent.entityIds[0] === resolvedEvent.payload.actorId, 'Entity ID mismatch with payload actorId');

  // 合法其他 actor 返回 null
  if (resolvedEvent.payload.actorId !== actorId) return null;
  // NoAction 没有 commandId，返回 null
  if (resolvedEvent.payload.commandId === null) return null;

  // 校验 Resolved 的唯一 causation 指向 Planned
  denseArray(resolvedEvent.causationEventSeqs, 1);
  requireCondition(resolvedEvent.causationEventSeqs.length === 1, 'Resolved event must carry single causation');
  const plannedSeq = resolvedEvent.causationEventSeqs[0];
  const plannedEvent = context.eventLog.find((e) => e.eventSeq === plannedSeq);
  requireCondition(plannedEvent !== undefined, 'Missing planned event for resolved causation');
  requireCondition(plannedEvent.type === 'MotivationDecisionPlanned', 'Causation event is not MotivationDecisionPlanned');
  requireCondition(plannedEvent.schemaVersion === 1, 'Invalid planned event schemaVersion');
  requireCondition(plannedEvent.sourceSystem === 'motivation', 'Invalid planned event sourceSystem');
  requireCondition(plannedEvent.commandId === null, 'Planned event must carry null commandId');
  denseArray(plannedEvent.entityIds, 1);
  requireCondition(plannedEvent.entityIds[0] === actorId, 'Planned event entityId mismatch');
  requireCondition(plannedEvent.payload.actorId === actorId, 'Planned payload actorId mismatch');
  requireCondition(plannedEvent.payload.tick === resolvedEvent.tick, 'Planned and resolved tick mismatch');
  requireCondition(plannedEvent.payload.decisionId === resolvedEvent.payload.decisionId, 'Planned and resolved decisionId mismatch');
  requireCondition(resolvedEvent.commandId === plannedEvent.payload.decisionId, 'Resolved commandId must match decisionId');

  // 非 WorkForPay 返回 null
  if (plannedEvent.payload.choice !== 'WorkForPay') return null;

  // 核对 Receipt
  const commandId = resolvedEvent.commandId;
  const receipt = context.commandReceipts[commandId];
  requireCondition(receipt !== undefined, 'Missing command receipt for work action');
  requireCondition(receipt.input?.type === 'SocietyAction', 'Receipt input type mismatch');
  const p = receipt.input.payload;
  requireCondition(p && p.actorId === actorId && p.action === 'WorkForPay' && p.targetActorId === null, 'Receipt payload mismatch');
  const expectedGoalId = plannedEvent.payload.goalId === null ? 0 : plannedEvent.payload.goalId;
  requireCondition(p.goalId === expectedGoalId, 'Receipt goalId mismatch');

  // 核对状态与结果语义
  const status = resolvedEvent.payload.status;
  const code = resolvedEvent.payload.code;

  if (status === 'succeeded') {
    requireCondition(receipt.status === 'succeeded', 'Receipt status mismatch with resolved outcome');
    requireCondition(code === null, 'Succeeded outcome must carry null code');
    denseArray(receipt.eventSeqs, 1);
    requireCondition(receipt.eventSeqs.length === 1, 'Succeeded work receipt must cite exactly one committed event');
    const committedSeq = receipt.eventSeqs[0];
    const committedEvent = context.eventLog.find((e) => e.eventSeq === committedSeq);
    requireCondition(committedEvent !== undefined, 'Missing SocietyActionCommitted event');
    requireCondition(committedEvent.type === 'SocietyActionCommitted', 'Event type is not SocietyActionCommitted');
    requireCondition(committedEvent.commandId === commandId, 'Committed event commandId mismatch');
    requireCondition(committedEvent.tick === resolvedEvent.tick, 'Committed event tick mismatch');
    denseArray(committedEvent.entityIds, 1);
    requireCondition(committedEvent.entityIds[0] === actorId, 'Committed event entityId mismatch');
    requireCondition(canonicalJson(receipt.result) === canonicalJson(committedEvent.payload), 'Receipt result must match committed payload');
    requireCondition(committedEvent.payload.actorId === actorId && committedEvent.payload.action === 'WorkForPay', 'Committed payload action mismatch');
  } else if (status === 'rejected') {
    requireCondition(receipt.status === 'rejected', 'Receipt status mismatch with resolved outcome');
    requireCondition(code === 'RULE_REJECTED', 'Rejected outcome must carry RULE_REJECTED code');
    requireCondition(receipt.result?.code === 'RULE_REJECTED', 'Receipt result must carry RULE_REJECTED code');
    requireCondition(Array.isArray(receipt.eventSeqs) && receipt.eventSeqs.length === 0, 'Rejected receipt eventSeqs must be empty');
  } else {
    throw fault('INVALID_INPUT', 'Unexpected outcome status for WorkForPay: ' + status);
  }

  return {
    simulationId: context.simulationId,
    actorId,
    sourceEventSeq: resolvedEvent.eventSeq,
    occurrenceTick: resolvedEvent.tick,
    decisionId: resolvedEvent.payload.decisionId,
    commandId,
    action: 'WorkForPay',
    status,
    code,
  };
}
