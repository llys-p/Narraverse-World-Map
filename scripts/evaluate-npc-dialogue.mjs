import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {npcLanguageConfig,createNpcLanguageProvider} from '../runtime/service/npc-language-provider.mjs';
import {selectDialogueCases,runDialogueEvaluation,renderDialogueReport} from '../runtime/evaluation/npc-dialogue-eval.mjs';
import {requireCondition,fault} from '../runtime/core/data-contract.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const usage='Usage: node scripts/evaluate-npc-dialogue.mjs [--mode plan|live] [--case all|case-id] [--out report.json]\nLive additionally requires --allow-model-calls --max-requests N and this project NPC_LLM_* configuration.\nDefault is plan: zero model/network calls; no semantic quality score.';
export function parseEvaluationArgs(args){
 const result={mode:'plan',selection:undefined,maxRequests:0,allowModelCalls:false,out:null},seen=new Set();
 for(let i=0;i<args.length;i++){
  const flag=args[i];requireCondition(!seen.has(flag),'Duplicate evaluation flag');seen.add(flag);
  if(flag==='--help'){requireCondition(args.length===1,'Help must be used alone');return {help:true};}
  if(flag==='--allow-model-calls'){result.allowModelCalls=true;continue;}
  requireCondition(['--mode','--case','--max-requests','--out'].includes(flag),'Unknown evaluation flag');const value=args[++i];requireCondition(typeof value==='string'&&value.length>0&&!value.startsWith('--'),'Missing flag value');
  if(flag==='--mode'){requireCondition(['plan','live'].includes(value),'Invalid evaluation mode');result.mode=value;}
  if(flag==='--case')result.selection=value==='all'?undefined:[value];
  if(flag==='--max-requests'){requireCondition(/^[1-9][0-9]?$/.test(value)&&Number(value)<=32,'Request limit must be 1..32');result.maxRequests=Number(value);}
  if(flag==='--out')result.out=value;
 }
 if(result.mode==='live')requireCondition(result.allowModelCalls&&seen.has('--case')&&seen.has('--max-requests'),'Live needs explicit case, request limit and call authorization flag','MODEL_CALLS_NOT_AUTHORIZED');
 else requireCondition(!result.allowModelCalls&&result.maxRequests===0,'Plan mode does not accept model-call flags');
 return result;
}
async function fingerprints(){
 const files=['benchmarks/npc-dialogue-v1/cases.json','runtime/service/npc-language-provider.mjs','runtime/evaluation/npc-dialogue-eval.mjs',
  'runtime/core/npc-negotiation.mjs','runtime/core/npc-social.mjs','runtime-negotiation-contract.mjs','scripts/evaluate-npc-dialogue.mjs'];
 const hashes={};for(const f of files)hashes[f]=createHash('sha256').update(await fs.readFile(path.join(root,f))).digest('hex');
 let baseCommit=null,workingTreeDirty=null;try{baseCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();workingTreeDirty=Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim());}catch{}
 return {baseCommit,workingTreeDirty,sha256:hashes,node:process.version};
}
export async function evaluateDialogueCli(args,{env=process.env,fetchImpl=fetch,log=console.log}={}){
 const settings=parseEvaluationArgs(args);if(settings.help){log(usage);return {exitCode:0};}
 const suite=JSON.parse(await fs.readFile(path.join(root,'benchmarks/npc-dialogue-v1/cases.json'),'utf8'));
 const cases=selectDialogueCases(suite,settings.selection),planned=cases.reduce((n,c)=>n+c.turns.length,0);
 let config={enabled:false},provider;
 if(settings.mode==='live'){
  requireCondition(settings.maxRequests>=planned,'Request budget is below selected turn count','MODEL_BUDGET');
  config=npcLanguageConfig(env);
  const missing=['NPC_LLM_ENABLED','NPC_LLM_BASE_URL','NPC_LLM_MODEL','NPC_LLM_API_KEY'].filter(name=>name==='NPC_LLM_ENABLED'?env[name]!=='true':!env[name]?.trim());
  if(missing.length)throw Object.assign(fault('MODEL_CONFIGURATION_REQUIRED','Explicit NPC model configuration is missing'),{missing});
  try{provider=createNpcLanguageProvider(config,{fetchImpl,maxCalls:settings.maxRequests});}
  catch{throw fault('MODEL_CONFIGURATION_INVALID','NPC model configuration is invalid');}
 }
 const source=await fingerprints(),out=path.resolve(root,settings.out??'artifacts/npc5-dialogue-eval/'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+process.pid+'.json');
 requireCondition(out.endsWith('.json')&&!/service-commit-r\d+\.json$/.test(out),'Output must be a new evaluation JSON report');const html=out.slice(0,-5)+'.html';
 const opened=[];
 try{
  await fs.mkdir(path.dirname(out),{recursive:true});
  try{for(const name of [out,html])opened.push({name,handle:await fs.open(name,'wx')});}
  catch(error){for(const file of opened){await file.handle.close();await fs.unlink(file.name);}opened.length=0;throw fault(error.code==='EEXIST'?'OUTPUT_EXISTS':'REPORT_UNAVAILABLE','Output files could not be reserved');}
  const metadata={source,provider:settings.mode==='live'?{model:config.apiKey?config.model.split(config.apiKey).join('[redacted]'):config.model,thinking:provider.thinking,endpointSha256:createHash('sha256').update(config.baseURL).digest('hex')}:null,createdAt:new Date().toISOString()};
  const save=async report=>{
   const document={...report,...metadata};
   for(const [i,bytes] of [Buffer.from(JSON.stringify(document,null,2)+'\n'),Buffer.from(renderDialogueReport(document))].entries()){
    let offset=0;while(offset<bytes.length){const written=await opened[i].handle.write(bytes,offset,bytes.length-offset,offset);requireCondition(written.bytesWritten>0,'Cannot write report','REPORT_UNAVAILABLE');offset+=written.bytesWritten;}
    await opened[i].handle.truncate(bytes.length);await opened[i].handle.sync();
   }
  };
  await save({schemaVersion:1,suiteId:suite.suiteId,mode:settings.mode,notice:'测试准备中；没有语义质量结论。',completed:false,semanticVerdict:'not-evaluated',requestLimit:settings.maxRequests,cases:[],counts:{planned,attempted:0}});
  const report=await runDialogueEvaluation({suite,selection:settings.selection,mode:settings.mode,provider,maxRequests:settings.maxRequests,onProgress:save});
  await save(report);
  const failed=report.counts.automaticFailed+report.counts.providerFailed+report.counts.fixtureFailed+report.counts.blocked+report.cases.filter(c=>c.worldReplayAudit!=='passed').length;
  log(JSON.stringify({status:failed?'checks-failed':settings.mode==='plan'?'plan-ready':'human-review-required',mode:settings.mode,counts:report.counts,semanticVerdict:report.semanticVerdict,output:out,html}));
  return {exitCode:failed?1:0,report:{...report,...metadata},out,html};
 }finally{provider?.close();for(const file of opened)await file.handle.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  // Only this repository's explicit .env is read; plan mode never needs credentials.
  const args=process.argv.slice(2);
  if(parseEvaluationArgs(args).mode==='live')try{process.loadEnvFile(path.join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw fault('MODEL_CONFIGURATION_INVALID','Cannot read project model configuration');}
  const result=await evaluateDialogueCli(args);process.exitCode=result.exitCode;
 }catch(error){console.error(JSON.stringify({status:'blocked',code:['MODEL_CALLS_NOT_AUTHORIZED','MODEL_CONFIGURATION_REQUIRED','MODEL_CONFIGURATION_INVALID','MODEL_BUDGET','OUTPUT_EXISTS','REPORT_UNAVAILABLE','INVALID_INPUT'].includes(error.code)?error.code:'EVALUATION_FAILED',...(error.missing?{missing:error.missing}:{})}));process.exitCode=2;}
}
