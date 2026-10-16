from pathlib import Path
import json,hashlib,subprocess,datetime,sys
root=Path(__file__).resolve().parents[2];out=Path(__file__).resolve().parent;control=Path('D:/Narraverse-World-Map-control')
world=Path(sys.argv[1]).resolve();boundary=(root/'artifacts/d4e6-person-tracking-tests').resolve();assert world.is_relative_to(boundary) and world.name=='world'
def read(p):return json.loads(p.read_text(encoding='utf-8-sig'))
def h(p):return hashlib.sha256(p.read_bytes()).hexdigest()
before=read(control/'artifacts/d4e6-20261016/protection-before.json');pre=read(out/'preflight.json')
ps="""Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'runtime-server.mjs' } | ForEach-Object { @{pid=$_.ProcessId;commandLine=$_.CommandLine;startUtc=$_.CreationDate.ToUniversalTime().ToString('o')} } | ConvertTo-Json -Compress"""
live=json.loads(subprocess.check_output(['powershell','-NoProfile','-Command',ps],encoding='utf-8-sig'));services=[]
if isinstance(live,dict):live=[live]
for r in before['services']:
 tree=Path(r['tree']);meta=next(p for p in live if p['pid']==r['pid'])
 files={n:{'sha256':h(tree/'artifacts/d4-daily/world'/n),'unchanged':h(tree/'artifacts/d4-daily/world'/n)==v} for n,v in r['existingFiles'].items()}
 source=subprocess.check_output(['git','-C',str(tree),'rev-parse','HEAD'],encoding='utf-8').strip();status=subprocess.check_output(['git','-C',str(tree),'status','--porcelain'],encoding='utf-8')
 record={'port':r['port'],'pid':r['pid'],'sameProcessIdentity':meta==r['process'],'sourceCommit':source,'sourceUnchanged':source==r['sourceCommit'] and status==r['sourceStatus'],'existingFiles':files}
 assert record['sameProcessIdentity'] and record['sourceUnchanged'] and all(x['unchanged'] for x in files.values());services.append(record)
archive=Path('D:/Narraverse-World-Map/hds-d4-cp1a-review/artifacts/world-runtime-d4-cp3-controller/CP3-FULL-19796-1791960566578/runtime-data')
originals=[{'file':r['file'],'sha256':h(archive/r['file']),'unchanged':h(archive/r['file'])==r['sha256']} for r in pre['originalEight']]
runtime={n:h(root/n)==v for n,v in pre['runtime'].items() if n!='runtime/service/world-activity.mjs'}
untracked={n:h(control/n)==v for n,v in before['protectedUntracked'].items()};assert all(r['unchanged'] for r in originals) and all(runtime.values()) and all(untracked.values())
exits={label:read(out/f'{label}-exit.json') for label in ['first','reopen']};assert all(r['code']==0 and r['signal'] is None and not r['timedOut'] for r in exits.values())
proof=read(out/'before-browser.json');assert read(out/'after-browser.json')==proof and read(out/'reopened.json')==proof
assert not (world/'.runtime-owner.lock').exists() and not (root/'artifacts/d4-daily/world').exists()
ps="""@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'important-person-tracking\\.test|d4e6-controller-20261016' }).Count"""
count=int(subprocess.check_output(['powershell','-NoProfile','-Command',ps],encoding='utf-8-sig').strip());assert count==0
result={'at':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],encoding='utf-8').strip(),'originalEight':originals,'userServices':services,'otherRuntimeFilesUnchanged':len(runtime),'otherRuntimeAllUnchanged':True,'protectedUntrackedCount':len(untracked),'protectedUntrackedAllUnchanged':True,'ownProcesses':exits,'ownMatchingNodeCount':count,'ownLockAbsent':True,'candidate18331DefaultWorldCreated':False,'fiveViewsAndServiceFilesSameThroughBrowserAndReopen':True,'serviceFileCount':len(proof['files'])}
(out/'protection-final.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'originalsUnchanged':8,'otherRuntimeUnchanged':len(runtime),'userServicesUnchanged':[r['port'] for r in services],'ownProcessesExited':2,'filesUnchanged':len(proof['files'])}))
