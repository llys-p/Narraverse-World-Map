import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyDialogueReportFiles} from '../runtime/evaluation/npc-report-files.mjs';
import {requireCondition} from '../runtime/core/data-contract.mjs';
export async function verifyDialogueReportCli(args,{log=console.log}={}){
 requireCondition(args.length===2&&args[0]==='--report'&&args[1]&&!args[1].startsWith('--'),'Usage: --report report.json');
 const fileIntegrity=await verifyDialogueReportFiles(path.resolve(args[1]));log(JSON.stringify({...fileIntegrity,externalModelCalls:0}));return {exitCode:0,fileIntegrity};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{process.exitCode=(await verifyDialogueReportCli(process.argv.slice(2))).exitCode;}
 catch(e){console.error(JSON.stringify({status:'blocked',code:e.code==='REPORT_UNVERIFIED'?e.code:'INVALID_INPUT'}));process.exitCode=2;}
}
