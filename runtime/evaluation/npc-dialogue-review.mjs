import {createHash} from 'node:crypto';
import {canonicalJson,cloneData,fields,requireCondition} from '../core/data-contract.mjs';
import {dialogueText,validModelReply} from '../../runtime-negotiation-contract.mjs';
import {auditDialogueFacts,summarizeFactAudits} from './npc-fact-audit.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=value=>sha(canonicalJson(value));
const id=s=>typeof s==='string'&&/^[a-z][a-z0-9-]{0,30}$/u.test(s);
const note=s=>typeof s==='string'&&s.length<=1000&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(s);
const assert=(ok,message)=>requireCondition(ok,message,'REVIEW_INVALID');

export function validateReviewReport(report){
 assert(report?.schemaVersion===1&&report.completed===true&&dialogueText(report.suiteId,80)&&Array.isArray(report.cases)&&report.cases.length>0&&report.cases.length<=16,'Completed dialogue report required');
 assert(Number.isSafeInteger(report.requestLimit)&&report.requestLimit>=0&&report.requestLimit<=32,'Invalid report request limit');
 assert(!Object.hasOwn(report,'reviewImport'),'Use the original report for another review');
 const cases=new Set();let count=0;
 for(const c of report.cases){
  assert(id(c.id)&&!cases.has(c.id)&&dialogueText(c.title,100)&&Array.isArray(c.turns)&&c.turns.length>0&&c.turns.length<=4,'Invalid report case');cases.add(c.id);
  const turns=new Set();
  for(const t of c.turns){
   assert(id(t.id)&&!turns.has(t.id)&&dialogueText(t.text)&&Array.isArray(t.checks)&&Array.isArray(t.preconditions),'Invalid report turn');turns.add(t.id);count++;
   assert(t.context===null||t.context&&typeof t.context==='object'&&!Array.isArray(t.context),'Invalid context');
   assert(t.response===null||validModelReply(t.response),'Invalid report reply');
   assert(Array.isArray(t.humanReview?.questions)&&t.humanReview.questions.length>0&&t.humanReview.questions.length<=4&&t.humanReview.questions.every(q=>dialogueText(q,300)),'Invalid review questions');
  }
 }
 assert(count<=32,'Too many report turns');return report;
}

function boundTurn(c,t){
 const immutable={caseId:c.id,turnId:t.id,playerText:t.text,reply:t.response?.reply??null,questions:cloneData(t.humanReview.questions)};
 return {...immutable,turnSha256:digest({...immutable,context:t.context,response:t.response,status:t.status})};
}

export function createReviewTemplate(report,reportBytes){
 validateReviewReport(report);
 return {schemaVersion:1,sourceReportSha256:sha(reportBytes),reviewer:{kind:'unassigned',label:''},
  turns:report.cases.flatMap(c=>c.turns.map(t=>({...boundTurn(c,t),verdict:'pending',notes:''})))};
}

export function attachDialogueReview(report,reportBytes,review,reviewBytes){
 validateReviewReport(report);fields(review,['schemaVersion','sourceReportSha256','reviewer','turns']);
 const template=createReviewTemplate(report,reportBytes);
 assert(review.schemaVersion===1&&review.sourceReportSha256===template.sourceReportSha256,'Review belongs to a different report');
 fields(review.reviewer,['kind','label']);
 assert(['assistant','human','unassigned'].includes(review.reviewer.kind)&&note(review.reviewer.label)&&review.reviewer.label.length<=80,'Invalid reviewer');
 assert(Array.isArray(review.turns)&&review.turns.length===template.turns.length,'Review must include every turn once');
 const expected=new Map(template.turns.map(t=>[JSON.stringify([t.caseId,t.turnId]),t])),seen=new Set(),records=new Map();
 for(const r of review.turns){
  fields(r,['caseId','turnId','playerText','reply','questions','turnSha256','verdict','notes']);
  const key=JSON.stringify([r.caseId,r.turnId]),original=expected.get(key);
  assert(original&&!seen.has(key),'Unknown or duplicate review turn');seen.add(key);
  const {verdict,notes,...immutable}=r,{verdict:ignored,notes:ignoredNotes,...originalImmutable}=original;
  assert(canonicalJson(immutable)===canonicalJson(originalImmutable),'Review turn binding changed');
  assert(['pending','pass','needs-correction'].includes(verdict)&&note(notes),'Invalid review conclusion');
  assert(r.reply!==null||verdict==='pending','An unrun turn cannot be reviewed as passed or failed');
  assert(verdict==='pending'||review.reviewer.kind!=='unassigned'&&dialogueText(review.reviewer.label,80),'Reviewed turns need a declared reviewer');
  records.set(key,{verdict,notes});
 }
 const out=cloneData(report),summary={eligibleReplies:0,passed:0,needsCorrection:0,pendingReplies:0,notRun:0};
 for(const c of out.cases)for(const t of c.turns){
  t.importedReview=cloneData(records.get(JSON.stringify([c.id,t.id])));
  if(!t.response){summary.notRun++;continue;}
  summary.eligibleReplies++;
  summary[t.importedReview.verdict==='pass'?'passed':t.importedReview.verdict==='needs-correction'?'needsCorrection':'pendingReplies']++;
 }
 const verdict=summary.needsCorrection?'needs-correction':summary.pendingReplies||!summary.eligibleReplies?'incomplete':summary.notRun?'partial-coverage-reviewed':'all-replies-reviewed';
 out.reviewImport={version:1,sourceReportSha256:sha(reportBytes),reviewSha256:sha(reviewBytes),reviewer:cloneData(review.reviewer),
  reviewerIdentityVerified:false,independentHumanVerdict:'not-verified',verdict,summary,
  notice:'评审者类型与姓名为填写者自报；没有验证身份、独立性或金标。原humanReview和semanticVerdict保留，不把助手结论算作独立人工验收。'};
 return out;
}

export function refreshDialogueFactAudits(report,reportBytes,algorithmSourceSha256){
 validateReviewReport(report);const out=cloneData(report);
 for(const c of out.cases)for(const t of c.turns)t.factAudit=t.response?auditDialogueFacts(t.response.reply,t.context):null;
 out.factAuditSummary=summarizeFactAudits(out.cases);
 out.factAuditImport={version:1,sourceReportSha256:sha(reportBytes),algorithmSourceSha256,
  notice:'只识别有限的当前存粮/钱包表述；未发现矛盾不等于事实正确，不检查暂停原因、经历承接或所有自然语言。'};
 return out;
}
