import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describeActionReceipt,recordConfirmedAction} from '../../demo-runtime-interactions.mjs';
const commands=JSON.parse(readFileSync(new URL('../../docs/evidence/d4e12-demo-gameplay-20261018/context-r4-result.json',import.meta.url))).commands;

test('real sale, purchase, work and rest receipts show actual deltas without mutating data',()=>{
 const before=structuredClone(commands),views=commands.map(e=>describeActionReceipt(e.receipt,e.dto));
 assert.match(views[0].summary,/卖出.*粮食/);assert(views[0].changes.includes('金币 +10'));assert(views[0].changes.includes('粮食 -2'));
 assert.match(views[1].summary,/买入.*粮食/);assert(views[1].changes.includes('金币 -10'));assert(views[1].changes.includes('粮食 +1'));
 assert(views[2].changes.includes('金币 +20'));assert(views[2].changes.includes('疲劳 +150'));assert.match(views[2].time,/6小时/);
 assert(views[3].changes.includes('疲劳 -100'));assert(!views[3].changes.some(x=>x.includes('生命')));assert.match(views[3].time,/1小时/);
 assert.deepEqual(commands,before);
 const dto={version:5,commandId:'gift',expectedRevision:0,type:'PlayerGiftFood',payload:{recipientId:'actor-2'}};
 const receipt={apiVersion:1,receiptVersion:5,commandId:'gift',status:'committed',fromRevision:0,toRevision:1,fromTick:0,tick:0,durationTicks:0,type:dto.type,outcome:'succeeded',
  result:{donorId:'actor-4',recipientId:'actor-2',product:'food',quantity:1,sourceEventSeq:1,reasonCode:null}};
 assert.deepEqual(describeActionReceipt(receipt,dto).changes,['粮食 -1','对方已收到粮食']);
});

test('rejection has no claimed gains, malformed or unconfirmed input never becomes a result',()=>{
 const dto={version:5,commandId:'rejected',expectedRevision:44,type:'PlayerWork',payload:{}};
 const receipt={...commands[2].receipt,commandId:'rejected',fromRevision:44,toRevision:45,fromTick:44,tick:44,durationTicks:0,outcome:'rejected',result:{code:'RULE_REJECTED'}};
 const view=describeActionReceipt(receipt,dto);assert.equal(view.outcome,'rejected');assert.deepEqual(view.changes,[]);assert.match(view.summary,/未完成/);assert.match(view.reason,/条件/);assert.match(view.time,/未推进/);
 assert.equal(describeActionReceipt({...receipt,status:'pending'},dto),null);
 assert.equal(describeActionReceipt({...receipt,commandId:'foreign'},dto),null);
 assert.equal(describeActionReceipt(null,dto),null);
});

test('history deduplicates receipt retries, keeps rejection, and stores only the latest eight',()=>{
 let history=[];
 for(let i=0;i<12;i++){
  const dto={version:5,commandId:'history-'+i,expectedRevision:i,type:'AdvanceTime',payload:{ticks:1}};
  const receipt={apiVersion:1,receiptVersion:5,commandId:dto.commandId,status:'committed',fromRevision:i,toRevision:i+1,fromTick:i,tick:i+1,durationTicks:1,type:dto.type,outcome:'succeeded',result:null};
  history=recordConfirmedAction(history,receipt,dto);
  const current=history;history=recordConfirmedAction(history,receipt,dto);assert.equal(history,current);
 }
 assert.equal(history.length,8);assert.equal(history[0].commandId,'history-11');assert.equal(history.at(-1).commandId,'history-4');
 const dto={version:5,commandId:'rejected',expectedRevision:44,type:'PlayerWork',payload:{}};
 const receipt={...commands[2].receipt,commandId:dto.commandId,fromRevision:44,toRevision:45,fromTick:44,tick:44,durationTicks:0,outcome:'rejected',result:{code:'RULE_REJECTED'}};
 history=recordConfirmedAction(history,receipt,dto);assert.equal(history[0].outcome,'rejected');assert.equal(history.length,8);
 const current=history;assert.equal(recordConfirmedAction(history,{...receipt,status:'pending'},dto),current);
});
