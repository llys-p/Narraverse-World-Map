import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewTemplate} from '../../runtime/evaluation/npc-dialogue-review.mjs';
import {renderDialogueReport} from '../../runtime/evaluation/npc-dialogue-eval.mjs';

// Synthetic imported-report format, not a world run or real model response.
const report=()=>({schemaVersion:1,completed:true,suiteId:'synthetic-input',mode:'controlled-test',requestLimit:1,semanticVerdict:'needs-human-review',notice:'合成输入边界',counts:{attempted:1},cases:[{
 id:'input-case',title:'导入字段',setupReceipts:[],turns:[{id:'reply',text:'你好。',status:'automatic-pass',context:{self:{food:0,wallet:0}},response:{reply:'你好。',memoryRefs:[],proposal:null},checks:[],preconditions:[],humanReview:{verdict:'pending',questions:['检查原始字段与文本转义。']}}]}]});

test('imported reports require a bounded numeric request limit before review output can be written',()=>{
 for(const value of ['<img src=x onerror=alert(1)>',-1,33,null]){
  const r=report();r.requestLimit=value;
  assert.throws(()=>createReviewTemplate(r,Buffer.from(JSON.stringify(r))));
 }
});

test('the reusable renderer escapes request-limit display even for a malformed caller object',()=>{
 const r=report();r.requestLimit='<img src=x onerror=alert(1)>';
 const html=renderDialogueReport(r);
 assert.equal(html.includes('<img'),false);assert.match(html,/&lt;img/);assert.match(html,/default-src 'none'/);
});
