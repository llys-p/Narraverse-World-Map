import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createMarketRoutePause } from '../../runtime/fixtures/market-village.mjs';
import { MARKET_RULES } from '../../runtime/core/market.mjs';
import { advanceOneTick } from '../../runtime/core/command-engine.mjs';
import { saveCheckpoint, loadCheckpoint } from '../../runtime/persistence/checkpoint-store.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function temporary(t){const prefix=path.join(os.tmpdir(),'world-market-test-'),folder=await fs.mkdtemp(prefix);
  t.after(async()=>{assert.ok(folder.startsWith(prefix));await fs.rm(folder,{recursive:true,force:true});});return folder;}
const advance=(b,s,n)=>{for(let i=0;i<n;i++)b=advanceOneTick(b,s);return b;};

test('B3 real disk split preserves paid in-flight cargo, route pause, future reopening and exactly-once arrivals',async t=>{
  const directory=await temporary(t),{bundle,systems}=createMarketRoutePause(0,'market-disk');
  const whole=advance(bundle,systems,4*144),prefix=advance(bundle,systems,2*144);
  assert.equal(prefix.snapshot.world.marketModel.routeOpen,false);assert.equal(prefix.snapshot.world.marketModel.inTransit.length,2);
  const file=await saveCheckpoint(prefix,{directory,rulesVersion:MARKET_RULES,systems});
  const loaded=await loadCheckpoint(file,{rulesVersion:MARKET_RULES,systems});
  const resumed=advance(loaded,systems,2*144);assert.deepEqual(resumed,whole);
  const days=whole.eventLog.filter(e=>e.type==='EconomyDaySettled');
  assert.equal(days[2].payload.arrivals.length,0);assert.equal(days[3].payload.arrivals.length,2);
  assert.equal(days[3].payload.arrivals[0].dueDay,3);assert.equal(whole.snapshot.world.marketModel.arrived.food,100);
  const bad=JSON.parse(await fs.readFile(file,'utf8'));bad.snapshot.world.marketModel.inTransit[0].dueDay--;
  const badFile=path.join(directory,'bad-cargo.json');await fs.writeFile(badFile,JSON.stringify(bad));
  await assert.rejects(loadCheckpoint(badFile,{rulesVersion:MARKET_RULES,systems}),e=>e.code==='INVALID_CHECKPOINT');
});

test('B3 real CLI exports market/trade ledger and resumes registered market fixture',async t=>{
  const directory=await temporary(t),first=path.join(directory,'first'),resume=path.join(directory,'resume');
  const cli=args=>spawnSync(process.execPath,['simulation-runner.mjs',...args],{cwd:root,encoding:'utf8',timeout:60000});
  const result=cli(['--fixture','market-shortage','--days','1','--seed','0','--out',first]);assert.equal(result.status,0,result.stderr);
  const summary=JSON.parse(await fs.readFile(path.join(first,'summary.json'),'utf8'));
  assert.equal(summary.rulesVersion,MARKET_RULES);assert.equal(summary.fixtureId,'market-shortage');assert.match(summary.marketConfigHash,/^[a-f0-9]{64}$/);
  const config=JSON.parse(await fs.readFile(path.join(first,'market-config.json'),'utf8'));assert.equal(config.version,'market-config-v1');
  const market=await fs.readFile(path.join(first,'market.csv'),'utf8');assert.match(market,/gapPermille/);assert.equal(market.trim().split('\n').length,3);
  const trade=await fs.readFile(path.join(first,'trade.csv'),'utf8');assert.match(trade,/dueDay/);assert.match(trade,/shipment-1/);assert.match(trade,/ordered/);
  const economy=await fs.readFile(path.join(first,'economy.csv'),'utf8');assert.equal(economy.trim().split('\n').length,4);
  const [economyHeader,...economyLines]=economy.trim().split('\n'),columns=economyHeader.split(',');
  const money= economyLines.map(line=>Object.fromEntries(columns.map((key,index)=>[key,line.split(',')[index]]))).find(row=>row.resource==='gold');
  assert.equal(money.opening,'2000');assert.equal(money.consumption,'1980');assert.equal(money.closing,'20');
  const ecology=await fs.readFile(path.join(first,'ecology.csv'),'utf8');assert.equal(ecology.trim().split('\n').length,2);
  const second=cli(['--resume',summary.checkpointPath,'--days','2','--out',resume]);assert.equal(second.status,0,second.stderr);
  const end=JSON.parse(await fs.readFile(path.join(resume,'summary.json'),'utf8'));assert.equal(end.tick,432);assert.equal(end.marketConfigHash,summary.marketConfigHash);
  const checkpoint=JSON.parse(await fs.readFile(end.checkpointPath,'utf8'));assert.equal(checkpoint.snapshot.world.marketModel.arrived.food,100);
});
