// Frozen PR28 modules: only relative imports are rebased to unchanged local dependencies.
// No sibling checkout, Git executable, network, temporary modules, or model calls required.
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const evidence=new URL('../../docs/evidence/service-short-commands-20261026/',import.meta.url);
async function baseline(file,original,expected){
 const bytes=await fs.readFile(new URL(file,evidence));assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,'frozen PR28 source');
 const source=bytes.toString().replace(/(from\s*['"])(\.\.?\/[^'"]+)(['"])/g,(_,a,p,z)=>a+new URL(p,new URL('../../'+original,import.meta.url)).href+z);
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const parentEngine=await baseline("parent-command-engine.source.txt","runtime/core/command-engine.mjs","f252049a674f1462e201ca96619309f945e7602539630dc83522673eb7e69e61");
const parentFile=await baseline("parent-bounded-json-file.source.txt","runtime/persistence/bounded-json-file.mjs","268bd7b3c3004f8190aeec14b7bdba7c24b59033e5a617b6be7843089e311bea");
const parentContract=await baseline("http-contract-before-projection.source.txt","runtime/service/http-contract.mjs","8421267edd4422a56b106e3ec7c94caa6f7bb5ecea6e05134032614f65498b3f");
export const parentSession=parentEngine.createSimulationSession,parentEncode=parentFile.encodeStateFile,oldEncounter=parentContract.projectEncounterSnapshot,oldScene=parentContract.projectSceneSnapshot;
