import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function verifyForestCandidate(){
 const m=JSON.parse(await fs.readFile(path.join(root,'docs/runtime/forest-playtest-candidate.json'),'utf8'));
 if(m.schemaVersion!==1||m.id!=='forest-playtest-candidate-1'||m.contentBase!=='acdc4afac35c2db99a7eacb7cc035d442657de66'||m.profile!=='campaign-forest-village'||m.fixtureVersion!=='8'||m.gameEntry!=='Start-Forest-Journey.cmd'||Object.keys(m.gameSha256).length!==192)throw Error('Unexpected forest playtest candidate');
 for(const [file,expected]of Object.entries(m.gameSha256)){
  const resolved=path.resolve(root,file);if(path.isAbsolute(file)||!resolved.startsWith(root))throw Error('Invalid candidate source path');
  if(createHash('sha256').update(await fs.readFile(resolved)).digest('hex')!==expected)throw Error('Candidate game source changed: '+file);
 }
 return {id:m.id,contentBase:m.contentBase,gameFiles:Object.keys(m.gameSha256).length,gameEntry:m.gameEntry,gates:m.gates};
}
