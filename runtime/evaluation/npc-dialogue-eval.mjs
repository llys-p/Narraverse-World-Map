import {createHash} from 'node:crypto';
import {createNegotiationCampaignVillage,createMemoryCampaignVillage,campaignSystems} from '../fixtures/campaign-village.mjs';
import {createAuditedBundle,deriveCampaignBundle,validateBundle} from '../core/world-state.mjs';
import {canonicalJson,cloneData,fields,requireCondition} from '../core/data-contract.mjs';
import {npcDialogueContext} from '../core/npc-negotiation.mjs';
import {providerContext} from '../service/npc-language-provider.mjs';
import {dialogueText,validNegotiationPayload} from '../../runtime-negotiation-contract.mjs';
import {validSocialPayload,SOCIAL_ACTIONS} from '../../runtime-social-contract.mjs';
import {SURVIVAL_REASON_CODES} from '../core/survival-state.mjs';
import {auditDialogueFacts,summarizeFactAudits} from './npc-fact-audit.mjs';

const options={rulesVersion:'d-campaign-v1',systems:campaignSystems()},modes=['plan','live','controlled-test'];
const keys=['none','negotiate',...SOCIAL_ACTIONS.filter(x=>x!=='talk'),'talk:needs','talk:past','talk:relationship'];
const memoryKinds=['talk','threaten','steal','rob','smash','help','return','apologize','ask-help','gift','missing','damage','overdue','agreement'];
const lifeEnums={lifeIntent:['WorkForPay','BuyFood','Rest','NoAction',null],lifePhase:['travelling','at-destination','awaiting-review','stopped',null],
 lifeResult:['WorkForPay','BuyFood','Rest','NoAction','BuyMedicine','UseMedicine',null],lifeResultStatus:['succeeded','rejected','no-action',null],lifePlanStatus:['ready','blocked',null],lifeRedirect:['safety','tool',null],lifeDecisionReason:[...SURVIVAL_REASON_CODES,null]};
