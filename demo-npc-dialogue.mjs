import {dialogueText,validNegotiationPayload} from './runtime-negotiation-contract.mjs';
import {validateCampaignReceipt} from './runtime-campaign-contract.mjs';
import {socialInteractionActions} from './demo-runtime-interactions.mjs';
import {socialIntentLabel} from './demo-social-composer.mjs';

export const proposalLabel=p=>!p?'':p.type==='PlayerNegotiate'?`提议：实际修理${p.payload.terms.repairAmount}点，换借${p.payload.terms.loanTicks/6}小时`:socialIntentLabel(p.payload);
const frame=g=>({simulationId:g.snapshot.simulationId,revision:g.snapshot.revision});
const same=(f,g,id)=>!!f&&id==='actor-2'&&f.simulationId===g?.snapshot.simulationId&&f.revision===g?.snapshot.revision;
const errors={MODEL_UNAVAILABLE:'语言模型尚未启用或暂不可用。',MODEL_BUSY:'正在生成另一段对话，请稍后重试。',MODEL_BUDGET:'本次运行已达到模型请求上限。',MODEL_TIMEOUT:'生成超时，没有保存交谈。',MODEL_OUTPUT_INVALID:'回复格式或记忆引用不正确，没有保存交谈。',REVISION_CONFLICT:'世界已变化，请按当前状态重新生成。'};

// Generation is read-only. Committing speech and accepting its action proposal
// are separate explicit steps through the existing durable command client.
export function createNpcDialogue({fetchImpl=(...args)=>fetch(...args),newId=()=>crypto.randomUUID()}={}){
 let text='',draft=null,offered=null,request=null,status='idle',message='',epoch=0,controller=null,current=null;
 const invalidate=()=>{epoch++;controller?.abort();controller=null;draft=null;offered=null;request=null;};
 function reset(){invalidate();text='';status='idle';message='';current=null;}
 function observe(group,id){
  if(id!=='actor-2'||!group?.map.negotiation||current&&current.simulationId!==group.snapshot.simulationId){reset();return;}
  if(current&&!same(current,group,id)){invalidate();status=text?'stale':'idle';message=text?'世界状态已变化，请重新生成。':'';}
  current=frame(group);
 }
 function edit(value,group,id){observe(group,id);invalidate();text=value;status='idle';message='';}
 function view(group,writable,id){
  const enabled=group?.capabilities.npcLanguage?.enabled===true,talk=!!(writable&&id==='actor-2'&&group?.map.negotiation?.canTalk);
  const validDraft=same(draft,group,id),p=same(offered,group,id)?offered.proposal:null;
  const permitted=p&&(p.type==='PlayerNegotiate'?group.map.negotiation.canPropose:socialInteractionActions(group,writable)[p.payload.action]);
  return {text,status,message:!enabled?'自然对话未启用，可继续使用下方的协商和互动。':text&&!dialogueText(text)?'请用240字以内的一段话，暂不支持换行或隐藏字符。':message||'先生成预览，再确认交谈；行动建议需另外确认。',
   generateLabel:status==='error'&&request?'重取本次结果':['preview','error'].includes(status)?'重新生成预览':'生成对话预览',
   canGenerate:enabled&&talk&&dialogueText(text)&&status!=='generating',canCommit:talk&&validDraft,
   reply:validDraft?draft.payload.reply:'',proposal:p,proposalLabel:proposalLabel(p),canAct:!!(talk&&permitted)};
 }
 async function generate(group,writable,id){
  observe(group,id);if(!view(group,writable,id).canGenerate)throw Error('请先靠近猎人、停止活动并输入240字以内的一段话。');
  draft=null;offered=null;status='generating';message='正在生成预览，尚未保存交谈。';const ticket=++epoch;
  request??={apiVersion:1,requestId:newId(),simulationId:group.snapshot.simulationId,expectedRevision:group.snapshot.revision,targetId:'actor-2',text};
  const body=structuredClone(request),abort=new AbortController();controller=abort;
  try{
   const response=await fetchImpl('/api/runtime/demo-npc-compose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:abort.signal});
   const value=await response.json();if(ticket!==epoch)return;
   if(!response.ok){
    const code=value?.error?.code;
    // A known terminal result is cached by the provider. A new explicit click
    // may start another attempt; an uncertain transport result must retain ID.
    if(['MODEL_OUTPUT_INVALID','MODEL_TIMEOUT','MODEL_UNAVAILABLE'].includes(code))request=null;
    throw Error((errors[code]??'生成结果尚未确认，没有保存交谈。')+(request?'可重取本次结果。':'再次生成会发起新请求。'));
   }
   if(!value||Object.keys(value).sort().join(',')!=='apiVersion,payload,requestId,revision,simulationId,type'||value.apiVersion!==1||value.type!=='PlayerDialogue'||
    value.simulationId!==body.simulationId||value.revision!==body.expectedRevision||value.requestId!==body.requestId||
    !validNegotiationPayload(value.type,value.payload)||value.payload.utterance!==body.text)throw Error('对话预览校验失败，没有保存。');
   request=null;draft=value;status='preview';message='以下是尚未保存的对话预览。确认交谈后，才会成为双方说过的话。再次生成会发起新请求。';
  }catch(error){if(ticket===epoch){status='error';message=error.message;}}
  finally{if(ticket===epoch)controller=null;}
 }
 function command(group,writable,id){if(!view(group,writable,id).canCommit)throw Error('对话预览已失效，请重新生成。');return structuredClone(draft.payload);}
 function proposal(group,writable,id){const state=view(group,writable,id);if(!state.canAct)throw Error('建议已失效或当前无法执行。');return structuredClone(state.proposal);}
 function confirmed(receipt,dto,group){
  invalidate();current=group?.snapshot?frame(group):null;status='idle';message='';
  if(dto.type==='PlayerDialogue'&&receipt.outcome==='succeeded'&&validateCampaignReceipt(receipt,dto,receipt.fromTick)&&group.snapshot.revision===receipt.toRevision){
   text='';status='committed';message='交谈已保存。行动建议尚未执行。';offered={...frame(group),proposal:dto.payload.proposal};
  }
 }
 return Object.freeze({reset,observe,edit,view,generate,command,proposal,confirmed});
}
