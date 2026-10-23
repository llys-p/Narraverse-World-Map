import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeOwner } from './runtime/service/runtime-owner.mjs';
import { MAX_COMMAND_BYTES,MAX_SERVICE_ADVANCE_TICKS,parseCommandBytes,parseSceneCommandBytes,validateSceneCommandDto } from './runtime/service/http-contract.mjs';
import { MAX_PENDING_REQUESTS } from './runtime/service/service-commit.mjs';
import { record,fields,integer,requireCondition,fault } from './runtime/core/data-contract.mjs';
import {parseStrictJson} from './runtime/service/strict-json.mjs';
import {createMarchRunner} from './runtime/service/march-runner.mjs';
const root=fileURLToPath(new URL('./',import.meta.url));
// Fixed public drawing assets already tracked in this checkout. Never read another worktree.
const presentationFiles=[['/runtime-presentation.mjs','runtime-presentation.mjs'],['/runtime-playback-state.mjs','runtime-playback-state.mjs'],
  ['/runtime-presentation.css','runtime-presentation.css'],['/runtime-art/stickman-engine.js','stickman-engine.js'],
  ['/runtime-art/stickart-core.js','stickart/stickart-core.js'],['/runtime-art/quad.js','stickart/beasts/quad.js'],
  ['/runtime-art/deep.js','stickart/beasts/deep.js'],['/runtime-art/world-combat-fx.js','world-combat-fx.js']];
const staticFiles=new Map([['/',['runtime-map.html','text/html; charset=utf-8']],['/runtime-map.html',['runtime-map.html','text/html; charset=utf-8']],
  ['/runtime-map.mjs',['runtime-map.mjs','text/javascript; charset=utf-8']],['/runtime-activity.mjs',['runtime-activity.mjs','text/javascript; charset=utf-8']],
  ['/runtime-map.css',['runtime-map.css','text/css; charset=utf-8']]]);
const mindStaticFiles=new Map([['/runtime-mind.html',['runtime-mind.html','text/html; charset=utf-8']],
  ['/runtime-mind.mjs',['runtime-mind.mjs','text/javascript; charset=utf-8']],['/runtime-mind.css',['runtime-mind.css','text/css; charset=utf-8']]]);
