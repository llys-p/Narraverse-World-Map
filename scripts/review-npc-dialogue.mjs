import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseStrictJson} from '../runtime/service/strict-json.mjs';
import {requireCondition,fault} from '../runtime/core/data-contract.mjs';
import {createReviewTemplate,attachDialogueReview,refreshDialogueFactAudits} from '../runtime/evaluation/npc-dialogue-review.mjs';
import {renderDialogueReport} from '../runtime/evaluation/npc-dialogue-eval.mjs';

const usage='Offline only: node scripts/review-npc-dialogue.mjs --report original.json --template review.json\nOr: --report original.json [--reviews completed-review.json] --out annotated.json\nNever calls models or loads credentials. Outputs are new files; source reports and humanReview remain unchanged.';
export function parseReviewArgs(args){
 if(args.length===1&&args[0]==='--help')return {help:true};
 const out={},seen=new Set();
 for(let i=0;i<args.length;i++){
  const name=args[i];requireCondition(['--report','--template','--reviews','--out'].includes(name)&&!seen.has(name),'Unknown or duplicate review flag');seen.add(name);
  const value=args[++i];requireCondition(typeof value==='string'&&value.length>0&&!value.startsWith('--'),'Missing review path');out[name.slice(2)]=path.resolve(value);
 }
 requireCondition(out.report&&Boolean(out.template)!==Boolean(out.out)&&(!out.reviews||out.out),'Choose template or annotated output');
 const output=out.template??out.out;requireCondition(output.endsWith('.json')&&!/service-commit-r\d+\.json$/u.test(output),'Review output must be a new JSON report');
 return out;
}
async function readJson(filename){
 const handle=await fs.open(filename,'r');
 try{requireCondition((await handle.stat()).size<=4194304,'Review input is too large','LIMIT_EXCEEDED');const bytes=await handle.readFile();return {bytes,value:parseStrictJson(bytes,4194304)};}
 finally{await handle.close();}
}
async function writeNew(outputs){
 const opened=[];
 try{
  for(const [filename,content] of outputs){await fs.mkdir(path.dirname(filename),{recursive:true});opened.push({filename,content,handle:await fs.open(filename,'wx')});}
 }catch(error){for(const f of opened){await f.handle.close();await fs.unlink(f.filename);}throw fault(error.code==='EEXIST'?'OUTPUT_EXISTS':'REPORT_UNAVAILABLE','Cannot reserve review output');}
 try{for(const f of opened){await f.handle.writeFile(f.content);await f.handle.sync();}}
 finally{for(const f of opened)await f.handle.close();}
}
export async function reviewDialogueCli(args,{log=console.log}={}){
 const settings=parseReviewArgs(args);if(settings.help){log(usage);return {exitCode:0};}
 const source=await readJson(settings.report);
 if(settings.template){
  const template=createReviewTemplate(source.value,source.bytes);
  await writeNew([[settings.template,JSON.stringify(template,null,2)+'\n']]);
  log(JSON.stringify({status:'review-template-ready',turns:template.turns.length,output:settings.template,externalModelCalls:0}));
  return {exitCode:0,template,out:settings.template};
 }
 const algorithm=await fs.readFile(new URL('../runtime/evaluation/npc-fact-audit.mjs',import.meta.url));
 const audited=refreshDialogueFactAudits(source.value,source.bytes,createHash('sha256').update(algorithm).digest('hex'));
 let report=audited;
 if(settings.reviews){const review=await readJson(settings.reviews);report=attachDialogueReview(audited,source.bytes,review.value,review.bytes);}
 const html=settings.out.slice(0,-5)+'.html';
 await writeNew([[settings.out,JSON.stringify(report,null,2)+'\n'],[html,renderDialogueReport(report)]]);
 const contradictions=report.factAuditSummary.contradictionTurns,corrections=report.reviewImport?.summary.needsCorrection??0;
 const exitCode=contradictions||corrections?1:0;
 log(JSON.stringify({status:exitCode?'review-needs-correction':'review-recorded',factAuditSummary:report.factAuditSummary,reviewImport:report.reviewImport?.summary??null,output:settings.out,html,externalModelCalls:0}));
 return {exitCode,report,out:settings.out,html};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.exitCode=(await reviewDialogueCli(process.argv.slice(2))).exitCode;}
 catch(error){console.error(JSON.stringify({status:'blocked',code:['OUTPUT_EXISTS','REVIEW_INVALID','LIMIT_EXCEEDED','REPORT_UNAVAILABLE','INVALID_INPUT'].includes(error.code)?error.code:'REVIEW_FAILED'}));process.exitCode=2;}
}
