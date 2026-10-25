// Provider-only explanation of already restricted own state. No world, planner,
// conversation text, historical inference or executable proposal is accepted.
import {SURVIVAL_FOOD_NEED_INVENTORY} from '../core/survival-state.mjs';
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const bounded=n=>nat(n)&&n<=1000?n:null;
const actionName={WorkForPay:'工作领薪',BuyFood:'买粮',Rest:'休息',NoAction:'不行动',BuyMedicine:'买药',UseMedicine:'用药'};

export function npcLifeFacts(self,activity,tick){
 if(!activity)return null;
 const food=bounded(self.food),wallet=nat(self.wallet)?self.wallet:null,hunger=bounded(self.hunger);
 const foodNeed=typeof self.alive!=='boolean'||food===null?'unknown':!self.alive?'inactive':
  food<=SURVIVAL_FOOD_NEED_INVENTORY?'needed':'buffered';
 const current={tick,food,wallet,hunger,foodNeed};
 const currentMeaning=[food===null?'当前粮食数未知':`当前粮食${food}份`,wallet===null?'当前钱包未知':`当前钱包${wallet}`,
  hunger===null?'当前饥饿未知':`当前饥饿${hunger}`,
  foodNeed==='buffered'?'当前存粮高于补粮需求阈值，暂有余粮':foodNeed==='needed'?'当前存粮已达到补粮需求阈值，但不证明马上会购买':
  foodNeed==='inactive'?'本人已停止生活行动':'无法判断当前补粮需求'].join('；');
 const i=activity.intent,r=activity.lastResult,p=activity.plan;
 const status=!i?'unknown':i.phase==='stopped'?'stopped':i.redirect?'redirected':i.phase==='awaiting-review'?'awaiting-review':
  i.action==='NoAction'?'paused':'preparing';
 const meaning={unknown:'缺少当前准备记录，不猜测目的地或行动。',stopped:'本人行动已停止，不声称正在工作或买粮。',
  redirected:i?.redirect==='safety'?'当前因避开附近玩家而改道，原工作或买粮意图不是正在执行。':'当前因已知工具不可用而改回歇脚处，原工作或买粮意图不是正在执行。',
  'awaiting-review':'旧行进意图等待更新，不能说仍在照此准备或已经再次执行。',
  paused:'当前没有准备新的工作或购买；前往或抵达歇脚处也不证明做过新的购买。',
  preparing:`当前准备${actionName[i?.action]}，${i?.phase==='at-destination'?'已抵达目的地':'正在前往目的地'}；准备和抵达都不是实际完成。`}[status];
 const preparation={status,action:i?.action??null,meaning};
 const lastExecution=r?{...r,meaning:r.status==='no-action'?'最近结算没有行动，不是购买失败，也不是又去粮摊尝试。':
  r.status==='rejected'?`最近${actionName[r.action]}被拒绝，没有当次收入或买入；拒绝原因未提供。`:
  `最近${actionName[r.action]}成功；钱包变化${r.walletChange}、粮食变化${r.foodChange}仅是当次增减，不是当前库存或余额；现在剩多少只用current。`}:null;
 const planMeaning=p?`保存的${actionName[p.step]}后续步骤${p.status==='blocked'?'已阻塞，原因未提供':'为待办'}；不证明当前正在执行，也不证明失败或已经完成。`:null;
 return {current,currentMeaning,preparation,lastExecution,planMeaning,
  authority:'当前资源用current；当次增量不能当余量，曾买粮不保证现在还有。食物需求按本人存粮阈值判断，与饥饿数值不同；单凭当前需求不能推断暂停的完整原因或预测下一步。旧ready/blocked步骤不覆盖当前准备记录。旧回复和玩家口述不证明生活经历，冲突时纠正；不得从中补造后来去粮摊、预留应急钱、等新工作等原因。不知道原因就承认没有记录，不用“还没买成”暗示未记录的购买失败。这些说明不新增事实引用或动作权限。'};
}
