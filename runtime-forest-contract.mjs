// Shared bounded forest actions. Ordinary inventories and the village economy are unchanged.
export const FOREST_COMMAND='PlayerForest';
export const FOREST_ACTIONS=Object.freeze(['collect','camp','observe','avoid']);
export const FOREST_TRAILS=Object.freeze(['unseen','observed','avoided','engaged','resolved']);
export const FOREST_REASONS=Object.freeze(['RULE_REJECTED','PLAYER_DEAD','ENCOUNTER_BUSY','NOT_COLOCATED','NOT_HELD','ASSET_UNAVAILABLE','FOREST_DEPLETED','NO_FIREWOOD','NOT_TIRED']);
export const forestDuration=action=>({collect:3,camp:3,observe:1,avoid:0})[action];
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const nat=n=>Number.isSafeInteger(n)&&n>=0;
export const validForestPayload=p=>exact(p,['action'])&&FOREST_ACTIONS.includes(p.action);
export function validForestState(s){return exact(s,['branchesRemaining','firewood','harvested','campfires','trail'])&&
 ['branchesRemaining','firewood','harvested','campfires'].every(k=>nat(s[k])&&s[k]<=3)&&s.branchesRemaining+s.harvested===3&&s.firewood+s.campfires===s.harvested&&FOREST_TRAILS.includes(s.trail);}
const validEffect=s=>exact(s,['fatigue','condition','forest'])&&nat(s.fatigue)&&s.fatigue<=1000&&nat(s.condition)&&s.condition<=100&&validForestState(s.forest);
export function validForestResult(r,p){
 if(!validForestPayload(p)||!exact(r,['action','before','after'])||r.action!==p.action||!validEffect(r.before)||!validEffect(r.after))return false;
 const {before:b,after:a}=r,expected=structuredClone(b);
 if(p.action==='collect'){if(b.condition<40||b.forest.branchesRemaining===0||b.fatigue>900)return false;expected.condition-=10;expected.fatigue+=25;expected.forest.branchesRemaining--;expected.forest.harvested++;expected.forest.firewood++;}
 if(p.action==='camp'){if(!b.forest.firewood||!b.fatigue)return false;expected.forest.firewood--;expected.forest.campfires++;expected.fatigue=Math.max(0,b.fatigue-200);}
 if(p.action==='observe')expected.forest.trail='observed';
 if(p.action==='avoid')expected.forest.trail='avoided';
 return a.fatigue===expected.fatigue&&a.condition===expected.condition&&Object.keys(expected.forest).every(k=>a.forest[k]===expected.forest[k]);
}
export function validForestView(v){return v===null||exact(v,['version','site','state','actions'])&&v.version===1&&exact(v.site,['x','y'])&&v.site.x===16&&v.site.y===7&&validForestState(v.state)&&
 Array.isArray(v.actions)&&v.actions.length===FOREST_ACTIONS.length&&v.actions.every((a,i)=>exact(a,['action','available','reasonCode'])&&a.action===FOREST_ACTIONS[i]&&typeof a.available==='boolean'&&(a.available?a.reasonCode===null:FOREST_REASONS.includes(a.reasonCode)));}
