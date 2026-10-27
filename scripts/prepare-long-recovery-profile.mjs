// Reconstruct the PR34 synthetic HTTP scenario without accessing real saves.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {defaultPlayableVillageConfig,createPlayableCampaignVillage} from '../runtime/fixtures/campaign-village.mjs';
import {computeCampaignIntent} from '../runtime/core/scene-campaign-runtime.mjs';
import {encodeStateFile} from '../runtime/persistence/bounded-json-file.mjs';

const output=process.argv[2];
assert.ok(output,'Pass a new output path for the synthetic fixture');
const config=defaultPlayableVillageConfig();config.memory.society.player.initialFood=100;
const anchor=createPlayableCampaignVillage(42,'quest-expiry-http',config).bundle;
let bundle=anchor;
const commands=[];
for(const [i,[type,payload]] of [
 ['PlayerQuest',{questId:'livelihood',action:'accept'}],
 ['PlayerWork',{}],['PlayerBuy',{product:'food',quantity:1}],
 ['AdvanceTime',{ticks:1440}],['AdvanceTime',{ticks:539}],['AdvanceTime',{ticks:1}],
 ['PlayerQuest',{questId:'livelihood',action:'accept'}]
].entries()){
 const dto={version:5,commandId:'expiry-http-'+(i+1),expectedRevision:bundle.snapshot.revision,type,payload};
 const result=computeCampaignIntent(bundle,dto);
 assert.equal(result.receipt.outcome,'succeeded',type);
 bundle=result.bundle;commands.push({dto,receipt:result.receipt});
 console.log(JSON.stringify({command:i+1,type,revision:bundle.snapshot.revision,tick:bundle.snapshot.tick}));
}
assert.equal(bundle.snapshot.tick,2017);assert.equal(bundle.snapshot.revision,2019);
const envelope={serviceFormatVersion:11,anchor,commands,bundle};
const bytes=Buffer.from(JSON.stringify(envelope));
const publishedHash=createHash('sha256').update(encodeStateFile(envelope)).digest('hex');
// The old HTTP run recorded this final file hash. Equal canonical bytes bind
// this reconstruction to the observed long-test state, not a lookalike fixture.
assert.equal(publishedHash,'1a31773e50d8ee8f9542399e98a908c255f52b5a1e6c12b26e987f4b978ef391');
await fs.mkdir(path.dirname(path.resolve(output)),{recursive:true});
await fs.writeFile(output,bytes,{flag:'wx'});
console.log(JSON.stringify({status:'prepared',tick:bundle.snapshot.tick,commands:commands.length,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),publishedHash,externalModelCalls:0,scope:'synthetic; initial food 100'}));
