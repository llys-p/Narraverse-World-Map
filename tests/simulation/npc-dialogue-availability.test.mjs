import test from 'node:test';
import assert from 'node:assert/strict';
import {createNpcDialogue} from '../../demo-npc-dialogue.mjs';
const group=(enabled=true,revision=1)=>({snapshot:{simulationId:'npc16-availability',revision},capabilities:{npcLanguage:{enabled}},map:{negotiation:{canTalk:true,canPropose:true}}});
const response=req=>Response.json({apiVersion:1,requestId:req.requestId,simulationId:req.simulationId,revision:req.expectedRevision,type:'PlayerDialogue',payload:{targetId:'actor-2',utterance:req.text,reply:'受控旧预览。',memoryRefs:[],proposal:null,model:'controlled',seal:'0'.repeat(64)}});

test('preview from an enabled session cannot be committed after the server reports language disabled',async()=>{
 const c=createNpcDialogue({newId:()=> 'availability',fetchImpl:async(_url,o)=>response(JSON.parse(o.body))}),g=group();
 c.edit('现在呢？',g,'actor-2');await c.generate(g,true,'actor-2');assert.equal(c.view(g,true,'actor-2').canCommit,true);
 const reopened=group(false);c.observe(reopened,'actor-2');assert.equal(c.view(reopened,true,'actor-2').canCommit,false);
 assert.throws(()=>c.command(reopened,true,'actor-2'));
});

test('late response after a world change or closing the card cannot revive a preview',async()=>{
 for(const close of [false,true]){
  let release;const wait=new Promise(r=>release=r);let calls=0;
  const c=createNpcDialogue({newId:()=> 'late',fetchImpl:async(_url,o)=>{calls++;await wait;return response(JSON.parse(o.body));}}),g=group();
  c.edit('现在呢？',g,'actor-2');const pending=c.generate(g,true,'actor-2');assert.equal(c.view(g,true,'actor-2').canGenerate,false);
  const next=group(true,2);if(close)c.reset();else c.observe(next,'actor-2');release();await pending;
  assert.equal(calls,1);assert.equal(c.view(next,true,'actor-2').canCommit,false);assert.equal(c.view(next,true,'actor-2').reply,'');
 }
});
