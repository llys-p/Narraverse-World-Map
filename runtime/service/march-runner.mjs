import {randomUUID} from 'node:crypto';
import {requireCondition} from '../core/data-contract.mjs';
import {MAX_PENDING_REQUESTS} from './service-commit.mjs';

// Only schedules ordinary, persisted commands. The owner remains the sole writer.
export function createMarchRunner(owner,{onChange=()=>{},intervalMs=500}={}){
 let requested=false,closed=false,timer=null,viewers=0,pending=0,epoch=0,tail=Promise.resolve(),reason='waiting-for-order';
 const status=()=>({active:requested&&!closed,reason,intervalMs,viewers});
 const notify=()=>onChange(status());
 function stop(why='paused'){epoch++;requested=false;reason=why;clearTimeout(timer);timer=null;notify();}
 function enqueue(run){
  requireCondition(!closed,'March runner is closed','OWNER_CLOSED');
  requireCondition(pending<MAX_PENDING_REQUESTS,'March queue exceeds budget','LIMIT_EXCEEDED');pending++;
  const next=tail.then(run).finally(()=>{pending--;});tail=next.catch(()=>{});return next;
 }
 function schedule(){clearTimeout(timer);if(requested&&!closed)timer=setTimeout(()=>{timer=null;void step();},intervalMs);}
 async function step(){
  if(!requested||closed)return;
  try{await enqueue(async()=>{
   if(!requested||closed)return;
   const map=owner.getMap();
   if(!viewers||!map.self.alive||map.contact||map.order?.status!=='marching'){stop(!viewers?'view-disconnected':'world-stopped');return;}
   const type=map.budget.remainingCommands<=1?'MarchPause':'MarchStep';
   const receipt=await owner.submit({version:5,commandId:'march-auto-'+randomUUID(),expectedRevision:owner.getSnapshot().revision,type,payload:{}});
   const next=owner.getMap();
   if(type==='MarchPause'||receipt.outcome!=='succeeded'||next.contact||next.order?.status!=='marching')
    stop(type==='MarchPause'?'budget-limit':next.contact?'encounter':'arrived-or-rejected');
   notify();
  });}catch(error){stop(error.code??'step-failed');}
  schedule();
 }
 return Object.freeze({status,stop,
  async stopAndWait(why){stop(why);await tail;notify();},
  attach(){requireCondition(!closed&&viewers<4,'Demo stream budget exceeded','LIMIT_EXCEEDED');viewers++;notify();let attached=true;
   return()=>{if(!attached)return;attached=false;viewers--;if(!viewers)stop('view-disconnected');else notify();};},
  order(intent){
   const known=owner.getCommittedCommand(intent.requestId);if(!known)stop('updating-order');const ticket=epoch;
   return enqueue(async()=>{
    const old=owner.getCommittedCommand(intent.requestId),dto={version:5,commandId:intent.requestId,
     expectedRevision:old?.dto.expectedRevision??owner.getSnapshot().revision,type:intent.type,payload:intent.payload};
    const receipt=await owner.submit(dto);
    if(!old&&ticket===epoch&&receipt.outcome==='succeeded'&&['MarchSet','MarchResume'].includes(dto.type)&&viewers){requested=true;reason='marching';schedule();}
    notify();return{command:dto,receipt};
   });
  },
  command(dto){stop('world-action');return enqueue(async()=>{const receipt=await owner.submit(dto);notify();return receipt;});},
  async close(){stop('closed');closed=true;await tail;}
 });
}
