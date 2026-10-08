import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntimeOwner } from './runtime/service/runtime-owner.mjs';
import { MAX_COMMAND_BYTES,MAX_SERVICE_ADVANCE_TICKS,parseCommandBytes } from './runtime/service/http-contract.mjs';
import { MAX_PENDING_REQUESTS } from './runtime/service/service-commit.mjs';
import { record,integer,requireCondition,fault } from './runtime/core/data-contract.mjs';
const root=fileURLToPath(new URL('./',import.meta.url));
const staticFiles=new Map([['/',['runtime-map.html','text/html; charset=utf-8']],['/runtime-map.html',['runtime-map.html','text/html; charset=utf-8']],
  ['/runtime-map.mjs',['runtime-map.mjs','text/javascript; charset=utf-8']],['/runtime-map.css',['runtime-map.css','text/css; charset=utf-8']]]);
const mindStaticFiles=new Map([['/runtime-mind.html',['runtime-mind.html','text/html; charset=utf-8']],
  ['/runtime-mind.mjs',['runtime-mind.mjs','text/javascript; charset=utf-8']],['/runtime-mind.css',['runtime-mind.css','text/css; charset=utf-8']]]);
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
  record(options);requireCondition(Object.keys(options).every(k=>['directory','seed','checkpoint','profile','port','writable','inspectMind'].includes(k)),'Unknown service option');
  const port=options.port??18314;integer(port);requireCondition(port<=65535,'Invalid runtime port');
  const inspectMind=options.inspectMind??false;requireCondition(typeof inspectMind==='boolean','Invalid mind inspector mode');
  const assets=new Map();for(const [url,[file,type]] of staticFiles)assets.set(url,{bytes:await fs.readFile(path.join(root,file)),type});
  const mindAssets=new Map();for(const [url,[file,type]] of mindStaticFiles)mindAssets.set(url,{bytes:await fs.readFile(path.join(root,file)),type});
  const {port:ignored,inspectMind:ignoredInspector,...ownerOptions}=options,owner=await createRuntimeOwner(ownerOptions);let actualPort=port,closed=false,pendingRequests=0;
  const writable=options.writable??false,capabilities=Object.freeze({apiVersion:1,writes:writable,playerAvailable:owner.playerAvailable,
    playerActionsAvailable:owner.playerActionsAvailable,mindAvailable:inspectMind && owner.mindAvailable,
    commandDtoVersion:1,maxCommandBytes:MAX_COMMAND_BYTES,maxAdvanceTicks:MAX_SERVICE_ADVANCE_TICKS});
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
      if(mindRoutes.includes(route)){
        if(!(inspectMind && owner.mindAvailable)){send(404,envelope('MIND_UNAVAILABLE','心智检查器未启用或当前世界不支持。'));return;}
        if(!['GET','HEAD'].includes(req.method)){send(405,envelope('WRITE_DISABLED','当前接口只支持读取。'),undefined,{Allow:'GET, HEAD',Connection:'close'});return;}
        if(url.search){send(400,envelope('INVALID_INPUT','不接受查询参数。'));return;}
        if(route==='/api/runtime/minds')send(200,owner.getMindInspector());
        else{const asset=mindAssets.get(route);send(200,asset.bytes,asset.type);}
        return;
      }
      if(url.search){send(400,envelope('INVALID_INPUT','不接受查询参数。'));return;}
      if(route==='/api/runtime/commands'){
        if(!writable || req.method!=='POST'){send(405,envelope('WRITE_DISABLED','当前入口不接受此方法。'),undefined,{Allow:writable?'POST':'',Connection:'close'});return;}
        if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']??'')){send(415,envelope('INVALID_INPUT','请使用UTF8 JSON。'),undefined,{Connection:'close'});return;}
        requireCondition(pendingRequests<MAX_PENDING_REQUESTS,'Command requests exceed budget','LIMIT_EXCEEDED');pendingRequests++;
        try{const dto=parseCommandBytes(await readCommandBody(req));send(200,await owner.submit(dto));}
        finally{pendingRequests--;}
        return;
      }
      const known=staticFiles.has(route) || ['/healthz','/api/runtime/snapshot','/api/runtime/player','/api/runtime/capabilities'].includes(route);
      if(!known){send(404,envelope('ROUTE_NOT_FOUND','未找到页面或接口。'));return;}
      if(!['GET','HEAD'].includes(req.method)){send(405,envelope('WRITE_DISABLED','当前接口只支持读取。'),undefined,{Allow:'GET, HEAD',Connection:'close'});return;}
      if(route==='/api/runtime/snapshot')send(200,owner.getSnapshot());
      else if(route==='/api/runtime/player'){
        if(owner.playerAvailable)send(200,owner.getPlayer());
        else send(404,envelope('PLAYER_UNAVAILABLE','当前世界没有玩家身份。'));
      }
      else if(route==='/api/runtime/capabilities')send(200,capabilities);
      else if(route==='/healthz')send(200,{apiVersion:1,status:'ready',revision:owner.getSnapshot().revision});
      else{const asset=assets.get(route);send(200,asset.bytes,asset.type);}
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
    if(!socket.writable)return;const status=error.code==='HPE_HEADER_OVERFLOW'?431:400,body=JSON.stringify(envelope(status===431?'LIMIT_EXCEEDED':'INVALID_INPUT','请求格式不合法。'));
    socket.end(`HTTP/1.1 ${status} Error\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  });
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});actualPort=server.address().port;}
  catch(cause){await owner.close();throw Object.assign(fault(cause.code==='EADDRINUSE'?'PORT_IN_USE':'SERVER_START_FAILED','Runtime service could not listen'),{cause});}
  return Object.freeze({url:`http://127.0.0.1:${actualPort}`,async close(){if(closed)return;closed=true;await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await owner.close();}});
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const flags=new Map();for(let i=2;i<process.argv.length;i+=2){const flag=process.argv[i],value=process.argv[i+1];requireCondition(['--data-dir','--port','--seed','--checkpoint','--profile','--writable','--inspect-mind'].includes(flag) && !flags.has(flag) && value && !value.startsWith('--'),'Invalid service argument');flags.set(flag,value);}
    if(flags.has('--writable'))requireCondition(['true','false'].includes(flags.get('--writable')),'Invalid write mode');
    if(flags.has('--inspect-mind'))requireCondition(['true','false'].includes(flags.get('--inspect-mind')),'Invalid mind inspector mode');
    const decimal=value=>{requireCondition(/^(0|[1-9][0-9]*)$/.test(value),'Invalid decimal option');return Number(value);};
    const options={directory:flags.get('--data-dir')??path.join(root,'artifacts','world-runtime-d1','dev-world'),
      ...(flags.has('--port')?{port:decimal(flags.get('--port'))}:{}),...(flags.has('--seed')?{seed:decimal(flags.get('--seed'))}:{}),
      ...(flags.has('--checkpoint')?{checkpoint:flags.get('--checkpoint')}:{}),...(flags.has('--profile')?{profile:flags.get('--profile')}:{}),writable:flags.get('--writable')==='true',
      inspectMind:flags.get('--inspect-mind')==='true'};
    const service=await startRuntimeServer(options);console.log(JSON.stringify({status:'ready',url:service.url,writes:options.writable}));
    let stopping=false;const stop=async()=>{if(stopping)return;stopping=true;await service.close();process.stdin.pause();console.log(JSON.stringify({status:'stopped'}));};
    process.once('SIGINT',()=>{stop().catch(()=>{process.exitCode=1;});});process.once('SIGTERM',()=>{stop().catch(()=>{process.exitCode=1;});});
    process.stdin.setEncoding('utf8');let input='';process.stdin.on('data',data=>{input=(input+data).slice(-128);if(input.includes('quit\n') || input.includes('quit\r\n'))stop().catch(()=>{process.exitCode=1;});});
  }catch(error){console.error(`ERROR ${error.code??'SERVER_START_FAILED'}: ${error.message}`);process.exitCode=1;}
}
