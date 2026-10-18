import test from 'node:test';
import assert from 'node:assert/strict';
import {personNavigation} from '../../demo-runtime-interactions.mjs';
const group=()=>({map:{actors:[{actorId:'actor-3',alive:true,x:7,y:8,canInteract:false}],budget:{remainingCommands:10}},player:{self:{identity:{alive:true}}},encounter:{encounter:null}});
test('navigation uses only the current visible projection and returns detached coordinates',()=>{
 const g=group(),before=structuredClone(g),view=personNavigation(g,true,'actor-3');
 assert(view.visible);assert(view.canApproach);assert.deepEqual(view.target,{x:7,y:8});view.target.x=99;assert.deepEqual(g,before);
 g.map.actors[0].x=8;assert.deepEqual(personNavigation(g,true,'actor-3').target,{x:8,y:8});
 g.map.actors=[];assert.deepEqual(personNavigation(g,true,'actor-3'),{visible:false,canApproach:false,target:null});
});
test('dead, nearby, pending, active combat, invalid cells and reserved budget disable approach',()=>{
 const g=group();assert(!personNavigation(g,false,'actor-3').canApproach);
 g.map.actors[0].canInteract=true;assert(!personNavigation(g,true,'actor-3').canApproach);g.map.actors[0].canInteract=false;
 g.map.budget.remainingCommands=2;assert(!personNavigation(g,true,'actor-3').canApproach);g.map.budget.remainingCommands=10;
 g.encounter.encounter={status:'active'};assert(!personNavigation(g,true,'actor-3').canApproach);g.encounter.encounter=null;
 g.map.actors[0].alive=false;assert(!personNavigation(g,true,'actor-3').canApproach);g.map.actors[0].alive=true;
 g.player.self.identity.alive=false;assert(!personNavigation(g,true,'actor-3').canApproach);g.player.self.identity.alive=true;
 for(const value of [-1,20,NaN,0.5]){g.map.actors[0].x=value;assert(!personNavigation(g,true,'actor-3').canApproach);}
});
