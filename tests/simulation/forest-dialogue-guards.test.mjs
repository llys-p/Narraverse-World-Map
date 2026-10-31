import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseForestDialogueArgs,runForestDialogueEvaluation} from '../../scripts/evaluate-forest-dialogue.mjs';

test('forest live dialogue refuses implicit authorization, missing selection and unbounded budgets',()=>{
 for(const args of [
  ['--mode','live','--out','unused'],
  ['--mode','live','--out','unused','--allow-model-calls','--max-requests','12'],
  ['--mode','live','--out','unused','--case','all','--max-requests','12'],
  ['--mode','live','--out','unused','--case','all','--allow-model-calls','--max-requests','17'],
  ['--mode','controlled-test','--out','unused','--allow-model-calls']
 ])assert.throws(()=>parseForestDialogueArgs(args));
 assert.equal(parseForestDialogueArgs(['--out','unused']).mode,'plan');
});

test('a live budget below the selected forest turns fails before output creation or any fetch',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'forest-budget-')),out=path.join(root,'run');let fetched=0;
 try{await assert.rejects(runForestDialogueEvaluation({mode:'live',selection:'all',out,maxRequests:4,allow:true},{env:{},fetchImpl:async()=>{fetched++;throw Error('Must not fetch');}}),/Insufficient request budget/);assert.equal(fetched,0);assert.deepEqual(await fs.readdir(root),[]);}finally{await fs.rm(root,{recursive:true,force:true});}
});

test('missing explicit model configuration fails before output creation or any fetch',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'forest-config-')),out=path.join(root,'run');let fetched=0;
 try{await assert.rejects(runForestDialogueEvaluation({mode:'live',selection:'borrow-return',out,maxRequests:4,allow:true},{env:{},fetchImpl:async()=>{fetched++;throw Error('Must not fetch');}}));assert.equal(fetched,0);assert.deepEqual(await fs.readdir(root),[]);}finally{await fs.rm(root,{recursive:true,force:true});}
});
