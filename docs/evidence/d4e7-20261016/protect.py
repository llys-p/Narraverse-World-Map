from pathlib import Path
import hashlib,json,subprocess,datetime
tree=Path(__file__).resolve().parents[2];out=Path(__file__).parent;control=Path(r'D:\Narraverse-World-Map-control')
read=lambda p:json.loads(p.read_text(encoding='utf-8-sig'))
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
before=read(control/'artifacts/d4e7-20261016/protection-before.json')
ps='''Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'runtime-server.mjs' } | ForEach-Object { @{pid=$_.ProcessId;commandLine=$_.CommandLine;startUtc=$_.CreationDate.ToUniversalTime().ToString('o')} } | ConvertTo-Json -Compress'''
live=json.loads(subprocess.check_output(['powershell','-NoProfile','-Command',ps],encoding='utf-8-sig'));live=[live] if isinstance(live,dict) else live
services=[]
for r in before['services']:
    base=Path(r['tree']);meta=next(x for x in live if x['pid']==r['pid']);assert meta==r['process']
    assert subprocess.check_output(['git','-C',str(base),'rev-parse','HEAD'],text=True).strip()==r['sourceCommit']
    assert subprocess.check_output(['git','-C',str(base),'status','--porcelain'],text=True)==r['sourceStatus']
    assert all(h(base/'artifacts/d4-daily/world'/n)==v for n,v in r['existingFiles'].items())
    services.append({'port':r['port'],'pid':r['pid'],'processAndSourceUnchanged':True,'existingFilesUnchanged':len(r['existingFiles'])})
assert all(h(Path(before['originalRoot'])/r['file'])==r['sha256'] for r in before['originalEight'])
assert all(h(control/n)==v for n,v in before['protectedUntracked'].items())
assert all(h(tree/n)==v for n,v in before['source'].items())
proof=read(out/'settled.json');assert read(out/'refreshed.json')==proof and read(out/'reopened.json')==proof
assert {p.name:h(p) for p in (out/'world').glob('service-commit-r*.json')}==proof['files']
assert not (out/'world/.runtime-owner.lock').exists();assert not list((out/'world').glob('*.tmp'));assert not (tree/'artifacts/d4-daily/world').exists()
exits={label:read(out/f'{label}-exit.json') for label in ['first','reopen']}
assert all(r['code']==0 and r['signal'] is None and not r['timedOut'] for r in exits.values())
allNode='''@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'Narraverse-World-Map-livelihood-loop|d4e7-20261016' }).Count'''
assert int(subprocess.check_output(['powershell','-NoProfile','-Command',allNode],encoding='utf-8-sig').strip())==0
result={'at':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),'originalEightUnchanged':True,'originalHashes':{r['file']:r['sha256'] for r in before['originalEight']},'productSourceFilesUnchanged':len(before['source']),'protectedUntrackedUnchanged':len(before['protectedUntracked']),'userServices':services,'ownProcesses':exits,'ownMatchingNodeCount':0,'ownLockAbsent':True,'ownTemporaryFilesAbsent':True,'defaultDailyWorldCreated':False,'fiveViewsAndFilesIdenticalAfterRefreshAndReopen':True,'ownServiceFiles':len(proof['files']),'businessCommandCount':len(proof['commands']),'dailyCount':len(proof['playerDaily'])}
(out/'protection-final.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result))
