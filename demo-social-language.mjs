// A bounded command composer, not a model or a source of NPC/world facts.
import {validSocialPayload} from './runtime-social-contract.mjs';
export const LANGUAGE_VERSION='npc-language-v1';
export const MAX_SOCIAL_TEXT=240;
const TOOL='(?:(?:你的|猎人的|这个|这件|那件)?(?:工具包|工具))';
const PRONOUN='(?:它|这东西|那个东西)';
const OBJECT=`(?:${TOOL}|${PRONOUN})`;
const SELF='(?:我(?:想要|想|要|来|准备)?)?';
const verbRepair='(?:修理|修好|修)';
const term='(?:用)?(?:一天|一会儿|一下)?(?:吗|吧)?';
const rules=[];
function rule(id,intent,source){rules.push({id,intent,pattern:new RegExp('^(?:'+source+')$','u')});}
rule('needs','talk:needs','(?:你)?(?:最近|现在)?(?:过得怎么样|怎么样|缺什么|需要什么|饿吗)|口粮够吗|最近好吗|有什么需要帮忙的吗');
rule('past','talk:past',`我们之前发生过什么|我们有什么共同经历|说说以前的事|(?:你)?(?:还)?记得(?:我|我们|上次的事|之前的事|我之前帮过你|我给过你粮)吗|你知道谁偷了${TOOL}吗`);
rule('relationship','talk:relationship',`你(?:还)?信任我吗|你信得过我吗|你为什么(?:怕我|躲着我)|我们关系怎么样|你对我有什么看法|为什么不肯借${TOOL}给我`);
rule('repair-verb','help',`${SELF}(?:帮你|替你)?${verbRepair}(?:一下)?${OBJECT}`);
rule('repair-object','help',`${SELF}(?:帮你|替你)?把${OBJECT}${verbRepair}(?:一下)?`);
rule('borrow-object','ask-help',`(?:能|可以|能不能|可不可以|愿意)?(?:把)?${OBJECT}(?:借给我|借我)${term}`);
rule('borrow-verb','ask-help',`${SELF}(?:可以|能|能不能)?(?:借用|借)(?:一下)?${OBJECT}${term}`);
rule('borrow-recipient','ask-help',`(?:请|能|可以)?(?:借给我|借我)${OBJECT}${term}`);
rule('return-object','return',`${SELF}(?:把)?${OBJECT}(?:还给你|还你|归还给你)`);
rule('return-verb','return',`${SELF}(?:归还|还)(?:一下)?${OBJECT}(?:给你)?`);
rule('apology','apologize',`${SELF}(?:向你|跟你)?(?:道歉|说声对不起)|(?:上次的事|之前的事|刚才的事)?(?:对不起|抱歉|对不住|是我不对)`);
rule('theft-explicit','steal',`${SELF}(?:偷偷)?(?:偷走|偷|顺走)${OBJECT}`);
rule('theft-unnoticed','steal',`${SELF}(?:偷偷|趁你不注意|趁猎人不注意)(?:拿走|偷走|顺走)${OBJECT}`);
rule('robbery-verb','rob',`${SELF}(?:抢走|抢夺|抢)${OBJECT}`);
rule('robbery-object','rob',`${SELF}把${OBJECT}(?:抢走|抢过来)`);
rule('damage-verb','smash',`${SELF}(?:砸坏|砸烂|砸碎|砸)(?:一下)?${OBJECT}`);
rule('damage-object','smash',`${SELF}把${OBJECT}(?:砸坏|砸烂|砸碎)`);
rule('threat-direct','threaten',`${SELF}(?:威胁|恐吓)(?:你|猎人)|你给我小心点`);
// Only direct coercion is recognized. A threatened future act is not performed.
rule('threat-condition','threaten',`(?:你)?(?:不交出${TOOL}|不交${TOOL}|不把${TOOL}给我)[,，]?(?:我)?就(?:揍你|打你|砸坏${TOOL})`);
rule('threat-consequence','threaten',`把${TOOL}交出来[,，]?(?:否则|不然)(?:我)?就(?:揍你|打你|砸坏${TOOL})`);
export function intentKey(payload){return payload.action+(payload.action==='talk'?':'+payload.topic:'');}
function payload(key){const [action,topic]=key.split(':');const value={targetId:'actor-2',action,...(topic?{topic}:{})};
 if(!validSocialPayload(value))throw Error('Invalid language rule');return value;}
