import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRuntimeOwner} from '../../runtime/service/runtime-owner.mjs';
import {validateServiceCommit} from '../../runtime/service/service-commit.mjs';
import {startRuntimeServer} from '../../runtime-server.mjs';
const root=path.resolve(process.env.CAMPAIGN_TEST_ROOT??'artifacts/d4e11/service-check-01');
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');

test('campaign owner rollback, pause/replan/NPC gift, restart equality, tamper rejection and no lock residue',async()=>{
 let fail=false;const io=new Proxy(fs,{get(t,k){if(k==='link')return async(...args)=>{if(fail)throw Object.assign(new Error('injected publication failure'),{code:'EIO'});return fs.link(...args);};const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}});
 let owner,seq=0;const directory=path.join(root,'world');await fs.mkdir(root,{recursive:true});
 assert.equal(await fs.stat(directory).then(()=>true,()=>false),false,'fresh isolated directory required');
 const views=o=>({snapshot:o.getSnapshot(),map:o.getMap(),player:o.getPlayer(),encounter:o.getEncounter(),scene:o.getScene()});
 const send=async(type,payload={})=>owner.submit({version:5,commandId:`owner-${++seq}`,expectedRevision:owner.getSnapshot().revision,type,payload});
 try{
  owner=await createRuntimeOwner({directory,profile:'campaign-village',writable:true,inspectActivity:true},io);
  await send('PlayerGiftFood',{recipientId:'actor-2'});
  const before=views(owner),dto={version:5,commandId:'retry-fixed',expectedRevision:owner.getSnapshot().revision,type:'MarchSet',payload:{x:16,y:7}};
  fail=true;await assert.rejects(owner.submit(dto),e=>e.code==='SAVE_FAILED');assert.deepEqual(views(owner),before);
  assert.deepEqual((await fs.readdir(directory)).sort(),['.runtime-owner.lock','service-commit-r0.json','service-commit-r1.json']);fail=false;
  const receipt=await owner.submit(dto);assert.deepEqual(await owner.submit(dto),receipt);
  await assert.rejects(owner.submit({...dto,payload:{x:15,y:7}}),e=>e.code==='COMMAND_ID_CONFLICT');
  assert.equal((await send('PlayerWork')).outcome,'rejected','marching blocks write bypass');
  await send('MarchStep');await send('MarchPause');const pause=views(owner),files=(await fs.readdir(directory)).filter(f=>f.endsWith('.json'));
  const hashes=Object.fromEntries(await Promise.all(files.map(async f=>[f,await hash(path.join(directory,f))])));
  await owner.close();owner=null;assert.equal((await fs.readdir(directory)).includes('.runtime-owner.lock'),false);
  owner=await createRuntimeOwner({directory,writable:true,inspectActivity:true});assert.deepEqual(views(owner),pause);
  await assert.rejects(send('MarchSet',{x:4,y:7,cost:0}));assert.deepEqual(views(owner),pause);
  await send('MarchSet',{x:4,y:7});for(let i=0;i<4&&owner.getMap().order.status==='marching';i++)await send('MarchStep');
  if(owner.getMap().contact)await send('MarchPause');
  const near=owner.getMap().actors.find(a=>a.actorId==='actor-2');assert.ok(near?.canInteract);
  assert.equal(owner.getScene().actors.find(a=>a.actorId==='actor-2').gift.available,false,'nearby hunter on road cannot receive village-only gift');
  assert.equal(owner.getMap().actors.find(a=>a.actorId==='actor-2').receivedGifts.length,1,'real prior gift memory survives travel and restart');
  for(const [f,h]of Object.entries(hashes))assert.equal(await hash(path.join(directory,f)),h,'existing commits immutable');
  const revision=owner.getSnapshot().revision;await owner.close();owner=null;
  const file=path.join(directory,`service-commit-r${revision}.json`),envelope=JSON.parse(await fs.readFile(file,'utf8'));validateServiceCommit(envelope);
  for(const mutate of [e=>e.bundle.snapshot.world.mapModel.position.x++,e=>e.commands.at(-1).receipt.toRevision++,e=>e.bundle.snapshot.world.mapModel.npcs[1].x++]){const bad=structuredClone(envelope);mutate(bad);assert.throws(()=>validateServiceCommit(bad));}
  const tamper=path.join(root,'tamper');await fs.mkdir(tamper);envelope.commands.at(-1).receipt.toRevision++;await fs.writeFile(path.join(tamper,`service-commit-r${revision}.json`),JSON.stringify(envelope));
  await assert.rejects(createRuntimeOwner({directory:tamper,writable:true}),e=>e.code==='INVALID_SERVICE_COMMIT');assert.equal((await fs.readdir(tamper)).includes('.runtime-owner.lock'),false);
 }finally{if(owner)await owner.close();}
});

test('campaign HTTP DTO/profile/route authority remains isolated from old profile',async()=>{
 let server;try{
  server=await startRuntimeServer({directory:path.join(root,'http'),profile:'campaign-village',writable:true,port:0});
  for(const route of ['/runtime-campaign.html','/runtime-campaign.mjs','/runtime-campaign-contract.mjs','/runtime-campaign-battle.css','/api/runtime/map'])assert.equal((await fetch(server.url+route,{signal:AbortSignal.timeout(5000)})).status,200);
  const post=(dto,origin)=>fetch(server.url+'/api/runtime/commands',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(dto),signal:AbortSignal.timeout(15000)});
  const dto={version:5,commandId:'http-set',expectedRevision:0,type:'MarchSet',payload:{x:16,y:7}};
  assert.equal((await post({...dto,version:4})).status,400);assert.equal((await post({...dto,payload:{x:20,y:7}})).status,400);assert.equal((await post(dto,'https://example.invalid')).status,403);
  assert.equal((await post(dto)).status,200);assert.equal((await fetch(server.url+'/api/runtime/minds')).status,404);await server.close();server=null;
  server=await startRuntimeServer({directory:path.join(root,'legacy'),profile:'scene-livelihood-village',writable:true,port:0});
  assert.equal((await fetch(server.url+'/api/runtime/map')).status,404);assert.equal((await post(dto)).status,400);
  const legacy={version:4,commandId:'legacy-work',expectedRevision:0,type:'PlayerWork',payload:{}};const r=await post(legacy);assert.equal(r.status,200);assert.equal((await r.json()).receiptVersion,4);
 }finally{if(server)await server.close();}
});
