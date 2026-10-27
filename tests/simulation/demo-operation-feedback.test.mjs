import test from 'node:test';
import assert from 'node:assert/strict';
import {createOperationFeedback,operationLabel} from '../../demo-operation-feedback.mjs';
function fixture(){
 let clock=0,id=0;const jobs=new Map(),statuses=[],progress=[];
 const feedback=createOperationFeedback({onStatus:(...s)=>statuses.push(s),onProgress:p=>progress.push(p),now:()=>clock,schedule:fn=>{jobs.set(++id,fn);return id;},cancel:i=>jobs.delete(i)});
 return {feedback,jobs,statuses,progress,advance(ms){clock+=ms;for(const fn of [...jobs.values()])fn();}};
}
test('feedback publishes immediately, separates phases and counts display seconds without another operation',()=>{
 const f=fixture(),ticket=f.feedback.begin('村庄工作');assert.match(f.statuses.at(-1)[0],/正在确认.*工作/);assert.equal(f.progress.at(-1).elapsedSeconds,0);assert.equal(f.jobs.size,1);
 f.advance(2700);assert.equal(f.progress.at(-1).elapsedSeconds,2);assert.equal(f.statuses.length,1,'timer does not repeat live-region announcements');
 f.feedback.phase(ticket,'refresh');assert.match(f.statuses.at(-1)[0],/已收到回执.*读取/);f.feedback.phase(ticket,'present');assert.match(f.statuses.at(-1)[0],/已确认/);
 f.feedback.finish(ticket);assert.equal(f.jobs.size,0);assert.equal(f.progress.at(-1).active,false);
});
test('hidden, resumed, disposed and stale timer callbacks cannot leak or replace a newer operation',()=>{
 const f=fixture(),first=f.feedback.begin('旧操作'),stale=[...f.jobs.values()][0];f.feedback.suspend();assert.equal(f.jobs.size,0);f.advance(5000);f.feedback.resume();assert.equal(f.progress.at(-1).elapsedSeconds,5);assert.equal(f.jobs.size,1);
 const second=f.feedback.begin('新操作'),before=f.progress.length;stale();assert.equal(f.progress.length,before);assert.equal(f.feedback.finish(first),false);assert.match(f.feedback.message(),/新操作/);
 f.feedback.dispose();assert.equal(f.jobs.size,0);assert.equal(f.feedback.finish(second),false);assert.equal(f.feedback.message(),null);
});
test('network notices preserve request ambiguity and do not relabel a received receipt as unconfirmed',()=>{
 const f=fixture(),ticket=f.feedback.begin('等待');f.feedback.connectionLost(true);assert.match(f.feedback.message(),/原请求仍在确认/);
 f.feedback.phase(ticket,'refresh');assert.match(f.feedback.message(),/已收到回执/);assert.doesNotMatch(f.feedback.message(),/原请求仍在确认/);
 f.feedback.connectionLost(false);assert.doesNotMatch(f.feedback.message(),/中断/);f.feedback.finish(ticket);
});
test('labels use the existing command grammar without treating user text or time as execution',()=>{
 assert.equal(operationLabel({type:'AdvanceTime',payload:{ticks:6}}),'等待60分钟（世界时间）');assert.equal(operationLabel({type:'AdvanceTime',payload:{ticks:NaN}}),'等待');
 assert.equal(operationLabel({type:'<script>',payload:{text:'secret'}}),'本次操作');assert.equal(operationLabel({type:'PlayerQuest',payload:{}}),'任务操作');
 for(const type of ['constructor','__proto__','toString',{},null])assert.equal(operationLabel({type}),'本次操作');
});