const unique=keys=>[...new Set(keys)];
const messages={empty:'写下想说的话或想做的事。',invalid:'请输入240字以内的普通文字，不使用不可见控制字符。',
 unsupported:'暂时不能完整理解这句话。请一次说明一个动作、对象或话题，也可以使用下方按钮。',
 clarify:'请选出这次想表达的一个意思。',reference:'“它”还没有明确所指。若你指的是猎人的工具包，请选择下面的动作。',
 ready:'请查看对应动作；点击后才会执行，猎人仍可能拒绝。'};
function result(status,keys=[],ids=[],reason=status,usesContext=false){return {version:LANGUAGE_VERSION,status,
 candidates:unique(keys).map(payload),ruleIds:unique(ids),reason,message:messages[reason]??messages[status],usesContext};}
const clean=s=>s.replace(/[。.!?！？]+$/u,'').replace(/^(?:猎人|你好)[,，]/u,'').replace(/^先/u,'');
const forbidden=/[“”"'「」『』<>\[\]{}]|(?:他说|她说|别人说|村长说|商人说|听说|据说|假如|假设|如果|明天|昨天|已经|以前|别|不要|不会|不想|不愿|不是|才帮|忽略规则)/u;
function matches(s){return rules.filter(r=>r.pattern.test(s));}

export function interpretSocialText(input,context=null){
 if(typeof input!=='string'||input.length>MAX_SOCIAL_TEXT||/[\p{Cf}\p{Cs}]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input))return result('invalid');
 if(!input.trim())return result('empty');
 const text=clean(input.normalize('NFKC').trim().replace(/[ \t]+/gu,'').replace(/\r?\n/gu,'；'));
 if(!text)return result('empty');
 // Preserve quotes/negation. Full supported questions/coercion are tried before
 // fallback guards; action regexes have no unbounded wildcard or keyword trigger.
 const found=matches(text);
 if(found.length){
  const keys=unique(found.map(r=>r.intent)),pronoun=/(?:它|这东西|那个东西)/u.test(text);
  if(pronoun&&!context?.tool)return result('clarify',keys,found.map(r=>r.id),'reference');
  return result(keys.length===1?'ready':'clarify',keys,found.map(r=>r.id),keys.length===1?'ready':'clarify',pronoun);
 }
 if(forbidden.test(text)||/^我不/u.test(text))return result('unsupported');
 if(/^(?:那)?为什么$/u.test(text))return context?.confirmed?result('ready',['talk:relationship'],['followup-why'],'ready',true):
  result('clarify',['talk:needs','talk:past','talk:relationship'],['followup-unknown']);
 if(new RegExp(`^${SELF}(?:把)?${OBJECT}拿走$|^${SELF}拿走${OBJECT}$`,'u').test(text))return result('clarify',['ask-help','steal','rob'],['ambiguous-taking']);
 if(/^(?:我想帮你|我能帮你吗)$/u.test(text))return result('clarify',['talk:needs','help'],['ambiguous-offer']);
 if(/^(?:帮我一下|帮帮我)$/u.test(text))return result('clarify',['ask-help','talk:needs'],['ambiguous-request']);
 const clauses=text.split(/(?:[,，;；。！？!?]|然后|接着|同时|或者|还是|而且)+/gu).map(clean);
 if(clauses.length>1&&clauses.length<=4&&clauses.every(s=>s.length>0)){
  const parts=clauses.map(matches);
  // Do not discard an unknown clause, even when another clause is supported.
  if(parts.every(rs=>rs.length>0))return result('clarify',parts.flat().map(r=>r.intent),['multiple-intents']);
 }
 return result('unsupported');
}
