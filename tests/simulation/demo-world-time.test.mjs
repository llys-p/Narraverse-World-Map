import test from 'node:test';
import assert from 'node:assert/strict';
import {worldTimeView} from '../../demo-runtime-interactions.mjs';
const group=()=>({map:{tick:36,order:null},encounter:{encounter:null},player:{self:{health:1000,fatigue:150,identity:{alive:true,location:'village'}},actions:{work:{nextWorkTick:144}}}});
test('world time and work cooldown are derived from committed ticks only',()=>{
 const g=group(),before=structuredClone(g);let view=worldTimeView(g,true);
 assert.equal(view.clockText,'第 0 天 06:00');assert(view.canWait);assert(!view.workReady);assert.match(view.workHint,/18小时/);
 g.map.tick=42;assert.match(worldTimeView(g,true).workHint,/17小时/);
 g.map.tick=144;view=worldTimeView(g,true);assert.equal(view.clockText,'第 1 天 00:00');assert(view.workReady);
 g.map.tick=151;assert.equal(worldTimeView(g,true).clockText,'第 1 天 01:10');
 assert.equal(before.map.tick,36);
});
test('waiting is disabled during a march, combat, unresolved write or death; work keeps its health threshold',()=>{
 const g=group();assert(!worldTimeView(g,false).canWait);
 g.map.order={status:'marching'};assert(!worldTimeView(g,true).canWait);g.map.order=null;
 g.encounter.encounter={status:'active'};assert(!worldTimeView(g,true).canWait);g.encounter.encounter=null;
 g.player.self.identity.alive=false;assert(!worldTimeView(g,true).canWait);g.player.self.identity.alive=true;
 g.map.tick=144;g.player.self.health=299;assert(!worldTimeView(g,true).workReady);assert.match(worldTimeView(g,true).workHint,/生命/);
 g.player.self.health=300;assert(worldTimeView(g,true).workReady);
 g.player.self.fatigue=701;assert(!worldTimeView(g,true).workReady);
 g.player.self.fatigue=700;assert(worldTimeView(g,true).workReady);
});
