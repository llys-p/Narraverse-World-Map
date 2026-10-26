// Provider-only explanation of already restricted own state. No world, planner,
// conversation text, historical inference or executable proposal is accepted.
import {SURVIVAL_FOOD_NEED_INVENTORY} from '../core/survival-state.mjs';
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const bounded=n=>nat(n)&&n<=1000?n:null;
const reasonMeaning={
 FOOD_INCOME:'该次选择工作，是为了获得买粮所需收入。',BUY_FOOD:'该次选择买粮，以补充存粮。',
 WAIT:'该次决策记录为等待，没有更具体的停购原因。',NO_FOOD_NEED:'该次决策时未达到补粮需求，不表示此刻存粮仍相同。',
 WALLET_INSUFFICIENT:'该次决策时可知钱包不足，不表示此刻钱包仍不足。',
 FOOD_QUOTE_MISSING:'该次决策时缺少可知粮价。',FOOD_QUOTE_EXPIRED:'该次决策时已知粮价已过期。',
 FOOD_UNAVAILABLE:'该次决策时可知条件不支持买粮，不推断实际公共库存。',
 DUTY_UNAVAILABLE:'该次决策时没有可用的已知工作请求，不预测未来有无新工作。',
 DUTY:'该次选择履行已知工作请求。',RECOVER_HEALTH:'该次选择恢复健康。',
 FATIGUE_RELIEF:'该次选择休息缓解疲劳。',EMERGENCY_FATIGUE:'该次因疲劳较高优先休息。',
 HEALTH_TOO_LOW_FOR_WORK:'该次决策时健康不足以工作。',FATIGUE_TOO_HIGH_FOR_WORK:'该次决策时疲劳过高，不能工作。',
 NO_HEALTH_GOAL:'该次决策时没有恢复健康目标。',PRIVATE_MEDICINE_MISSING:'该次决策时本人缺少药物。',
 HEALTH_ALREADY_FULL:'该次决策时健康已满。',PRIVATE_MEDICINE_PRESENT:'该次决策时已有药物。',
 SUPPLY_UNKNOWN:'该次决策时药物供应未知。',SUPPLY_UNAVAILABLE:'该次决策时已知药物供应不可用。',
 SUPPLY_CONFIDENCE_LOW:'该次决策时药物供应消息不足以采用。',CAPACITY_UNAVAILABLE:'该次决策时容量不足。',
 FATIGUE_BELOW_REST_THRESHOLD:'该次决策时未达到休息需求。'
};
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
 const b=activity.decisionBasis;
 const decisionBasis=b?{...b,meaning:reasonMeaning[b.reasonCode]??'该次决策的具体原因未提供。',
  relationToPreparation:i&&!i.redirect&&i.phase==='awaiting-review'&&i.action===b.action&&i.decidedTick<=b.tick?'same-record':'historical',
  authority:'只解释该tick已保存决策的有限理由，不证明当前准备的完整原因、未来机会或执行拒绝原因；WAIT仅记录等待，不说明为何未购买。'}:null;
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
 return {current,currentMeaning,preparation,lastExecution,planMeaning,decisionBasis,
  authority:'当前资源用current；当次增量不能当余量，曾买粮不保证现在还有。食物需求按本人存粮阈值判断，与饥饿数值不同；单凭当前需求不能推断暂停的完整原因或预测下一步。旧ready/blocked步骤不覆盖当前准备记录。旧回复和玩家口述不证明生活经历，冲突时纠正；不得从中补造后来去粮摊、预留应急钱、等新工作等原因。不知道原因就承认没有记录，不用“还没买成”暗示未记录的购买失败。这些说明不新增事实引用或动作权限。'};
}
