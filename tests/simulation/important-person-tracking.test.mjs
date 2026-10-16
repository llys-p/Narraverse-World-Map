import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildPersonTrackingModel } from '../../runtime-activity.mjs';
import { startRuntimeServer } from '../../runtime-server.mjs';

test('人物卡按当前同版筛选全部近期事实，地点、换人、零值与无记录互不串读', () => {
  const snapshot={simulationId:'fixture',revision:7,tick:144,actors:[
    {actorId:'actor-1',name:'村长',occupation:'chief',location:'village',alive:true},
    {actorId:'actor-2',name:'猎人',occupation:'hunter',location:'village',alive:true},
    {actorId:'actor-3',name:'商人',occupation:'merchant',location:'village',alive:true},
    {actorId:'actor-4',name:'玩家',occupation:'player',location:'forest',alive:true},
  ]};
  const activity={simulationId:'fixture',revision:7,tick:144,entries:[
    {actorIds:['actor-2'],tick:24,status:'succeeded',location:'village'},
    {actorIds:['actor-2'],tick:72,status:'rejected',location:null},
    {actorIds:['actor-2'],tick:144,status:'no-action',location:'village'},
    {actorIds:['actor-2'],tick:144,status:'settled',location:'village'},
    {actorIds:['actor-2'],tick:144,status:'waiting-resolved',location:null},
  ]};
  const before=structuredClone({snapshot,activity});
  const all=buildPersonTrackingModel(snapshot,activity,'all');
  assert.equal(all.selected,false);
  assert.deepEqual(all.counts,{succeeded:0,rejected:0,'no-action':0,settled:0,'waiting-resolved':0});
  const hunter=buildPersonTrackingModel(snapshot,activity,'actor-2');
  assert.equal(hunter.actor.name,'猎人');
  assert.equal(hunter.latestFactTick,144);
  assert.deepEqual(hunter.counts,{succeeded:1,rejected:1,'no-action':1,settled:1,'waiting-resolved':1});
  assert.equal(hunter.entries.length,5,'unknown and non-village entries remain included regardless of location filter');
  assert.equal(buildPersonTrackingModel(snapshot,activity,'actor-3').latestFactTick,null,'zero activity is explicit');
  assert.equal(buildPersonTrackingModel(snapshot,activity,'actor-4').actor.location,'forest','switching selection reads only that person');
  assert.equal(buildPersonTrackingModel(snapshot,{...activity,revision:6},'actor-2'),null,'different revision is not mixed');
  assert.deepEqual({snapshot,activity},before,'render model reads but never mutates world or activity');
});

test('唯一真实owner样本：seed42创建、一次AdvanceTime到144并逐项核对活动API', { timeout:110000 }, async t => {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const runId=randomUUID();
  const runDirectory=path.join(root,'artifacts','d4e6-person-tracking-tests','run-'+runId);
  const worldDirectory=path.join(runDirectory,'world');
  await fs.mkdir(runDirectory,{recursive:false});
  const server=await startRuntimeServer({directory:worldDirectory,profile:'scene-survival-village',seed:42,
    port:0,writable:true,inspectMind:false,inspectActivity:true});
  t.after(()=>server.close());
  const command={version:3,commandId:'d4e6-'+runId.slice(0,18),expectedRevision:0,type:'AdvanceTime',payload:{ticks:144}};
  const response=await fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});
  const receipt=await response.json();
  assert.equal(response.status,200);
  assert.equal(receipt.status,'committed');
  const [snapshotResponse,activityResponse]=await Promise.all([
    fetch(server.url+'/api/runtime/snapshot'),fetch(server.url+'/api/runtime/activities'),
  ]);
  assert.equal(snapshotResponse.status,200);assert.equal(activityResponse.status,200);
  const [snapshot,activity]=await Promise.all([snapshotResponse.json(),activityResponse.json()]);
  assert.deepEqual([snapshot.simulationId,snapshot.revision,snapshot.tick],[activity.simulationId,activity.revision,activity.tick]);
  assert.equal(snapshot.tick,144);

  const commit=JSON.parse(await fs.readFile(path.join(worldDirectory,'service-commit-r144.json'),'utf8'));
  const source=commit.bundle.eventLog.find(event=>event.type==='SocietyDaySettled'&&event.tick===144);
  assert.ok(source,'the formal committed service file contains the actual daily event');
  const rows=source.payload.actors.rows;
  const daily=activity.entries.filter(entry=>entry.sourceEventSeq===source.eventSeq&&entry.kind==='daily-person'&&
    ['actor-1','actor-2','actor-3'].some(id=>entry.actorIds.includes(id)));
  assert.equal(daily.length,3,'all three named NPC daily rows, including zero consumption, are projected');
  for(const actorId of ['actor-1','actor-2','actor-3']){
    const row=rows.find(item=>item.actorId===actorId);
    const entry=daily.find(item=>item.actorIds.includes(actorId));
    assert.ok(row&&entry,actorId+' has both source row and projected fact');
    assert.equal(entry.status,'settled');
    assert.equal(entry.tick,source.tick);
    assert.deepEqual(entry.actorIds,[actorId]);
    assert.equal(entry.location,['village','forest'].includes(row.closing.location)?row.closing.location:null);
    assert.equal(entry.locationEvidence,entry.location===null?'unknown':'event-location');
    assert.ok(entry.summary.includes('消耗口粮'+row.food+'份、药材'+row.herbs+'份'));
    assert.ok(entry.summary.includes('休息减疲劳'+row.restReduction));
    for(const key of ['health','hunger','fatigue'])assert.ok(entry.summary.includes(row.opening[key]+'→'+row.closing[key]));
    if(entry.location)assert.ok(entry.summary.includes('日结收尾地点'+(entry.location==='village'?'村庄':'森林')));
  }
  await server.close();
  assert.equal(await fs.stat(path.join(worldDirectory,'.runtime-owner.lock')).then(()=>false,error=>error.code==='ENOENT'),true);
  t.diagnostic('isolated-world='+worldDirectory+';tick='+snapshot.tick+';npc-daily-rows='+daily.length+';');
});
