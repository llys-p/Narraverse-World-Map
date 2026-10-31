// Bounded synthetic fixture8 acceptance through the real worker and HTTP routes.
// Controlled replies exercise protocol only; they never count as language quality.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {startRuntimeServer} from '../runtime-server.mjs';
import {npcDialogueContext} from '../runtime/core/npc-negotiation.mjs';
import {providerContext,npcLanguageConfig} from '../runtime/service/npc-language-provider.mjs';
import {loadServiceCommit} from '../runtime/service/service-commit.mjs';
import {createDialogueReportWriter,verifyDialogueReportFiles} from '../runtime/evaluation/npc-report-files.mjs';
import {verifyForestCandidate} from './forest-playtest-candidate.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),suiteFile='benchmarks/npc-forest-v1/cases.json';
const hash=b=>createHash('sha256').update(b).digest('hex'),clone=v=>structuredClone(v);
const five=g=>Object.fromEntries(['snapshot','map','player','encounter','scene'].map(k=>[k,g[k]]));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function parseForestDialogueArgs(args){
 const s={mode:'plan',selection:'all',out:null,maxRequests:0,allow:false,resumeFailed:null},seen=new Set();
 for(let i=0;i<args.length;i++){const f=args[i];assert.ok(!seen.has(f),'Duplicate option');seen.add(f);if(f==='--allow-model-calls'){s.allow=true;continue;}
  assert.ok(['--mode','--case','--out','--max-requests','--resume-failed'].includes(f),'Unknown option');const v=args[++i];assert.ok(v&&!v.startsWith('--'),'Missing option value');
  if(f==='--mode'){assert.ok(['plan','controlled-test','live'].includes(v));s.mode=v;}if(f==='--case')s.selection=v;if(f==='--out')s.out=v;if(f==='--resume-failed')s.resumeFailed=v;
  if(f==='--max-requests'){assert.match(v,/^(?:[1-9]|1[0-6])$/);s.maxRequests=Number(v);}
 }
 assert.ok(s.out,'Explicit fresh output directory required');
 if(s.mode==='live')assert.ok(s.allow&&seen.has('--case')&&s.maxRequests>0,'Live needs explicit case, call flag and bounded budget');else assert.ok(!s.allow&&s.maxRequests===0,'Offline modes do not accept live budget flags');
 return s;
}
function render(r){return '<!doctype html><meta charset="utf-8"><title>森林对话验收</title><style>body{font:16px/1.65 system-ui;max-width:1000px;margin:30px auto;padding:0 20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}article{border-top:1px solid #aaa;margin-top:25px}</style><h1>森林对话验收</h1><p>'+escape(r.notice)+'</p><pre>'+escape(JSON.stringify(r.counts,null,2))+'</pre>'+r.cases.map(c=>'<h2>'+escape(c.title)+'</h2>'+c.turns.map(t=>'<article><h3>'+escape(t.id+' · '+t.status)+'</h3><p>玩家：'+escape(t.text)+'</p><p>NPC：'+escape(t.response?.reply??'未生成')+'</p><p>人工评审待定：'+escape(t.review)+'</p><details><summary>来源、当前事实与检查</summary><pre>'+escape(JSON.stringify({oracle:t.oracle,context:t.context,checks:t.checks,metrics:t.metrics},null,2))+'</pre></details></article>').join('')).join('');}
async function sources(){
 const manifest=JSON.parse(await fs.readFile(path.join(root,'docs/runtime/forest-playtest-candidate.json'),'utf8')),sha256={...manifest.gameSha256};
 for(const f of [suiteFile,'scripts/evaluate-forest-dialogue.mjs','scripts/forest-playtest-candidate.mjs'])sha256[f]=hash(await fs.readFile(path.join(root,f)));
 return {baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),workingTreeDirty:!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim(),sha256,node:process.version};
}
const counts=r=>{const ts=r.cases.flatMap(c=>c.turns);return {planned:r.plannedRequests,attempted:ts.filter(t=>t.attempted).length,automaticPassed:ts.filter(t=>t.status==='automatic-pass').length,automaticFailed:ts.filter(t=>t.status==='automatic-fail').length,providerFailed:ts.filter(t=>t.status==='provider-failed').length,fixtureFailed:ts.filter(t=>t.status==='fixture-failed').length,blocked:ts.filter(t=>t.status==='blocked').length,notRun:ts.filter(t=>t.status==='plan-only').length};};
export async function runForestDialogueEvaluation(settings,{env=process.env,fetchImpl=globalThis.fetch,log=console.log}={}){
 const suite=JSON.parse(await fs.readFile(path.join(root,suiteFile),'utf8'));let selected=suite.cases.filter(c=>settings.selection==='all'||c.id===settings.selection),resume=null;assert.ok(selected.length,'Unknown case');
 if(settings.resumeFailed){
  assert.equal(selected.length,1,'Resume requires one explicit case');const sourcePath=await fs.realpath(path.resolve(root,settings.resumeFailed)),prefix=path.join(root,'artifacts','forest-dialogue')+path.sep;assert.ok(sourcePath.startsWith(prefix)&&path.basename(sourcePath)==='report.json','Resume only accepts this tool synthetic reports');await verifyDialogueReportFiles(sourcePath);
  const bytes=await fs.readFile(sourcePath),original=JSON.parse(bytes),c=original.cases.find(c=>c.id===selected[0].id);assert.equal(original.fixtureVersion,'8');assert.equal(original.suiteId,suite.suiteId);assert.equal(original.mode,'live');assert.equal(c?.worldReplayAudit,'passed');const failed=c.turns.filter(t=>t.status==='provider-failed');assert.equal(failed.length,1);const t=failed[0];assert.equal(t.context.revision,c.finalRevision,'World advanced past the failed request');
  const directory=await fs.realpath(path.join(path.dirname(sourcePath),c.id,'world'));assert.ok(directory.startsWith(prefix));const saved=JSON.parse(await fs.readFile(path.join(directory,`service-commit-r${c.finalRevision}.json`),'utf8'));assert.equal(hash(JSON.stringify(saved.bundle)),c.finalBundleSha256,'Source synthetic world no longer matches its report');
  const current=selected[0].turns.find(x=>x.id===t.id);assert.equal(current.text,t.text);selected=[{...selected[0],turns:[{...current,before:[]}]}];resume={sourceReportSha256:hash(bytes),caseId:c.id,turnId:t.id,originalRevision:c.finalRevision,directory,loan:t.oracle.loan};
 }
 const planned=selected.reduce((n,c)=>n+c.turns.length,0);assert.ok(planned<=12);if(settings.mode==='live')assert.ok(settings.maxRequests>=planned&&settings.maxRequests<=16,'Insufficient request budget');
 await verifyForestCandidate();const out=path.resolve(root,settings.out),nativeFetch=globalThis.fetch,attempts=[];let server,stream,n=0,g,directory,lastDialogue=null,currentRow=null,returnedTick=null;
 const real=settings.mode==='live',controlled=settings.mode==='controlled-test',enabled=real||controlled;
 const config=real?npcLanguageConfig(env):controlled?{enabled:true,baseURL:'http://127.0.0.1:1',model:'controlled-protocol',apiKey:'controlled-not-a-credential'}:{enabled:false};
 if(real){assert.equal(config.enabled,true);assert.equal(config.baseURL,'https://api.deepseek.com');assert.equal(config.model,'deepseek-flash');assert.equal(config.thinking??'disabled','disabled');assert.ok(config.apiKey);}
 await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);const writer=await createDialogueReportWriter(path.join(out,'report.json'));
 const report={schemaVersion:1,suiteId:suite.suiteId,fixtureVersion:'8',mode:settings.mode,completionProtocol:1,completed:false,semanticVerdict:real?'needs-human-review':'not-evaluated',notice:real?'真实模型与当前森林HTTP流程；自动检查不能代替真人语义评审。':controlled?'受控协议测试，回复由测试代码提供，不代表真实模型能力。':'零模型计划，只验证当前森林动作、状态与保存恢复。',plannedRequests:planned,requestLimit:real?settings.maxRequests:0,externalModelCalls:0,source:await sources(),provider:real?{model:config.model,thinking:config.thinking??'disabled'}:null,resume:resume?{sourceReportSha256:resume.sourceReportSha256,caseId:resume.caseId,turnId:resume.turnId,originalRevision:resume.originalRevision}:null,cases:[],createdAt:new Date().toISOString()};
 const save=async()=>{report.counts=counts(report);report.externalModelCalls=real?attempts.length:0;await writer.save(JSON.stringify(report,null,2)+'\n',render(report));};
 const fileHashes=async()=>Object.fromEntries(await Promise.all((await fs.readdir(directory)).filter(f=>f.endsWith('.json')).sort().map(async f=>[f,hash(await fs.readFile(path.join(directory,f)))])));
 const read=async()=>{const r=await nativeFetch(server.url+'/api/runtime/demo-state');assert.equal(r.status,200);g=await r.json();return g;};
 const bundle=async()=>JSON.parse(await fs.readFile(path.join(directory,`service-commit-r${g.snapshot.revision}.json`),'utf8')).bundle;
 const post=async(route,body)=>{const r=await nativeFetch(server.url+'/api/runtime/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const b=await r.json();return {status:r.status,body:b};};
 const act=async(type,payload={})=>{const order=type.startsWith('March'),dto=order?{apiVersion:1,requestId:'forest-eval-order-'+(++n),type,payload}:{version:5,commandId:'forest-eval-'+(++n),expectedRevision:g.snapshot.revision,type,payload};const r=await post(order?'demo-order':'commands',dto);assert.equal(r.status,200,type+' HTTP '+JSON.stringify(r.body));const receipt=order?r.body.receipt:r.body;assert.equal(receipt.outcome,'succeeded',type+' '+JSON.stringify(receipt));await read();return {dto,receipt};};
 const social=async action=>{const r=await act('PlayerInteract',{targetId:'actor-2',action});if(action==='return')returnedTick=g.map.tick;return r;},quest=(questId,action)=>act('PlayerQuest',{questId,action});
 const disconnect=async()=>{if(stream){const old=stream;stream=null;old.abort.abort();await old.pump;}};
 const close=async()=>{await disconnect();if(server){const old=server;server=null;await old.close();}};
 const open=async first=>{server=await startRuntimeServer({directory,port:0,writable:true,continuousMarch:true,...(first?{profile:'campaign-forest-village',seed:42}:{}),npcLanguage:config});await read();};
 const connect=async()=>{if(stream)return;const abort=new AbortController(),r=await nativeFetch(server.url+'/api/runtime/demo-events',{signal:abort.signal});assert.equal(r.status,200);const pump=(async()=>{try{for await(const chunk of r.body)assert.ok(chunk.length);}catch(e){if(!abort.signal.aborted)throw e;}})();stream={abort,pump};};
 const march=async target=>{await connect();await act('MarchSet',target);for(let i=0;i<700;i++){await read();if(g.map.order.status==='arrived')return;if(g.map.order.status==='paused'&&!g.runner.active)await act('MarchResume');assert.equal(g.map.contact,null,'Unexpected encounter in fixed development route');await delay(60);}throw Error('March timed out');};
 const approach=async()=>{for(let i=0;i<4;i++){const h=g.map.actors.find(a=>a.actorId==='actor-2');if(h&&Math.max(Math.abs(h.x-g.map.self.x),Math.abs(h.y-g.map.self.y))<=1)return;await march(h?{x:h.x,y:h.y}:{x:4,y:7});}throw Error('Hunter remained outside talking range');};
 const prepare=async()=>{await quest('livelihood','accept');await act('PlayerWork');await act('PlayerBuy',{product:'food',quantity:1});await quest('livelihood','claim');await quest('hunter-aid','accept');await social('help');await act('PlayerGiftFood',{recipientId:'actor-2'});await quest('hunter-aid','claim');await quest('hunter-trust','accept');await quest('forest-route','accept');await social('ask-help');assert.equal(g.map.social.asset.holderId,'actor-4');};
 const reopening=[];
 const reopen=async()=>{const before=five(g),hashes=await fileHashes();await close();assert.ok(!(await fs.readdir(directory)).includes('.runtime-owner.lock'));await open();assert.deepEqual(five(g),before);assert.deepEqual(await fileHashes(),hashes);let retried=false;if(lastDialogue){const r=await post('commands',lastDialogue.dto);assert.equal(r.status,200);assert.deepEqual(r.body,lastDialogue.receipt);await read();assert.deepEqual(five(g),before);assert.deepEqual(await fileHashes(),hashes);retried=true;}reopening.push({revision:g.snapshot.revision,tick:g.snapshot.tick,sameFiveProjections:true,noExtraCommit:true,committedDialogueRetry:retried});};
 const steps=async names=>{for(const name of names){if(name==='forest-roundtrip'){await march({x:16,y:7});await act('PlayerForest',{action:'collect'});await act('PlayerForest',{action:'camp'});await march({x:4,y:7});await approach();}else if(name==='next-day'){const target=(Math.floor(g.map.tick/144)+1)*144;await act('AdvanceTime',{ticks:target-g.map.tick});}else if(name==='approach')await approach();else if(name==='reopen')await reopen();else await social(name);}};
 const worldFacts=b=>{const w=b.snapshot.world;return {tick:b.snapshot.tick,asset:w.mapModel.socialModel.asset,actors:w.mapModel.socialModel.actors,bodies:w.actorModel.actors,agents:w.societyModel.agents,play:w.mapModel.playModel,forest:w.mapModel.forestModel};};
 // Capture only bounded request context and usage. Authorization headers and keys never enter a report.
 globalThis.fetch=async(url,options)=>{
  assert.ok(enabled&&String(url)===config.baseURL+'/chat/completions','Unexpected provider endpoint');assert.ok(attempts.length<(real?settings.maxRequests:12),'Round request budget exhausted');
  const request=JSON.parse(options.body),sent=JSON.parse(request.messages[1].content),measurement={requestId:currentRow?.requestId,context:sent.npc,httpStatus:null,usage:null,finishReason:null};attempts.push(measurement);
  assert.equal(request.model,config.model);assert.deepEqual(sent.npc,currentRow.context);assert.equal(sent.playerUtterance,currentRow.text);
  if(controlled){const kinds=currentRow.referenceKinds,refs=sent.npc.observations.filter(m=>kinds.includes(m.kind)).slice(-3).map(m=>m.eventSeq).sort((a,b)=>a-b);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'受控协议回复，不代表真实模型语言。',memoryRefs:refs,proposal:null})}}]}),{status:200,headers:{'Content-Type':'application/json'}});}
  const response=await fetchImpl(url,options);measurement.httpStatus=response.status;const reader=response.clone().body?.getReader();let bytes=0;const chunks=[];
  if(reader)try{for(;;){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;assert.ok(bytes<=65536,'Provider diagnostic envelope too large');chunks.push(Buffer.from(p.value));}}finally{await reader.cancel().catch(()=>{});}
  try{const data=JSON.parse(Buffer.concat(chunks));const u=data.usage;if(Number.isSafeInteger(u?.prompt_tokens)&&Number.isSafeInteger(u?.completion_tokens))measurement.usage={inputTokens:u.prompt_tokens,outputTokens:u.completion_tokens};measurement.finishReason=data.choices?.[0]?.finish_reason??null;const content=data.choices?.[0]?.message?.content;if(typeof content==='string'){measurement.contentBytes=Buffer.byteLength(content);try{const answer=JSON.parse(content),refs=answer.memoryRefs,known=new Set([...sent.npc.observations,...sent.npc.conversation].map(m=>m.eventSeq));measurement.outputSummary={fields:Object.keys(answer),replyCharacters:typeof answer.reply==='string'?answer.reply.length:null,referenceCount:Array.isArray(refs)?refs.length:null,referenceIssue:!Array.isArray(refs)?'not-array':refs.length>3?'too-many':refs.some(n=>!Number.isSafeInteger(n)||n<=0)?'not-positive-integer':refs.some(n=>!known.has(n))?'unknown-reference':refs.some((n,i)=>i>0&&n<=refs[i-1])?'not-strictly-increasing':null,proposalType:answer.proposal?.type??null};}catch{measurement.outputSummary={contentJson:false};}}}catch{}
  return response;
 };
 try{
  await save();for(const c of selected){directory=resume?.directory??path.join(out,c.id,'world');n=0;lastDialogue=null;returnedTick=resume?.loan?.returnedTick??null;const entry={id:c.id,title:c.title,turns:[],reopens:[]};report.cases.push(entry);const reopenStart=reopening.length;let blocked=false,loan=resume?.loan??null;
   try{await open(!resume);if(resume){assert.equal(g.snapshot.revision,resume.originalRevision);}else if(c.setup==='damage')await social('smash');else{await prepare();loan={borrowTick:g.map.tick,dueTick:(await bundle()).snapshot.world.mapModel.socialModel.asset.loanDueTick};assert.ok(Number.isSafeInteger(loan.dueTick));if(c.setup==='overdue'){await act('AdvanceTime',{ticks:loan.dueTick+2-g.map.tick});await approach();}}}
   catch(e){blocked=true;entry.setupError={message:e.message};}
   for(const t of c.turns){const row={...clone(t),status:'not-run',attempted:false,context:null,oracle:null,response:null,checks:[],metrics:null,humanReview:'pending'};entry.turns.push(row);currentRow=row;await fs.writeFile(path.join(out,'phase.json'),JSON.stringify({phase:c.id+'/'+t.id,startedAt:Date.now()}));
    if(blocked){row.status='blocked';continue;}
    try{
     await steps(t.before);await approach();const b=await bundle(),context=npcDialogueContext(b);assert.equal(context.canTalk,true);row.context=providerContext(context,t.text);row.oracle={tick:g.map.tick,asset:clone(g.map.social.asset),loan:loan?{...loan,returnedTick}:null,overdueMinutes:loan?Math.max(0,(returnedTick??g.map.tick)-loan.dueTick)*10:null,knownTool:clone(row.context.knownFacts.tool),observations:context.observations.map(m=>({eventSeq:m.eventSeq,kind:m.kind,tick:m.tick,channel:m.channel,actorId:m.actorId,observedState:m.observedState}))};
     const own=row.context.knownFacts.tool;if(c.id==='borrow-return'){const returned=['handed-back','next-day'].includes(t.id);assert.equal(own.holder,returned?'self':'player');assert.equal(row.oracle.asset.condition,t.id==='borrowed'?80:70);assert.equal(own.condition,returned?70:80);}if(c.id==='witness-denial'){assert.ok(context.observations.some(m=>m.kind==='smash'&&['self','witness'].includes(m.channel)&&m.actorId==='actor-4'));assert.equal(own.condition,['repaired','remembered'].includes(t.id)?40:20);}if(c.id==='overdue-denial'){assert.ok(context.observations.some(m=>m.kind==='overdue'));assert.equal(own.holder,t.id==='late'?'player':'self');}row.checks.push({name:'scenarioPreconditions',passed:true});
     if(!enabled){row.status='plan-only';await save();continue;}
     const before=five(g),hashes=await fileHashes(),facts=clone(worldFacts(b));row.requestId='forest-'+c.id+'-'+t.id;const request={apiVersion:1,requestId:row.requestId,simulationId:g.snapshot.simulationId,expectedRevision:g.snapshot.revision,targetId:'actor-2',text:t.text};row.attempted=true;
     const generated=await post('demo-npc-compose',request);row.metrics=clone(attempts.at(-1));if(row.metrics)delete row.metrics.context;
     await read();assert.deepEqual(five(g),before);assert.deepEqual(await fileHashes(),hashes);row.checks.push({name:'previewDoesNotCommit',passed:true});
     if(generated.status!==200){row.status='provider-failed';row.error=generated.body;blocked=true;await save();continue;}
     const draft=generated.body;row.response={reply:draft.payload.reply,memoryRefs:draft.payload.memoryRefs,proposal:draft.payload.proposal,model:draft.payload.model};const calls=attempts.length,cached=await post('demo-npc-compose',request);assert.deepEqual(cached,generated);assert.equal(attempts.length,calls);row.checks.push({name:'previewRetryHasNoModelCall',passed:true});
     const dto={version:5,commandId:'speech-'+row.requestId,expectedRevision:g.snapshot.revision,type:'PlayerDialogue',payload:draft.payload},confirmed=await post('commands',dto);assert.equal(confirmed.status,200);assert.equal(confirmed.body.outcome,'succeeded');lastDialogue={dto,receipt:confirmed.body};await read();assert.equal(g.snapshot.revision,b.snapshot.revision+1);assert.deepEqual(worldFacts(await bundle()),facts);
     const committedHashes=await fileHashes(),duplicate=await post('commands',dto);assert.deepEqual(duplicate,confirmed);assert.deepEqual(await fileHashes(),committedHashes);row.checks.push({name:'confirmationAndRetryOnlyCommitSpeechOnce',passed:true},{name:'speechDoesNotAlterActionsOrObjectiveMemory',passed:true});
     const refs=new Set(draft.payload.memoryRefs),referenced=row.context.observations.filter(m=>refs.has(m.eventSeq));row.checks.push({name:'requiredObservationSource',passed:t.referenceKinds.length===0||referenced.some(m=>t.referenceKinds.includes(m.kind)),actual:referenced.map(m=>({eventSeq:m.eventSeq,kind:m.kind})),expected:t.referenceKinds});row.status=row.checks.every(c=>c.passed)?'automatic-pass':'automatic-fail';
    }catch(e){row.status='fixture-failed';row.error={message:e.message};blocked=true;}await save();
   }
   if(server&&resume)await reopen();
   if(server){const loaded=await loadServiceCommit(path.join(directory,`service-commit-r${g.snapshot.revision}.json`));entry.worldReplayAudit='passed';entry.finalBundleSha256=hash(JSON.stringify(loaded.bundle));entry.finalRevision=g.snapshot.revision;entry.finalTick=g.map.tick;}
   entry.reopens=reopening.slice(reopenStart);await close();entry.remainingLocks=(await fs.readdir(directory).catch(()=>[])).filter(f=>f.endsWith('.lock'));if(entry.remainingLocks.length)entry.cleanupIssue='Ownership lock remains; no lock was deleted';await save();
  }
  report.completed=true;await fs.writeFile(path.join(out,'phase.json'),'{"phase":null}');await save();const integrity=await writer.finish();const c=report.counts;const exitCode=c.automaticFailed+c.providerFailed+c.fixtureFailed+c.blocked+report.cases.filter(c=>c.worldReplayAudit!=='passed'||c.remainingLocks.length).length>0?1:0;log(JSON.stringify({status:exitCode?'checks-failed':real?'human-review-required':controlled?'controlled-protocol-only':'plan-ready',mode:settings.mode,counts:c,externalModelCalls:report.externalModelCalls,output:path.join(out,'report.json'),integrity}));return {exitCode,report};
 }finally{try{await close();}finally{globalThis.fetch=nativeFetch;await writer.close();}}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const settings=parseForestDialogueArgs(process.argv.slice(2));const r=await runForestDialogueEvaluation(settings);process.exitCode=r.exitCode;}catch(e){console.error(JSON.stringify({status:'blocked',message:e.code??'FOREST_EVALUATION_FAILED'}));process.exitCode=2;}
}
