import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import * as candidate from '../../runtime/core/data-contract.mjs';
const reference=async sha=>import('data:text/javascript;base64,'+Buffer.from(execFileSync('git',['show',sha+':runtime/core/data-contract.mjs'],{encoding:'utf8'})).toString('base64'));
const accepted=await reference('2936233426e990857f3c88a39ad58623832419fd');
const deepseek=await reference('10a2180441fcc9509a6ddd561ac97679f279aa9f');
const file='D:/Narraverse-World-Map/hds-d4-cp1a-review/artifacts/world-runtime-d4-cp3-controller/CP3-FULL-19796-1791960566578/runtime-data/service-commit-r170.json';
const raw=fs.readFileSync(file),sha=createHash('sha256').update(raw).digest('hex');
assert.equal(sha,'3bf39f7cf0b9e7adb5a39a1969dbf0bc111ec20d18fb5b4b7e92c907969450dd');
const sample=JSON.parse(raw),models=[['accepted293',accepted],['deepseek10a',deepseek],['candidate',candidate]],results=[],rounds=250;
for(const [,m]of models)assert.equal(m.canonicalJson(m.cloneData(sample)),accepted.canonicalJson(sample));
for(let repeat=0;repeat<3;repeat++)for(const [name,m]of [...models.slice(repeat),...models.slice(0,repeat)]){
  const row={repeat,name,rounds};
  for(const op of ['cloneData','canonicalJson']){for(let i=0;i<10;i++)m[op](sample);const t=performance.now();for(let i=0;i<rounds;i++)m[op](sample);row[op+'Ms']=performance.now()-t;}
  results.push(row);
}
const result={at:new Date().toISOString(),kind:'r170 parse then clone/encode only; NOT runtime open',sha,results};
fs.writeFileSync(new URL('micro-real-result.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