for(const [url,file] of presentationFiles)staticFiles.set(url,[file,file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8']);
const encounterStaticFiles=new Map([['/runtime-encounter.html',['runtime-encounter.html','text/html; charset=utf-8']],
  ['/runtime-encounter.mjs',['runtime-encounter.mjs','text/javascript; charset=utf-8']],['/runtime-encounter.css',['runtime-encounter.css','text/css; charset=utf-8']]]);
const villageStaticFiles=new Map([['/runtime-village.html',['runtime-village.html','text/html; charset=utf-8']],
  ['/runtime-village.mjs',['runtime-village.mjs','text/javascript; charset=utf-8']],['/runtime-village.css',['runtime-village.css','text/css; charset=utf-8']]]);
const campaignStaticFiles=new Map(['runtime-campaign.html','runtime-campaign.mjs','runtime-campaign.css','runtime-campaign-contract.mjs','runtime-social-contract.mjs','runtime-campaign-battle.mjs','runtime-campaign-battle.css'].map(file=>['/'+file,[file,file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8']]));
const demoStaticFiles=new Map(['demo-runtime.html','demo-runtime.css','demo-runtime-prototype.mjs','demo-runtime-bridge.mjs','demo-runtime-interactions.mjs',
 'demo-social-language.mjs','demo-social-composer.mjs',
 'stickman-engine.js','world-combat-fx.js','kit/core.js','kit/effects.js','kit/humanoid.js','kit/appearance-modern.js','kit/accessories.js','kit/structures-lib.js','kit/furniture-lib.js','kit/fixtures.js',
 'stickart/stickart-core.js','stickart/beasts/quad.js','stickart/beasts/deep.js','stickart/beasts/serpent.js','stickart/beasts/mountain.js','stickart/beasts/village.js'].map(file=>['/'+file,[file,file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8']]));
const mindRoutes=['/api/runtime/minds',...mindStaticFiles.keys()];
const envelope=(code,message)=>({apiVersion:1,error:{code,message}});
function readCommandBody(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];let length=0,settled=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);
      req.off('data',onData);req.off('end',onEnd);req.off('aborted',onAbort);req.off('error',onError);
      if(error){req.pause();reject(error);}else resolve(Buffer.concat(chunks,length));};
    const onData=chunk=>{if(chunk.length>MAX_COMMAND_BYTES-length){finish(fault('LIMIT_EXCEEDED','Command body exceeds budget'));return;}length+=chunk.length;chunks.push(chunk);};
    const onEnd=()=>finish(),onAbort=()=>finish(fault('INVALID_INPUT','Request aborted')),onError=error=>finish(error);
    const timer=setTimeout(()=>finish(fault('INVALID_INPUT','Command body timed out')),5000);timer.unref();
    req.on('data',onData);req.once('end',onEnd);req.once('aborted',onAbort);req.once('error',onError);
  });
}
export async function startRuntimeServer(options){
  record(options);requireCondition(Object.keys(options).every(k=>['directory','seed','checkpoint','profile','port','writable','inspectMind','inspectActivity','continuousMarch','runtimeWorker'].includes(k)),'Unknown service option');
  const port=options.port??18314;integer(port);requireCondition(port<=65535,'Invalid runtime port');
  const inspectMind=options.inspectMind??false;requireCondition(typeof inspectMind==='boolean','Invalid mind inspector mode');
  const inspectActivity=options.inspectActivity??false;requireCondition(typeof inspectActivity==='boolean','Invalid activity inspector mode');
  const assets=new Map();for(const [url,[file,type]] of staticFiles)assets.set(url,{bytes:await fs.readFile(path.join(root,file)),type});
  const mindAssets=new Map();for(const [url,[file,type]] of mindStaticFiles)mindAssets.set(url,{bytes:await fs.readFile(path.join(root,file)),type});
  const continuousMarch=options.continuousMarch??false;requireCondition(typeof continuousMarch==='boolean','Invalid march runner mode');
  const runtimeWorker=options.runtimeWorker??continuousMarch;requireCondition(typeof runtimeWorker==='boolean'&&(!runtimeWorker||continuousMarch),'Worker mode requires continuous demo');
  const {port:ignored,inspectMind:ignoredInspector,inspectActivity:ignoredActivity,continuousMarch:ignoredMarch,runtimeWorker:ignoredWorker,...ownerOptions}=options,
    createOwner=runtimeWorker?(await import('./runtime/service/runtime-owner-thread.mjs')).createThreadedRuntimeOwner:createRuntimeOwner,
    owner=await createOwner({...ownerOptions,inspectActivity});let actualPort=port,closed=false,pendingRequests=0,sceneBodyReads=0;
  const encounterAssets=new Map();if(owner.encounterAvailable)for(const [url,[file,type]] of encounterStaticFiles){
    try{encounterAssets.set(url,{bytes:await fs.readFile(path.join(root,file)),type});}
    catch(error){await owner.close();throw error;}
  }
  const villageAssets=new Map();if(owner.sceneAvailable)for(const [url,[file,type]] of villageStaticFiles){
    try{villageAssets.set(url,{bytes:await fs.readFile(path.join(root,file)),type});}
    catch(error){await owner.close();throw error;}
  }
  const campaignAssets=new Map();if(owner.mapAvailable)for(const [url,[file,type]] of campaignStaticFiles){
    try{campaignAssets.set(url,{bytes:await fs.readFile(path.join(root,file)),type});}
    catch(error){await owner.close();throw error;}
  }
  if(owner.mapAvailable)assets.set('/',campaignAssets.get('/runtime-campaign.html'));
  const demoAssets=new Map();
  if(continuousMarch){
    try{requireCondition(owner.mapAvailable&&options.writable===true,'Continuous march requires writable campaign','UNSUPPORTED_VERSION');
      for(const [url,[file,type]] of demoStaticFiles)demoAssets.set(url,{bytes:await fs.readFile(path.join(root,file)),type});
      assets.set('/',demoAssets.get('/demo-runtime.html'));
    }catch(error){await owner.close();throw error;}
  }
  const writable=options.writable??false,capabilities=Object.freeze({apiVersion:1,writes:writable,playerAvailable:owner.playerAvailable,
    playerActionsAvailable:owner.playerActionsAvailable,mindAvailable:inspectMind && owner.mindAvailable,
    commandDtoVersion:owner.commandDtoVersion,maxCommandBytes:MAX_COMMAND_BYTES,
    maxAdvanceTicks:[3,4,5].includes(owner.commandDtoVersion)?144000:MAX_SERVICE_ADVANCE_TICKS,
    ...(owner.encounterAvailable?{encounterAvailable:true}:{}),...(owner.sceneAvailable?{sceneAvailable:true}:{}),
    ...(owner.activityAvailable?{activityAvailable:true}:{}),...(owner.mapAvailable?{mapAvailable:true}:{}),
    ...(owner.playerWorkAvailable===true?{playerWorkAvailable:true}:{}),...(continuousMarch?{continuousMarch:true}:{})});
  const streams=new Set();let runner;
  const demoState=()=>({apiVersion:1,capabilities,snapshot:owner.getSnapshot(),map:owner.getMap(),player:owner.getPlayer(),encounter:owner.getEncounter(),scene:owner.getScene(),runner:runner.status()});
  function broadcast(){if(!streams.size)return;const bytes='data: '+JSON.stringify(demoState())+'\n\n';for(const res of streams){if(res.destroyed||res.writableEnded)continue;if(!res.write(bytes))res.destroy();}}
  if(continuousMarch)runner=createMarchRunner(owner,{onChange:broadcast});
  const server=http.createServer({maxHeaderSize:8192,requestTimeout:5000,headersTimeout:5000},async(req,res)=>{
    const send=(status,data,type='application/json; charset=utf-8',extra={})=>{
      const bytes=Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data));
      if(res.destroyed || res.writableEnded)return;
      res.writeHead(status,{'Content-Type':type,'Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",...extra});
      res.end(req.method==='HEAD'?undefined:bytes);
    };
    try{
      const hosts=[`127.0.0.1:${actualPort}`,`localhost:${actualPort}`];
      if(!hosts.includes(req.headers.host) || (req.headers.origin!==undefined && !hosts.map(h=>'http://'+h).includes(req.headers.origin))){send(403,envelope('ORIGIN_REJECTED','仅允许本机同源读取。'),undefined,{Connection:'close'});return;}
      if(req.headers['transfer-encoding']!==undefined && !(writable && req.method==='POST' && req.url==='/api/runtime/commands' && req.headers['transfer-encoding']==='chunked')){send(400,envelope('INVALID_INPUT','不接受此流式请求体。'),undefined,{Connection:'close'});return;}
      if(req.headers['content-length']!==undefined && (!/^[0-9]+$/.test(req.headers['content-length']) || Number(req.headers['content-length'])>MAX_COMMAND_BYTES)){
        send(413,envelope('LIMIT_EXCEEDED','请求超过容量限制。'),undefined,{Connection:'close'});return;
      }
      const url=new URL(req.url,'http://127.0.0.1'),route=url.pathname;
      if(route.startsWith('/api/runtime/demo-')||demoStaticFiles.has(route)){
        if(!continuousMarch){send(404,envelope('ROUTE_NOT_FOUND','当前入口未启用demo接入。'));return;}
        if(url.search){send(400,envelope('INVALID_INPUT','不接受查询参数。'));return;}
        if(['/api/runtime/demo-order','/api/runtime/demo-stop'].includes(route)){
          requireCondition(req.method==='POST','Demo orders require POST');
          requireCondition(/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']??''),'Demo orders require UTF8 JSON');
          requireCondition(sceneBodyReads<MAX_PENDING_REQUESTS,'Command body reads exceed budget','LIMIT_EXCEEDED');sceneBodyReads++;
          let body;try{body=parseStrictJson(await readCommandBody(req),MAX_COMMAND_BYTES);}finally{sceneBodyReads--;}
          if(route==='/api/runtime/demo-stop'){fields(body,['apiVersion']);requireCondition(body.apiVersion===1,'Invalid demo version');await runner.stopAndWait('view-hidden');send(200,{apiVersion:1,runner:runner.status()});return;}
          fields(body,['apiVersion','requestId','type','payload']);requireCondition(body.apiVersion===1&&['MarchSet','MarchPause','MarchResume'].includes(body.type),'Invalid demo order');
          validateSceneCommandDto({version:5,commandId:body.requestId,expectedRevision:0,type:body.type,payload:body.payload},5);
          send(200,await runner.order(body));return;
        }
        requireCondition(['GET','HEAD'].includes(req.method),'Demo view requires GET');
        if(route==='/api/runtime/demo-state'){send(200,demoState());return;}
        if(route==='/api/runtime/demo-events'){
          requireCondition(req.method==='GET','Event stream requires GET');
          const detach=runner.attach();
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
          streams.add(res);res.write('data: '+JSON.stringify(demoState())+'\n\n');
          const heartbeat=setInterval(()=>{if(!res.write(': keepalive\n\n'))res.destroy();},15000);heartbeat.unref();
          res.once('close',()=>{clearInterval(heartbeat);streams.delete(res);detach();});return;
        }
        const asset=demoAssets.get(route);if(asset){send(200,asset.bytes,asset.type);return;}
        send(404,envelope('ROUTE_NOT_FOUND','未找到demo接口。'));return;
      }
      if(mindRoutes.includes(route)){
        if(!(inspectMind && owner.mindAvailable)){send(404,envelope('MIND_UNAVAILABLE','心智检查器未启用或当前世界不支持。'));return;}
        if(!['GET','HEAD'].includes(req.method)){send(405,envelope('WRITE_DISABLED','当前接口只支持读取。'),undefined,{Allow:'GET, HEAD',Connection:'close'});return;}
        if(url.search){send(400,envelope('INVALID_INPUT','不接受查询参数。'));return;}
        if(route==='/api/runtime/minds')send(200,owner.getMindInspector());
        else{const asset=mindAssets.get(route);send(200,asset.bytes,asset.type);}
        return;
      }
      if(route==='/api/runtime/scene' || villageStaticFiles.has(route)){
        if(!owner.sceneAvailable){send(404,envelope('SCENE_UNAVAILABLE','当前世界没有场景投影。'));return;}
        if(!['GET','HEAD'].includes(req.method)){send(405,envelope('WRITE_DISABLED','当前接口只支持读取。'),undefined,{Allow:'GET, HEAD',Connection:'close'});return;}
        if(url.search){send(400,envelope('INVALID_INPUT','不接受查询参数。'));return;}
        if(route==='/api/runtime/scene')send(200,owner.getScene());
        else{const asset=villageAssets.get(route);send(200,asset.bytes,asset.type);}
        return;
      }
      if(route==='/api/runtime/map' || campaignStaticFiles.has(route)){
        if(!owner.mapAvailable){send(404,envelope('MAP_UNAVAILABLE','当前世界没有地图投影。'));return;}
        if(!['GET','HEAD'].includes(req.method)){send(405,envelope('WRITE_DISABLED','当前接口只支持读取。'),undefined,{Allow:'GET, HEAD',Connection:'close'});return;}
        if(url.search){send(400,envelope('INVALID_INPUT','不接受查询参数。'));return;}
        if(route==='/api/runtime/map')send(200,owner.getMap());
        else{const asset=campaignAssets.get(route);send(200,asset.bytes,asset.type);}
        return;
      }
      if(route==='/api/runtime/encounter'){
        if(!owner.encounterAvailable){send(404,envelope('ENCOUNTER_UNAVAILABLE','当前世界没有遭遇投影。'));return;}
        if(!['GET','HEAD'].includes(req.method)){send(405,envelope('WRITE_DISABLED','当前接口只支持读取。'),undefined,{Allow:'GET, HEAD',Connection:'close'});return;}
        if(url.search){send(400,envelope('INVALID_INPUT','不接受查询参数。'));return;}
        send(200,owner.getEncounter());return;
      }
      if(route==='/api/runtime/activities'){
        if(!owner.activityAvailable){send(404,envelope('ACTIVITY_UNAVAILABLE','当前世界活动观察未启用。'));return;}
        if(!['GET','HEAD'].includes(req.method)){send(405,envelope('WRITE_DISABLED','当前接口只支持读取。'),undefined,{Allow:'GET, HEAD',Connection:'close'});return;}
        if(url.search){send(400,envelope('INVALID_INPUT','不接受查询参数。'));return;}
        send(200,owner.getActivity());return;
      }
      if(url.search){send(400,envelope('INVALID_INPUT','不接受查询参数。'));return;}
      if(route==='/api/runtime/commands'){
        if(!writable || req.method!=='POST'){send(405,envelope('WRITE_DISABLED','当前入口不接受此方法。'),undefined,{Allow:writable?'POST':'',Connection:'close'});return;}
        if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']??'')){send(415,envelope('INVALID_INPUT','请使用UTF8 JSON。'),undefined,{Connection:'close'});return;}
        if(owner.sceneAvailable){
          requireCondition(sceneBodyReads<MAX_PENDING_REQUESTS,'Command body reads exceed budget','LIMIT_EXCEEDED');sceneBodyReads++;
          let dto;
          try{dto=parseSceneCommandBytes(await readCommandBody(req),owner.commandDtoVersion);}
          finally{sceneBodyReads--;}
          if(continuousMarch)requireCondition(!dto.type.startsWith('March'),'Use runtime order intent','COMMAND_UNSUPPORTED');
          send(200,await (runner?runner.command(dto):owner.submit(dto)));return;
        }
        requireCondition(pendingRequests<MAX_PENDING_REQUESTS,'Command requests exceed budget','LIMIT_EXCEEDED');pendingRequests++;
        try{const dto=parseCommandBytes(await readCommandBody(req),owner.commandDtoVersion);send(200,await owner.submit(dto));}
        finally{pendingRequests--;}
        return;
      }
      const known=staticFiles.has(route) || encounterAssets.has(route) || ['/healthz','/api/runtime/snapshot','/api/runtime/player','/api/runtime/capabilities'].includes(route);
      if(!known){send(404,envelope('ROUTE_NOT_FOUND','未找到页面或接口。'));return;}
      if(!['GET','HEAD'].includes(req.method)){send(405,envelope('WRITE_DISABLED','当前接口只支持读取。'),undefined,{Allow:'GET, HEAD',Connection:'close'});return;}
      if(route==='/api/runtime/snapshot')send(200,owner.getSnapshot());
      else if(route==='/api/runtime/player'){
        if(owner.playerAvailable)send(200,owner.getPlayer());
        else send(404,envelope('PLAYER_UNAVAILABLE','当前世界没有玩家身份。'));
      }
      else if(route==='/api/runtime/capabilities')send(200,capabilities);
      else if(route==='/healthz')send(200,{apiVersion:1,status:'ready',revision:owner.getSnapshot().revision});
      else{const asset=assets.get(route)??encounterAssets.get(route);send(200,asset.bytes,asset.type);}
    }catch(error){
      const codes={INVALID_INPUT:400,UNSUPPORTED_VERSION:400,COMMAND_UNSUPPORTED:400,RULE_REJECTED:422,LIMIT_EXCEEDED:413,
        REVISION_CONFLICT:409,COMMAND_ID_CONFLICT:409,SAVE_FAILED:503,OWNER_BUSY:503,INVALID_SERVICE_COMMIT:503,
        MIND_UNAVAILABLE:404,MIND_ACTOR_UNAVAILABLE:404};
      const status=codes[error.code]??500,body=envelope(status===500?'RUNTIME_UNAVAILABLE':error.code,status===409?'读数或请求已发生冲突，请重新读取。':'世界请求未能完成。');
      if(error.code==='REVISION_CONFLICT')body.currentRevision=error.currentRevision;
      send(status,body,undefined,{Connection:'close'});
    }
  });
  server.on('clientError',(error,socket)=>{
    // An unused browser preconnection has no HTTP request to reject.
    if(owner.sceneAvailable && error.code==='ERR_HTTP_REQUEST_TIMEOUT' && socket.bytesRead===0 && socket.bytesWritten===0){socket.destroy();return;}
    if(!socket.writable)return;const status=error.code==='HPE_HEADER_OVERFLOW'?431:400,body=JSON.stringify(envelope(status===431?'LIMIT_EXCEEDED':'INVALID_INPUT','请求格式不合法。'));
    socket.end(`HTTP/1.1 ${status} Error\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  });
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});actualPort=server.address().port;}
  catch(cause){await owner.close();throw Object.assign(fault(cause.code==='EADDRINUSE'?'PORT_IN_USE':'SERVER_START_FAILED','Runtime service could not listen'),{cause});}
  return Object.freeze({url:`http://127.0.0.1:${actualPort}`,async close(){if(closed)return;closed=true;if(runner)await runner.close();for(const res of streams)res.end();await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await owner.close();}});
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const flags=new Map();for(let i=2;i<process.argv.length;i+=2){const flag=process.argv[i],value=process.argv[i+1];requireCondition(['--data-dir','--port','--seed','--checkpoint','--profile','--writable','--inspect-mind','--inspect-activity','--continuous-march'].includes(flag) && !flags.has(flag) && value && !value.startsWith('--'),'Invalid service argument');flags.set(flag,value);}
    if(flags.has('--writable'))requireCondition(['true','false'].includes(flags.get('--writable')),'Invalid write mode');
    if(flags.has('--inspect-mind'))requireCondition(['true','false'].includes(flags.get('--inspect-mind')),'Invalid mind inspector mode');
    if(flags.has('--inspect-activity'))requireCondition(['true','false'].includes(flags.get('--inspect-activity')),'Invalid activity inspector mode');
    if(flags.has('--continuous-march'))requireCondition(['true','false'].includes(flags.get('--continuous-march')),'Invalid continuous march mode');
    const decimal=value=>{requireCondition(/^(0|[1-9][0-9]*)$/.test(value),'Invalid decimal option');return Number(value);};
    const options={directory:flags.get('--data-dir')??path.join(root,'artifacts','world-runtime-d1','dev-world'),
      ...(flags.has('--port')?{port:decimal(flags.get('--port'))}:{}),...(flags.has('--seed')?{seed:decimal(flags.get('--seed'))}:{}),
      ...(flags.has('--checkpoint')?{checkpoint:flags.get('--checkpoint')}:{}),...(flags.has('--profile')?{profile:flags.get('--profile')}:{}),writable:flags.get('--writable')==='true',
      inspectMind:flags.get('--inspect-mind')==='true',inspectActivity:flags.get('--inspect-activity')==='true',continuousMarch:flags.get('--continuous-march')==='true'};
    const service=await startRuntimeServer(options);console.log(JSON.stringify({status:'ready',url:service.url,writes:options.writable}));
    let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await service.close();process.stdin.pause();console.log(JSON.stringify({status:'stopped'}));};
    process.once('SIGINT',()=>{stop().catch(()=>{process.exitCode=1;});});process.once('SIGTERM',()=>{stop().catch(()=>{process.exitCode=1;});});
    process.stdin.setEncoding('utf8');let input='';process.stdin.on('data',data=>{input=(input+data).slice(-128);if(input.includes('quit\n') || input.includes('quit\r\n'))stop().catch(()=>{process.exitCode=1;});});
  }catch(error){console.error(`ERROR ${error.code??'SERVER_START_FAILED'}: ${error.message}`);process.exitCode=1;}
}
