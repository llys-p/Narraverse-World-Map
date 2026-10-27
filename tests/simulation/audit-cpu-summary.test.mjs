import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('CPU summary counts recursive frames once per stack and hides data URLs',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'audit-cpu-summary-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
 const frame=(functionName,url='data:text/javascript,private',lineNumber=0)=>({functionName,url,lineNumber,columnNumber:0,scriptId:'1'});
 const profile={startTime:1000,endTime:4000,nodes:[{id:1,callFrame:frame('root',''),children:[2]},{id:2,callFrame:frame('recursive'),children:[3]},{id:3,callFrame:frame('recursive')}],samples:[2,3,3]};
 const input=path.join(dir,'profile.json'),output=path.join(dir,'summary.json');await fs.writeFile(input,JSON.stringify(profile));
 execFileSync(process.execPath,[fileURLToPath(new URL('../../scripts/summarize-audit-cpu-profile.mjs',import.meta.url)),input,output]);
 const result=JSON.parse(await fs.readFile(output)),row=result.self.find(x=>x.function==='recursive');
 assert.equal(result.samples,3);assert.equal(result.profileDurationMs,3);assert.equal(row.selfSamples,3);assert.equal(row.inclusiveSamples,3);assert.equal(row.file,'(instrumented service copy)');
 assert.ok(!JSON.stringify(result).includes('private'));
});