const lifeNumbers=['selfFood','selfWallet','selfHunger','lifeFoodChange','lifeWalletChange'];
const digest=value=>createHash('sha256').update(canonicalJson(value)).digest('hex');
const list=(a,max)=>requireCondition(Array.isArray(a)&&a.length<=max,'Invalid bounded list');
function validStep(s,allowGift=false,maxTick=288){
 requireCondition(s&&typeof s==='object'&&!Array.isArray(s),'Invalid scenario step');
 if(Object.hasOwn(s,'agreement')){fields(s,['agreement']);requireCondition(['accept','claim','decline'].includes(s.agreement),'Invalid agreement step');}
 else if(Object.hasOwn(s,'advanceTo')){fields(s,['advanceTo']);requireCondition(Number.isSafeInteger(s.advanceTo)&&s.advanceTo>=0&&s.advanceTo<=maxTick,'Invalid scenario tick');}
 else if(Object.hasOwn(s,'move')){fields(s,['move']);fields(s.move,['x','y']);requireCondition(Number.isInteger(s.move.x)&&s.move.x>=0&&s.move.x<20&&Number.isInteger(s.move.y)&&s.move.y>=0&&s.move.y<12,'Invalid scenario destination');}
 else{fields(s,['type','payload']);
  if(s.type==='PlayerGiftFood'){requireCondition(allowGift,'Gift needs a fixture5 suite');fields(s.payload,['recipientId']);requireCondition(s.payload.recipientId==='actor-2','Unsupported gift recipient');}
  else requireCondition(s.type==='PlayerInteract'?validSocialPayload(s.payload):s.type==='PlayerNegotiate'&&validNegotiationPayload(s.type,s.payload),'Unsupported scripted action');
 }
}
export function validateDialogueSuite(suite){
 fields(suite,['schemaVersion','suiteId','provenance','cases',...([2,3].includes(suite.schemaVersion)?['fixtureVersion']:[])]);requireCondition((suite.schemaVersion===1||[2,3].includes(suite.schemaVersion)&&suite.fixtureVersion==='5')&&dialogueText(suite.suiteId,80)&&dialogueText(suite.provenance,300),'Invalid suite');list(suite.cases,16);requireCondition(suite.cases.length>0,'Empty suite');
 const ids=new Set();let count=0;
 for(const c of suite.cases){
  fields(c,['id','title','setup','turns']);requireCondition(typeof c.id==='string'&&/^[a-z][a-z0-9-]{0,30}$/.test(c.id)&&!ids.has(c.id)&&dialogueText(c.title,100),'Invalid case identity');ids.add(c.id);
  list(c.setup,16);c.setup.forEach(s=>validStep(s,suite.fixtureVersion==='5',suite.schemaVersion===3?576:288));list(c.turns,suite.schemaVersion===3?8:4);requireCondition(c.turns.length>0,'Empty case');const turns=new Set();
  for(const t of c.turns){
   fields(t,['id','text','before','expect']);requireCondition(typeof t.id==='string'&&/^[a-z][a-z0-9-]{0,30}$/.test(t.id)&&!turns.has(t.id)&&dialogueText(t.text),'Invalid dialogue turn');turns.add(t.id);count++;
   list(t.before,8);t.before.forEach(s=>validStep(s,suite.fixtureVersion==='5',suite.schemaVersion===3?576:288));const e=t.expect;fields(e,['proposalKeys','referenceAnyKinds','facts','humanReview']);
   list(e.proposalKeys,8);requireCondition(e.proposalKeys.length>0&&e.proposalKeys.every(k=>keys.includes(k)),'Invalid expected proposal');
   list(e.referenceAnyKinds,8);requireCondition(e.referenceAnyKinds.every(k=>memoryKinds.includes(k)),'Invalid expected memory kind');
   list(e.humanReview,4);requireCondition(e.humanReview.length>0&&e.humanReview.every(x=>dialogueText(x,300)),'Missing human review rubric');
   requireCondition(e.facts&&typeof e.facts==='object'&&!Array.isArray(e.facts)&&Object.keys(e.facts).every(k=>['condition','holder','agreement','repairAmount','loanTicks','repairProgress','knownHolder','grievanceAtLeast','memoryKinds',...Object.keys(lifeEnums),...lifeNumbers].includes(k)),'Invalid fixture assertion');
   for(const [k,v] of Object.entries(e.facts)){
    if(Object.hasOwn(lifeEnums,k))requireCondition(suite.fixtureVersion==='5'&&lifeEnums[k].includes(v),'Invalid life assertion');
    else if(lifeNumbers.includes(k))requireCondition(suite.fixtureVersion==='5'&&Number.isSafeInteger(v)&&v>=(k.startsWith('life')?-1000:0)&&v<=(k==='selfWallet'?1000000000:1000),'Invalid life numeric assertion');
    else if(k==='memoryKinds')requireCondition(Array.isArray(v)&&v.every(x=>memoryKinds.includes(x)),'Invalid memory assertion');
    else if(['holder','knownHolder','agreement'].includes(k))requireCondition(v===null||dialogueText(v,40),'Invalid state assertion');
    else requireCondition(Number.isSafeInteger(v)&&v>=0,'Invalid numeric assertion');
   }
  }
 }
 requireCondition(count<=32,'Too many suite turns');return count;
}
export function selectDialogueCases(suite,selection){
 validateDialogueSuite(suite);
 if(selection===undefined)return suite.cases;
 requireCondition(Array.isArray(selection)&&selection.length>0&&new Set(selection).size===selection.length&&selection.every(id=>suite.cases.some(c=>c.id===id)),'Unknown or duplicate case selection');
 return suite.cases.filter(c=>selection.includes(c.id));
}
const proposalKey=p=>p===null?'none':p.type==='PlayerNegotiate'?'negotiate':p.payload.action==='talk'?'talk:'+p.payload.topic:p.payload.action;
function facts(bundle){const w=bundle.snapshot.world;return {social:cloneData(w.mapModel.socialModel),agreement:cloneData(w.mapModel.negotiationModel.agreement),
 actors:cloneData(w.actorModel.actors),agents:w.societyModel.agents.map(a=>cloneData(a.state))};}
