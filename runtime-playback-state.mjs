// Presentation data only. Never computes combat damage or submits a world command.
export function placeCast({viewPlace,player,actors}) {
  if(!['village','forest'].includes(viewPlace))return [];
  const rows=[...(player?.location===viewPlace?[player]:[]),...(Array.isArray(actors)?actors:[])];
  const seen=new Set();return rows.filter(a=>a&&a.location===viewPlace&&typeof a.actorId==='string'&&!seen.has(a.actorId)&&seen.add(a.actorId));
}
export function confirmedPlayback(receipt,command,group) {
  const r=receipt,s=r?.result;
  if(!group||!command||r?.status!=='committed'||r.outcome!=='succeeded'||![3,4].includes(command.version)||r.receiptVersion!==command.version||
    r.commandId!==command.commandId||r.type!=='EncounterAction'||command.type!==r.type||r.fromRevision!==command.expectedRevision||
    r.toRevision!==group.revision||r.tick!==group.tick||group.location!=='forest'||s?.actorId!=='actor-4'||s.reasonCode!==null||
    !['attack','flee'].includes(s.action)||s.action!==command.payload?.action||s.encounterId!==command.payload.encounterId||s.encounterId!==group.encounterId||
    !s.before||!s.after||s.before.tick!==r.fromTick||s.after.tick!==r.tick||
    ![s.before.playerHealth,s.after.playerHealth,s.before.wolfHealth,s.after.wolfHealth].every(n=>Number.isSafeInteger(n)&&n>=0)||
    s.after.playerHealth!==group.playerHealth||s.after.playerAlive!==group.playerAlive||s.after.wolfHealth!==group.wolfHealth||
    s.after.status!==group.status||s.after.resolution!==group.resolution)return null;
  return structuredClone({commandId:r.commandId,action:s.action,before:s.before,after:s.after,durationTicks:r.durationTicks});
}
export function createPlaybackGate() {
  let key=null,epoch=0;const seen=new Set();
  return {
    update(next){if(next!==key){key=next;epoch++;}},
    start(id){if(seen.has(id))return null;seen.add(id);if(seen.size>64)seen.delete(seen.values().next().value);return {epoch:++epoch};},
    cancel(){epoch++;},isCurrent(token){return token!==null&&token.epoch===epoch;}
  };
}
