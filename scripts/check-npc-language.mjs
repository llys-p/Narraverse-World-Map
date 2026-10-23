import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {interpretSocialText,intentKey,LANGUAGE_VERSION} from '../demo-social-language.mjs';

export function evaluateLanguageCases(cases,interpret=interpretSocialText){
 if(!Array.isArray(cases)||cases.length===0)throw Error('Cases must be a nonempty array');
 const ids=new Set(),families={},rows=[];
 for(const c of cases){
  if(!c||typeof c.id!=='string'||ids.has(c.id)||!c.family||!c.basis||!Array.isArray(c.expected)||
   !['ready','clarify','unsupported','invalid','empty'].includes(c.status)||!['none','tool','talk'].includes(c.context))throw Error('Invalid or duplicate case');
  ids.add(c.id);const context=c.context==='none'?null:{confirmed:true,tool:c.context==='tool'};
  const actual=interpret(c.text,context),keys=actual.candidates.map(intentKey);
  const correct=actual.status===c.status&&JSON.stringify(keys)===JSON.stringify(c.expected);
  const f=families[c.family]??={cases:0,correct:0};f.cases++;if(correct)f.correct++;
  rows.push({id:c.id,family:c.family,expectedStatus:c.status,actualStatus:actual.status,expected:c.expected,actual:keys,correct,ruleIds:actual.ruleIds});
 }
 const ready=rows.filter(r=>r.expectedStatus==='ready'),accepted=rows.filter(r=>r.actualStatus==='ready');
 return {scope:'Author-written public development examples only; no held-out, independent labels, model evaluation or E1 admission.',
  version:LANGUAGE_VERSION,cases:rows.length,correct:rows.filter(r=>r.correct).length,
  supported:ready.length,accepted:accepted.length,correctAccepted:accepted.filter(r=>r.correct).length,
  falseReady:accepted.filter(r=>!r.correct).length,abstainBaseline:{accepted:0,correctAccepted:0,falseReady:0},families,rows};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length>1)throw Error('Usage: node scripts/check-npc-language.mjs [report.json]');
 const file=new URL('../benchmarks/npc-language-v1/cases.json',import.meta.url),raw=await fs.readFile(file),code=await fs.readFile(new URL('../demo-social-language.mjs',import.meta.url));
 const report={...evaluateLanguageCases(JSON.parse(raw)),dataSha256:createHash('sha256').update(raw).digest('hex'),parserSha256:createHash('sha256').update(code).digest('hex')};
 if(args[0])await fs.writeFile(args[0],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({cases:report.cases,correct:report.correct,supported:report.supported,accepted:report.accepted,falseReady:report.falseReady,
  failures:report.rows.filter(r=>!r.correct),report:args[0]??null},null,2));
 if(report.correct!==report.cases)process.exitCode=1;
}
