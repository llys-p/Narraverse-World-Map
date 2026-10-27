// Summarize V8 sampling without copying the potentially large profile into Git.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const [input,output]=process.argv.slice(2);assert.ok(input&&output,'Usage: node scripts/summarize-audit-cpu-profile.mjs PROFILE OUTPUT');
const bytes=fs.readFileSync(input),profile=JSON.parse(bytes),root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
assert.ok(Array.isArray(profile.nodes)&&Array.isArray(profile.samples)&&profile.samples.length>0);
const nodes=new Map(profile.nodes.map(n=>[n.id,n])),parents=new Map(),groups=new Map(),conditionCallers=new Map();
for(const n of profile.nodes)for(const c of n.children??[])parents.set(c,n.id);
function location(node){
 const f=node.callFrame;let url=f.url||'(native)';
 if(url.startsWith('file:')){const file=fileURLToPath(url);url=file.startsWith(root+path.sep)?path.relative(root,file):'(external file)';}
 else if(url.startsWith('data:'))url='(instrumented service copy)';
 return {function:f.functionName||'(anonymous)',file:url,line:f.lineNumber+1};
}
const group=n=>{const loc=location(n),key=JSON.stringify(loc);if(!groups.has(key))groups.set(key,{...loc,selfSamples:0,inclusiveSamples:0});return groups.get(key);};
for(const id of profile.samples){let n=nodes.get(id);assert.ok(n,'unknown sample node');group(n).selfSamples++;const seen=new Set();
 if(n.callFrame.functionName==='requireCondition'){const caller=nodes.get(parents.get(n.id));if(caller){const key=JSON.stringify(location(caller));conditionCallers.set(key,(conditionCallers.get(key)??0)+1);}}
 while(n){const g=group(n);if(!seen.has(g)){g.inclusiveSamples++;seen.add(g);}n=nodes.get(parents.get(n.id));}}
const top=(key)=>[...groups.values()].sort((a,b)=>b[key]-a[key]).slice(0,30);
const result={measurement:'v8-cpu-sample-entire-instrumented-audit-process',profileSha256:createHash('sha256').update(bytes).digest('hex'),profileBytes:bytes.length,samples:profile.samples.length,profileDurationMs:(profile.endTime-profile.startTime)/1000,self:top('selfSamples'),inclusive:top('inclusiveSamples'),conditionCallers:[...conditionCallers].map(([key,samples])=>({...JSON.parse(key),samples})).sort((a,b)=>b.samples-a.samples).slice(0,20),scope:'Sampling includes startup, audit, comparisons and output; inclusive samples overlap. Counts are not end-to-end latency or FPS.'};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({samples:result.samples,profileDurationMs:result.profileDurationMs,self:result.self.slice(0,10),inclusive:result.inclusive.slice(0,10)}));