function checkPreconditions(bundle,expected){
 const w=bundle.snapshot.world,s=w.mapModel.socialModel,a=w.mapModel.negotiationModel.agreement,h=s.actors[1];
 const own=npcDialogueContext(bundle),life=own.activity;
 const actual={condition:s.asset.condition,holder:s.asset.holderId,agreement:a?.status??null,repairAmount:a?.terms.repairAmount??null,
  loanTicks:a?.terms.loanTicks??null,repairProgress:a?.repairProgress??null,knownHolder:h.knownHolder,grievanceAtLeast:h.grievance,memoryKinds:h.memories.map(m=>m.kind),
  selfFood:own.self.food,selfWallet:own.self.wallet,selfHunger:own.self.hunger??null,lifeIntent:life?.intent?.action??null,lifePhase:life?.intent?.phase??null,
  lifeResult:life?.lastResult?.action??null,lifeResultStatus:life?.lastResult?.status??null,lifePlanStatus:life?.plan?.status??null,lifeRedirect:life?.intent?.redirect??null,
  lifeDecisionReason:life?.decisionBasis?.reasonCode??null,lifeFoodChange:life?.lastResult?.foodChange??null,lifeWalletChange:life?.lastResult?.walletChange??null};
 return Object.entries(expected).map(([name,value])=>({name,expected:value,actual:actual[name],passed:name==='memoryKinds'?value.every(x=>actual[name].includes(x)):name==='grievanceAtLeast'?actual[name]>=value:actual[name]===value}));
}
export function assessDialogueProposal(payload,context,expect){
 const proposal=proposalKey(payload.proposal),refs=new Set(payload.memoryRefs);
 return [{name:'proposalMatchesScenario',passed:expect.proposalKeys.includes(proposal),actual:proposal,expected:expect.proposalKeys},
  {name:'requiredMemorySource',passed:expect.referenceAnyKinds.length===0||context.observations.some(m=>refs.has(m.eventSeq)&&expect.referenceAnyKinds.includes(m.kind)),expected:expect.referenceAnyKinds,
   actual:context.observations.filter(m=>refs.has(m.eventSeq)).map(m=>({eventSeq:m.eventSeq,kind:m.kind}))}];
}
function counts(report){const turns=report.cases.flatMap(c=>c.turns);return {planned:report.plannedRequests,attempted:turns.filter(t=>t.attempted).length,
 automaticPassed:turns.filter(t=>t.status==='automatic-pass').length,automaticFailed:turns.filter(t=>t.status==='automatic-fail').length,
 providerFailed:turns.filter(t=>t.status==='provider-failed').length,fixtureFailed:turns.filter(t=>t.status==='fixture-failed').length,
 blocked:turns.filter(t=>t.status==='blocked').length,notRun:turns.filter(t=>t.status==='not-run').length};}
