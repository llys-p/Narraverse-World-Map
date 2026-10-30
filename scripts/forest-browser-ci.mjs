import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const mode=process.argv[2],out=path.resolve(process.argv[3]??'artifacts/forest-browser-ci');
if(mode==='select'){
 if(process.env.GITHUB_ACTIONS!=='true'||!process.env.GITHUB_ENV)throw Error('Browser selection is for a GitHub Actions runner only');
 const candidates=process.platform==='win32'?[
  'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'
 ]:['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'];
 let selected;for(const file of candidates)try{await fs.access(file);selected=file;break;}catch{}
 if(!selected)throw Error('No preinstalled browser was found on this runner');
 await fs.appendFile(process.env.GITHUB_ENV,'DEMO_BROWSER_EXECUTABLE='+selected+'\n');
 console.log(JSON.stringify({browserSelected:true,platform:process.platform,executable:selected}));
}else if(mode==='report'){
 let result;try{result=JSON.parse(await fs.readFile(path.join(out,'result.json'),'utf8'));}catch{result={verdict:'MISSING',error:{message:'Acceptance did not produce result.json'}};}
 const sources=['.github/workflows/forest-browser-acceptance.yml','scripts/demo-browser-client.mjs','scripts/verify-forest-playtest.mjs','scripts/forest-playtest-candidate.mjs','scripts/forest-browser-ci.mjs'],sourceSha256={};
 for(const file of sources)sourceSha256[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
 const candidate=JSON.parse(await fs.readFile('docs/runtime/forest-playtest-candidate.json','utf8'));
 // Text evidence only: no screenshot bytes, world saves, artifact upload or cache.
 const report={schemaVersion:1,platform:process.platform,head:process.env.FOREST_TEST_HEAD??null,runId:process.env.GITHUB_RUN_ID??null,sourceSha256,gameSha256:candidate.gameSha256,result};
 console.log('FOREST_BROWSER_CI_REPORT '+JSON.stringify(report));
}else throw Error('Use select or report');
