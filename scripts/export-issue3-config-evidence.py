"""Publish only timing, hashes and boolean proofs; runtime saves stay local."""
from pathlib import Path
import hashlib,json,shutil,subprocess

ROOT=Path(__file__).resolve().parents[1]
M1=Path(r'D:\Narraverse-World-Map-issue3-history-cost')
OUT=ROOT/'artifacts/issue3-config-checks-20261016/public'
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'.gitattributes').write_text('* -text\n',encoding='utf-8')

def put(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def read(path):return json.loads(path.read_text(encoding='utf-8'))

for label,root,topic in [('partial',M1,'issue3-history-cost-20261016'),('complete',ROOT,'issue3-config-checks-20261016')]:
    src=root/'artifacts'/topic/'measurement'
    assert read(src/'summary.json')['functionalVerdict']=='PASS'
    dest=OUT/label;dest.mkdir(exist_ok=True)
    for name in ['preflight.json','summary.json']:
        shutil.copyfile(src/name,dest/name)
    for path in src.glob('*-process.json'):
        shutil.copyfile(path,dest/path.name)
    for name in ['unit-B-stdout.txt','persistence-B-stdout.txt']:
        shutil.copyfile(src/name,dest/name)
    for run in ['A1','B1','B2','A2']:
        row=read(src/('run-'+run+'.json'))
        # A few private assertion details contain full command receipts: omit every detail.
        row['checks']=[{'name':c['name'],'ok':c['ok']} for c in row['checks']]
        assert len(row['checks'])==24 and all(c['ok'] for c in row['checks'])
        assert row['produced']['byteIdenticalToReference']
        put(dest/('run-'+run+'.json'),row)

profile=M1/'artifacts/d4-long-history-20261015/issue3-profile-20261016'
put(OUT/'profile-analysis.json',read(profile/'profile-analysis.json'))
parent=read(profile/'parent-result.json');child=read(profile/'child-result.json')
put(OUT/'profile-run.json',{k:parent[k] for k in ['runId','contract','verdict','reviewCause','childPid','childExit','exitUnconfirmed','totalMs','limits','killed','lockPresentAtEnd']})
put(OUT/'profile-protection.json',read(profile/'protection.json'))
profile_process=read(M1/'artifacts/issue3-history-cost-20261016/profile-process.json')
put(OUT/'profile-process.json',profile_process)
assert child['verdict']=='COMPLETED_CONSISTENT'
put(OUT/'profile-timings.json',{'timings':child['timings'],'startSignature':child['startSignature'],'checks':[{'name':c['name'],'ok':c['ok']} for c in child['checks']]})

# Attribute canonical encoding to its immediate caller in the sampled stack.
p=read(profile/'first-open.cpuprofile');nodes={n['id']:n for n in p['nodes']};parents={c:n['id'] for n in p['nodes'] for c in n.get('children',[])}
callers={}
for sample,delta in zip(p['samples'],p['timeDeltas']):
    cursor=sample
    while cursor in parents:
        if nodes[cursor]['callFrame']['functionName']=='canonicalJson':
            f=nodes[parents[cursor]]['callFrame'];name=f['functionName']+' ['+f['url'].split('/')[-1]+']'
            callers[name]=callers.get(name,0)+delta;break
        cursor=parents[cursor]
put(OUT/'canonical-callers.json',{'method':'CPU Profiler timeDeltas, nearest parent above canonicalJson; sampled elapsed weights, not exact process CPU','rows':[{'caller':k,'ms':v/1000,'percent':100*v/(p['endTime']-p['startTime'])} for k,v in sorted(callers.items(),key=lambda x:-x[1])]})
for name in ['encoder-parameter-probe.json','string-spelling-probe.json']:
    shutil.copyfile(M1/'artifacts/issue3-history-cost-20261016'/name,OUT/name)
shutil.copyfile(ROOT/'artifacts/issue3-config-checks-20261016/memory-validation-probe.json',OUT/'memory-validation-probe.json')

# Check only PIDs recorded by this task, never terminate arbitrary Node processes.
pids={read(x)['pid'] for x in OUT.glob('*/*-process.json')}
for x in OUT.glob('*/run-*.json'):pids.add(read(x)['pid'])
pids.add(parent['childPid']);pids.add(profile_process['pid'])
command='$ids=@('+','.join(map(str,sorted(pids)))+'); @(Get-Process -Id $ids -ErrorAction SilentlyContinue | Select-Object Id,ProcessName) | ConvertTo-Json -Compress'
r=subprocess.run(['powershell.exe','-NoProfile','-Command',command],capture_output=True,text=True,timeout=30)
assert not r.stdout.strip(),'Recorded PID still alive: '+r.stdout
put(OUT/'process-exit-proof.json',{'checkedPids':sorted(pids),'anyRecordedPidAlive':False,'method':'Get-Process exact recorded PID list after all bounded processes completed; no global kill'})
files=[{'path':str(p.relative_to(OUT)).replace('\\','/'),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(OUT.rglob('*')) if p.is_file() and p.name!='index.json']
put(OUT/'index.json',{'files':files,'privateSavesExported':False,'fullProjectionsExported':False,'fullReceiptsExported':False,'rawCpuProfileExported':False})
print(json.dumps({'files':len(files),'recordedPids':len(pids),'export':str(OUT)}))
