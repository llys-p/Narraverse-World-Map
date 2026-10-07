import { requireCondition, fault } from '../core/data-contract.mjs';
// A bounded lexical walk rejects duplicate decoded keys before JSON.parse can erase them.
export function parseStrictJson(bytes,maximum){
  requireCondition(Buffer.isBuffer(bytes),'Expected UTF8 bytes');
  requireCondition(bytes.length<=maximum,'JSON exceeds budget','LIMIT_EXCEEDED');
  try{
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);let i=0;
    const space=()=>{while(/[\x20\t\r\n]/.test(text[i]??'!'))i++;};
    const string=()=>{const start=i++;requireCondition(text[start]==='"','Expected string');
      while(i<text.length){const c=text[i++];if(c==='"')return JSON.parse(text.slice(start,i));if(c==='\\')i++;}
      throw fault('INVALID_INPUT','Unterminated JSON string');};
    const value=depth=>{
      requireCondition(depth<=64,'JSON nesting exceeds budget','LIMIT_EXCEEDED');space();
      if(text[i]==='{'){
        i++;space();const keys=new Set();if(text[i]==='}'){i++;return;}
        while(true){space();const key=string();requireCondition(!keys.has(key),'Duplicate JSON key');keys.add(key);
          space();requireCondition(text[i++]===':','Expected colon');value(depth+1);space();const end=text[i++];
          if(end==='}')return;requireCondition(end===',','Expected object separator');}
      }
      if(text[i]==='['){i++;space();if(text[i]===']'){i++;return;}
        while(true){value(depth+1);space();const end=text[i++];if(end===']')return;requireCondition(end===',','Expected array separator');}}
      if(text[i]==='"'){string();return;}
      const start=i;while(i<text.length && !/[\x20\t\r\n,\]}]/.test(text[i]))i++;
      requireCondition(i>start,'Expected JSON value');
    };
    value(0);space();requireCondition(i===text.length,'Unexpected trailing JSON');return JSON.parse(text);
  }catch(cause){if(cause.code==='LIMIT_EXCEEDED')throw cause;throw Object.assign(fault('INVALID_INPUT','Invalid JSON data'),{cause});}
}
