// Deliberately limited assessment, never a Provider validator or semantic score.
const nat=n=>Number.isSafeInteger(n)&&n>=0;
const food='(?:粮食|口粮|存粮|余粮|食物|粮)';
const now='(?:现在|目前|眼下|此刻|如今|这会儿)';
const prefix=`(?:我)?${now}?(?:的)?`;
const qualifiers='(?:还|就|只|也|已经|仍然|仍|都)*';
const number='(?:0|[1-9][0-9]{0,8}|[零〇一二两三四五六七八九十百千]{1,12})';
const ending='(?:了|而已)?';
const foodPatterns=[
 new RegExp(`^${prefix}${food}${qualifiers}(?:剩下|剩|还有|有|是|为)(${number})(?:份)?(?:${food})?${ending}$`,'u'),
 new RegExp(`^${prefix}${qualifiers}(?:剩下|剩|有)(${number})份${food}${ending}$`,'u')];
const foodZero=new RegExp(`^${prefix}(?:${food}(?:已经|也|都)?(?:空了|没了|没有了)|(?:没有|没剩|不剩)(?:任何|一份)?${food}(?:了)?|(?:一份|一粒)${food}(?:也|都)?(?:没有|不剩)(?:了)?)$`,'u');
const moneyPatterns=[
 new RegExp(`^${prefix}(?:钱包里|钱包|兜里|钱袋里|手头的钱|钱)${qualifiers}(?:剩下|剩|还有|有|是|为)(${number})(?:枚金币|金币|块钱|块|钱|枚)?${ending}$`,'u'),
 new RegExp(`^${prefix}${qualifiers}(?:剩下|剩|有)(${number})(?:枚金币|金币|块钱|块)${ending}$`,'u')];
const deictic=new RegExp(`^${prefix}${qualifiers}(?:剩下|剩|有)(?:这)?(一|1)份${ending}$`,'u');

function quantity(text){
 if(/^(?:0|[1-9][0-9]{0,8})$/u.test(text))return Number(text);
 if(/[百千][一二两三四五六七八九]$/u.test(text))return null; // Ambiguous shorthand such as 一百二.
 const digits={零:0,〇:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};
 if(Object.hasOwn(digits,text))return digits[text];
 let total=0,digit=null,lastUnit=10000;
 for(const c of text){
  if(Object.hasOwn(digits,c)){
   if(digit!==null&&digit!==0)return null;
   digit=digits[c];
  }else{
   const unit=({十:10,百:100,千:1000})[c];
   if(!unit||unit>=lastUnit||digit===0||digit===null&&unit!==10)return null;
   total+=(digit??1)*unit;digit=null;lastUnit=unit;
  }
 }
 return total+(digit??0);
}

// Mask every quoted code unit, including an unterminated quote; preserve offsets.
function unquoted(text){
 const pairs={'“':'”','‘':'’','「':'」','『':'』','"':'"',"'":"'"},stack=[],out=[];
 for(const c of text){
  if(stack.length&&c===stack.at(-1)){stack.pop();out.push(' '.repeat(c.length));}
  else if(Object.hasOwn(pairs,c)){stack.push(pairs[c]);out.push(' '.repeat(c.length));}
  else out.push(stack.length?' '.repeat(c.length):c);
 }
 return out.join('');
}

export function auditDialogueFacts(reply,context){
 const result={version:1,scope:'explicit-current-food-wallet',status:'unassessed',claims:[],checkedClaims:0,unknownClaims:0};
 if(typeof reply!=='string'||reply.length>960)return result;
 const actual={food:nat(context?.self?.food)?context.self.food:null,wallet:nat(context?.self?.wallet)?context.self.wallet:null};
 const masked=unquoted(reply);
 for(const sentence of masked.matchAll(/[^。！？!?\n]+[。！？!?]?/gu)){
  if(/[？?]$/u.test(sentence[0])||/(?:吗|么|对不对|对吧)[。！!]?$/u.test(sentence[0])||
   /(?:不对|说错|更正|改口|准确地说|其实|实际上|并不是|[我你他她]说|听说|据说|有人说|玩家说|以前|先前|刚才|那时|当时|昨天|前天|之前|过去|曾经|原先|假如|如果|要是|倘若|明天|将来|到时候)/u.test(sentence[0]))continue;
  let previous='';
  for(const clause of sentence[0].replace(/[。！!]$/u,'').matchAll(/[^，,；;]+/gu)){
   const text=clause[0].trim();let field=null,stated=null;
   for(const [key,patterns] of [['food',foodPatterns],['wallet',moneyPatterns]]){
    const m=patterns.map(p=>p.exec(text)).find(Boolean);
    if(m){const n=quantity(m[1]);if(n!==null){field=key;stated=n;break;}}
   }
   if(!field&&foodZero.test(text)){field='food';stated=0;}
   if(!field&&new RegExp(`${food}$`,'u').test(previous)&&new RegExp(now,'u').test(text)&&deictic.test(text)){field='food';stated=1;}
   if(field){
    const start=sentence.index+clause.index+clause[0].indexOf(text),value=actual[field];
    const verdict=value===null?'unknown-context':stated===value?'consistent':'contradiction';
    result.claims.push({field,stated,actual:value,verdict,start,end:start+text.length,text:reply.slice(start,start+text.length)});
   }
   previous=text;
  }
 }
 result.checkedClaims=result.claims.filter(c=>c.verdict!=='unknown-context').length;
 result.unknownClaims=result.claims.length-result.checkedClaims;
 result.status=result.claims.some(c=>c.verdict==='contradiction')?'contradiction-detected':
  result.checkedClaims>0&&result.unknownClaims===0?'checked-no-contradiction':'unassessed';
 return result;
}

export function summarizeFactAudits(cases){
 const turns=cases.flatMap(c=>c.turns);
 return {scope:'explicit-current-food-wallet',turnsWithReplies:turns.filter(t=>t.response).length,
  contradictionTurns:turns.filter(t=>t.factAudit?.status==='contradiction-detected').length,
  checkedNoContradictionTurns:turns.filter(t=>t.factAudit?.status==='checked-no-contradiction').length,
  unassessedTurns:turns.filter(t=>t.response&&t.factAudit?.status!=='contradiction-detected'&&t.factAudit?.status!=='checked-no-contradiction').length,
  notEvaluatedTurns:turns.filter(t=>!t.response).length};
}
