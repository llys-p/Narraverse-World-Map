from pathlib import Path
import urllib.request,json,hashlib,sys
out=Path(__file__).resolve().parent
mode=sys.argv[1];target=out/(mode+'-reads.json');assert not target.exists()
views={}
for route in ['snapshot','player','encounter','scene']:
 with urllib.request.urlopen('http://127.0.0.1:18326/api/runtime/'+route,timeout=15) as response:
  assert response.status==200;data=response.read();value=json.loads(data)
 views[route]={'sha256':hashlib.sha256(data).hexdigest(),'canonicalSha256':hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),'revision':value['revision'],'tick':value['tick'],'simulationId':value['simulationId']}
assert all(v['revision']==38 and v['tick']==36 for v in views.values())
assert len(set(v['simulationId'] for v in views.values()))==1
files={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (out/'test-world').glob('service-commit-r*.json')}
result={'views':views,'serviceCommitHashes':files}
target.write_text(json.dumps(result,indent=2),encoding='utf-8')
if mode=='after':
 before=json.loads((out/'before-reads.json').read_text(encoding='utf-8'));assert before==result
 print('FOUR_PROJECTIONS_AND_ALL_COMMITS_IDENTICAL_AFTER_REOPEN')
else:print('CAPTURED_BEFORE_CLOSE')