export async function runDialogueEvaluation({suite,selection,mode='plan',provider,maxRequests=0,onProgress=async()=>{}}){
 const selected=selectDialogueCases(suite,selection),planned=selected.reduce((n,c)=>n+c.turns.length,0);
 requireCondition(modes.includes(mode),'Invalid evaluation mode');
 if(mode!=='plan')requireCondition(provider?.enabled===true&&Number.isSafeInteger(maxRequests)&&maxRequests>=planned&&maxRequests<=32,'Explicit enabled provider and sufficient request budget required');
 const fixtureVersion=suite.fixtureVersion??'4',factory=fixtureVersion==='5'?createMemoryCampaignVillage:createNegotiationCampaignVillage;
 const report={schemaVersion:1,fixtureVersion,suiteId:suite.suiteId,suiteSha256:digest(suite),mode,realProviderAttempted:false,semanticVerdict:'not-evaluated',
  notice:mode==='plan'?'离线计划；未调用模型，未检查模型语言质量。':mode==='controlled-test'?'受控协议测试；回复由测试夹具提供，不代表真实模型能力。':'真实模型输出；自动检查不能替代人工语义复核。',
  plannedRequests:planned,requestLimit:mode==='plan'?0:maxRequests,completed:false,cases:[]};
 let attempted=0;
 for(const c of selected){
  const opaqueId=digest(c.id).slice(0,12);
  let bundle=createAuditedBundle(factory(42,'npc5-world-'+opaqueId).bundle,options),serial=0,blocked=false;
  const entry={id:c.id,title:c.title,fixtureVersion:bundle.snapshot.fixtureVersion,setup:cloneData(c.setup),turns:[]};report.cases.push(entry);
  const action=(type,payload,trail)=>{
   const dto={version:5,commandId:'eval-'+opaqueId+'-'+(++serial),expectedRevision:bundle.snapshot.revision,type,payload};
   const result=deriveCampaignBundle(bundle,dto);requireCondition(result.receipt.outcome==='succeeded','Scripted scenario action was rejected');bundle=result.bundle;
   trail?.push({type,payload:cloneData(payload),tick:bundle.snapshot.tick,revision:bundle.snapshot.revision,result:cloneData(result.receipt.result)});return result.receipt;
  };
  const steps=(items,trail)=>{for(const s of items){
   if(s.agreement){const a=bundle.snapshot.world.mapModel.negotiationModel.agreement;requireCondition(a,'Script requires an existing agreement');action('PlayerAgreement',{targetId:'actor-2',agreementId:a.id,action:s.agreement},trail);}
   else if(Object.hasOwn(s,'advanceTo')){const delta=s.advanceTo-bundle.snapshot.tick;requireCondition(delta>=0,'Scenario cannot go backwards');if(delta)action('AdvanceTime',{ticks:delta},trail);}
   else if(s.move){action('MarchSet',s.move,trail);let n=0;while(bundle.snapshot.world.mapModel.order.status!=='arrived'){requireCondition(n++<32,'Scenario route exceeded limit');action(bundle.snapshot.world.mapModel.order.status==='paused'?'MarchResume':'MarchStep',{},trail);}}
   else action(s.type,s.payload,trail);
  }};
  entry.setupReceipts=[];
  try{steps(c.setup,entry.setupReceipts);}catch{blocked=true;entry.setupError='SCENARIO_SETUP_FAILED';}
  for(const t of c.turns){
   const row={id:t.id,text:t.text,status:'not-run',attempted:false,scriptedBefore:cloneData(t.before),scriptedReceipts:[],preconditions:[],context:null,response:null,metrics:null,factAudit:null,checks:[],humanReview:{verdict:'pending',questions:cloneData(t.expect.humanReview)}};
   entry.turns.push(row);
   if(blocked){row.status='blocked';report.counts=counts(report);report.factAuditSummary=summarizeFactAudits(report.cases);report.realProviderAttempted=mode==='live'&&attempted>0;await onProgress(cloneData(report));continue;}
   try{
    steps(t.before,row.scriptedReceipts);row.preconditions=checkPreconditions(bundle,t.expect.facts);
    const context=providerContext(npcDialogueContext(bundle),t.text);row.context=context;
    requireCondition(context.canTalk&&row.preconditions.every(x=>x.passed),'Scenario precondition failed');
   }catch{row.status='fixture-failed';row.errorCode='SCENARIO_PRECONDITION_FAILED';blocked=true;report.counts=counts(report);report.factAuditSummary=summarizeFactAudits(report.cases);report.realProviderAttempted=mode==='live'&&attempted>0;await onProgress(cloneData(report));continue;}
   if(mode!=='plan'){
    const request={apiVersion:1,requestId:'eval-'+c.id+'-'+t.id,simulationId:bundle.snapshot.simulationId,expectedRevision:bundle.snapshot.revision,targetId:'actor-2',text:t.text};
    const before=digest(facts(bundle)),original=digest(bundle);requireCondition(attempted<maxRequests,'Evaluation call budget exceeded');attempted++;row.attempted=true;
    try{
     const draft=await provider.compose(request,cloneData(row.context));
     requireCondition(draft?.simulationId===request.simulationId&&draft.revision===request.expectedRevision&&draft.requestId===request.requestId&&draft.type==='PlayerDialogue'&&
      validNegotiationPayload(draft.type,draft.payload)&&draft.payload.utterance===request.text&&provider.verify(request.simulationId,{type:draft.type,expectedRevision:request.expectedRevision,payload:draft.payload}),'Provider returned an unbound draft');
     row.checks.push({name:'generationDidNotWriteWorld',passed:digest(bundle)===original});
     row.response={reply:draft.payload.reply,memoryRefs:cloneData(draft.payload.memoryRefs),proposal:cloneData(draft.payload.proposal)};
     row.factAudit=auditDialogueFacts(row.response.reply,row.context);
     row.checks.push(...assessDialogueProposal(draft.payload,row.context,t.expect));
     const episodesBefore=digest(bundle.snapshot.world.mapModel.memoryModel?.actors.map(a=>({episodes:a.episodes,forgottenEpisodes:a.forgottenEpisodes}))??null);
     const receipt=action('PlayerDialogue',draft.payload);
     if(fixtureVersion==='5')row.checks.push({name:'speechDidNotCreateEpisodes',passed:digest(bundle.snapshot.world.mapModel.memoryModel.actors.map(a=>({episodes:a.episodes,forgottenEpisodes:a.forgottenEpisodes})))===episodesBefore});
     row.committedSpeech={eventSeq:receipt.result.sourceEventSeq,revision:bundle.snapshot.revision,tick:bundle.snapshot.tick};
     row.checks.push({name:'speechDidNotExecuteAction',passed:digest(facts(bundle))===before});
     row.status=row.checks.every(x=>x.passed)?'automatic-pass':'automatic-fail';
    }catch(error){row.status='provider-failed';row.errorCode=['MODEL_TIMEOUT','MODEL_UNAVAILABLE','MODEL_OUTPUT_INVALID','MODEL_BUDGET','MODEL_BUSY'].includes(error.code)?error.code:'EVALUATION_REJECTED';blocked=true;}
    row.metrics=provider.getMetrics?.(request.requestId)??null;
   }
   report.counts=counts(report);report.factAuditSummary=summarizeFactAudits(report.cases);report.realProviderAttempted=mode==='live'&&attempted>0;await onProgress(cloneData(report));
  }
  try{validateBundle(bundle,options);entry.worldReplayAudit='passed';}catch{entry.worldReplayAudit='failed';}
  entry.finalFactsSha256=digest(facts(bundle));
 }
 report.counts=counts(report);report.realProviderAttempted=mode==='live'&&attempted>0;report.completed=true;
 report.factAuditSummary=summarizeFactAudits(report.cases);
 report.semanticVerdict=report.counts.attempted?'needs-human-review':'not-evaluated';
 return report;
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
export function renderDialogueReport(report){
 const json=v=>'<pre>'+escape(JSON.stringify(v,null,2))+'</pre>';
 const status={'not-run':'未调用模型','blocked':'被前序失败阻塞','fixture-failed':'场景前置条件失败','provider-failed':'调用或输出无效','automatic-pass':'协议与动作检查通过 · 语义待复核','automatic-fail':'协议或动作检查未通过'};
 const auditLabel=a=>!a?'尚未核查':a.status==='contradiction-detected'?'检测到明确数值矛盾 · 请复核':a.status==='checked-no-contradiction'?'已识别的数值未见矛盾 · 覆盖有限':'未识别到可核对断言 · 不代表正确';
 const sections=report.cases.map(c=>{
  const turns=c.turns.map(t=>`<article><h3>${escape(t.id)} · ${escape(status[t.status]??t.status)}</h3><p>玩家</p><blockquote>${escape(t.text)}</blockquote><p>猎人${report.mode==='controlled-test'?'（受控测试回复）':''}</p><blockquote>${escape(t.response?.reply??'尚无模型回复')}</blockquote><p>建议尚未自动执行：${escape(t.response?JSON.stringify(t.response.proposal):'未运行')}</p><p class="${t.factAudit?.status==='contradiction-detected'?'warning':'muted'}">有限事实核查：${escape(auditLabel(t.factAudit))}</p><details><summary>当前存粮/钱包断言与实际数值</summary>${json(t.factAudit??null)}</details>${t.importedReview?'<p><strong>导入的评审（身份与独立性未验证）</strong></p>'+json(t.importedReview):''}<details><summary>确定性检查、记忆来源与耗时</summary>${json({preconditions:t.preconditions,checks:t.checks,memoryRefs:t.response?.memoryRefs,metrics:t.metrics,errorCode:t.errorCode})}</details><details><summary>该轮准备的猎人视角与脚本动作</summary>${json({context:t.context,scriptedReceipts:t.scriptedReceipts})}</details><p><strong>原人工复核记录</strong></p>${json({verdict:t.humanReview.verdict})}<ul>${t.humanReview.questions.map(q=>'<li>'+escape(q)+'</li>').join('')}</ul></article>`).join('');
  return `<section><h2>${escape(c.title)}</h2><p>世界重放审计：${escape(c.worldReplayAudit??'待运行')}</p><details><summary>测试脚本实际选择的前置动作</summary>${json(c.setupReceipts)}</details>${turns}</section>`;
 }).join('');
 const imported=report.reviewImport?'<section><h2>导入的逐轮评审</h2><p>'+escape(report.reviewImport.notice)+'</p>'+json(report.reviewImport)+'</section>':'';
 return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>NPC 对话评测记录</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#e9edf3;background:#131923;max-width:1000px;margin:auto;padding:32px}h1,h2{line-height:1.25}section,article{border:1px solid #3b485c;border-radius:8px;padding:20px;margin:20px 0}article{background:#1b2534}blockquote{border-left:3px solid #85aaf4;padding:8px 16px;white-space:pre-wrap}pre{overflow:auto;white-space:pre-wrap;word-break:break-word;font-size:13px}summary{cursor:pointer;color:#a8c8ff}.notice{padding:16px;border-left:4px solid #e1b862;background:#302a1d}.muted{color:#b0bdce}.warning{color:#ffc0b6}li{margin:8px 0}</style><h1>单猎人连续对话评测</h1><p class="notice">${escape(report.notice)}<br>原语义结论：${escape(report.semanticVerdict)}；报告完成：${report.completed?'是':'否'}。<br>有限事实核查只识别部分当前存粮/钱包表述；未发现矛盾不代表事实正确，不检查所有原因或经历，不能替代人工复核。</p><p class="muted">场景集：${escape(report.suiteId)} · 世界fixture：${escape(report.fixtureVersion??'4')} · 模式：${escape(report.mode)} · 请求上限：${escape(report.requestLimit)}。缺失 usage 不按零消耗计算；本报告不估算费用。</p>${json(report.counts)}<h2>有限事实核查覆盖</h2>${json(report.factAuditSummary??null)}${imported}${sections}<p class="muted">公开开发场景，不是盲测或独立金标。建议/引用格式检查通过，不等于角色理解、措辞与事实判断通过。</p></html>`;
}
