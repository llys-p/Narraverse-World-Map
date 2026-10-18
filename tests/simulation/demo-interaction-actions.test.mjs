import test from 'node:test';
import assert from 'node:assert/strict';
import {interactionActions} from '../../demo-runtime-interactions.mjs';
const group=()=>({map:{tick:0,order:null,actors:[{actorId:'actor-1',alive:true,canInteract:true},{actorId:'actor-2',alive:true,canInteract:true},{actorId:'actor-3',alive:true,canInteract:true}]},
 player:{self:{wallet:20,inventory:{food:20,herbs:0},fatigue:0,identity:{alive:true,location:'village'}},actions:{canTrade:true,work:{nextWorkTick:0},prices:{food:{buy:10,sell:5},herbs:{buy:12,sell:6}},maxQuantity:10}},
 encounter:{encounter:null},scene:{actors:[{actorId:'actor-2',gift:{available:true}}]}});
test('existing jobs, gift and merchant trade follow the real actor and committed projection',()=>{
 const g=group();const before=structuredClone(g);
 assert(interactionActions(g,true,'actor-1').work);assert(!interactionActions(g,true,'actor-3').work);
 assert(interactionActions(g,true,'actor-2').gift);assert(!interactionActions(g,true,'actor-1').gift);
 const merchant=interactionActions(g,true,'actor-3',2);assert(merchant.trade);assert(merchant.food.buy);assert(merchant.food.sell);assert(!merchant.herbs.buy);assert(!merchant.herbs.sell);
 assert.deepEqual(g,before);
});
test('distance, cooldown, battle, pending or invalid quantity cannot enable actions',()=>{
 const g=group();g.map.actors[2].canInteract=false;assert(!interactionActions(g,true,'actor-3').trade);
 g.player.actions.work.nextWorkTick=144;assert(!interactionActions(g,true,'actor-1').work);
 g.map.actors[2].canInteract=true;
 for(const q of [0,11,1.5,NaN,Infinity]){const a=interactionActions(g,true,'actor-3',q);assert(!a.food.buy&&!a.food.sell&&!a.herbs.buy&&!a.herbs.sell);}
 g.encounter.encounter={status:'active'};assert(!interactionActions(g,true,'actor-3').trade);assert(!interactionActions(g,true,'actor-1').work);assert(!interactionActions(g,true,'actor-2').gift);assert(!interactionActions(g,true,'actor-1').rest);
 assert(!interactionActions(group(),false,'actor-3').trade);
});
test('marching, dead or missing actors and bag rest expose only supported capabilities',()=>{
 const g=group();g.map.order={status:'marching'};
 for(const id of ['actor-1','actor-2','actor-3']){const a=interactionActions(g,true,id);assert(!a.work&&!a.gift&&!a.trade&&!a.rest);}
 g.map.order=null;g.map.actors[2].alive=false;assert(!interactionActions(g,true,'actor-3').trade);
 assert(!interactionActions(g,true,'unknown').trade);
 assert(interactionActions(g,true,null).rest);g.player.self.identity.alive=false;assert(!interactionActions(g,true,null).rest);
});
