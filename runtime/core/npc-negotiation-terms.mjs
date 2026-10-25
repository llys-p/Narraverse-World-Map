// Shared calculation only: no state writes and no permission to execute a loan.
export function repairLoanTerms(condition,trust,requestedLoanTicks){
 return {repairAmount:Math.min(100-condition,condition<=60?40:20),loanTicks:Math.min(requestedLoanTicks,trust>=65?144:72)};
}

export function knownNegotiationOptions(self,agreement){
 const complete=['knownCondition','trust','fear','grievance'].every(k=>Number.isSafeInteger(self?.[k])&&self[k]>=0&&self[k]<=100);
 if(!complete||!['actor-2','actor-4','unknown'].includes(self?.knownHolder))return {status:'unknown',options:[]};
 let reason=null;
 if(['accepted','ready','borrowed'].includes(agreement?.status))reason='active-agreement';
 else if(self.knownHolder!=='actor-2')reason='tool-not-known-held';
 else if(self.knownCondition===100)reason='repair-not-needed';
 else if(self.fear>=20||self.grievance>=20)reason='relationship-refusal';
 if(reason)return {status:'unavailable',reason,options:[]};
 const options=[...new Map([36,72,144].map(n=>{const t=repairLoanTerms(self.knownCondition,self.trust,n);return [t.loanTicks,t];})).values()]
  .filter(t=>[20,40].includes(t.repairAmount));
 return {status:options.length?'available':'unknown',options};
}
