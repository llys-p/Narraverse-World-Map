"""Frozen Windows/Node24 r170 acceptance; no production edits or private-save export."""
from pathlib import Path
import hashlib,json,os,platform,re,shutil,statistics,subprocess,sys,time

ROOT=Path(__file__).resolve().parents[1]
A=Path(r'D:\Narraverse-World-Map-issue3-baseline')
B=ROOT
OUT=ROOT/'artifacts/issue3-config-checks-20261016/measurement'
ORIGINAL=Path(r'D:\Narraverse-World-Map\hds-d4-cp1a-review\artifacts\world-runtime-d4-cp3-controller\CP3-FULL-19796-1791960566578\runtime-data')
SHA_A='b7e5a9e7c131ee79acd017276ff62910a549d5ad'
SHA_B=os.environ['ISSUE3_CANDIDATE_SHA']
NODE=shutil.which('node')
HARNESS=B/'scripts/measure-d4-long-history.mjs'
CONTRACT='issue3-complete-config-validation-v1'
ORDER=[('A1',A),('B1',B),('B2',B),('A2',A)]
EXPECTED=json.loads(re.search(r'const ORIGINAL_SHA = (\{.*?\});',HARNESS.read_text(encoding='utf-8'),re.S)[1].replace("'",'"'))
ENV=os.environ.copy()
for key in ['D4_ACCEPTANCE_SOURCE','D4P2_REFERENCE_RUNTIME_DATA','D4P3_REFERENCE_RUNTIME_DATA','D4P3_BASELINE_SOURCE','NODE_OPTIONS']:
    ENV.pop(key,None)
ENV['D4P2_REFERENCE_RUNTIME_DATA']=str(ORIGINAL)
ENV['D4P3_REFERENCE_RUNTIME_DATA']=str(ORIGINAL)

def save(name,value):
    (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def hash_file(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def quick(args,cwd=ROOT):
    return subprocess.check_output(args,cwd=cwd,env=ENV,timeout=30).decode('utf-8').strip()

def archive():
    rows=[{'file':name,'bytes':(ORIGINAL/name).stat().st_size,'sha256':hash_file(ORIGINAL/name)} for name in EXPECTED]
    assert all(row['sha256']==EXPECTED[row['file']] for row in rows),'Original archive fingerprint mismatch'
    assert set(p.name for p in ORIGINAL.iterdir())==set(EXPECTED),'Original directory entries changed'
    return rows

def production(source):
    files=quick(['git','ls-files','runtime','runtime-*.mjs','runtime-*.html','runtime-*.css'],source).splitlines()
    return {p:hash_file(source/p) for p in files}

def services():
    command="$ErrorActionPreference='Stop'; $x=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -in 18324,18325,18212,18302,8084} | ForEach-Object { $p=Get-Process -Id $_.OwningProcess; [pscustomobject]@{address=$_.LocalAddress;port=$_.LocalPort;pid=$_.OwningProcess;name=$p.ProcessName;startUtc=$p.StartTime.ToUniversalTime().ToString('o')} }); ConvertTo-Json -InputObject $x -Compress"
    return json.loads(quick(['powershell.exe','-NoProfile','-Command',command]) or '[]')

def bounded(label,args,cwd,seconds,source=None):
    stdout=OUT/(label+'-stdout.txt');stderr=OUT/(label+'-stderr.txt')
    assert not stdout.exists() and not stderr.exists(),'Refusing to overwrite run logs'
    env=ENV.copy()
    if source:env['D4_ACCEPTANCE_SOURCE']=str(source)
    started=time.perf_counter()
    with stdout.open('wb') as o,stderr.open('wb') as e:
        p=subprocess.Popen(args,cwd=cwd,env=env,stdout=o,stderr=e,stdin=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
        timeout=False
        try:p.wait(timeout=seconds)
        except subprocess.TimeoutExpired:
            timeout=True
            if p.poll() is None:
                subprocess.run(['taskkill','/PID',str(p.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10,check=True)
            p.wait(timeout=5)
    result={'label':label,'args':list(map(str,args)),'cwd':str(cwd),'sourceOverride':str(source) if source else None,'pid':p.pid,'exit':p.returncode,'hardLimitSeconds':seconds,'timedOut':timeout,'wallMs':(time.perf_counter()-started)*1000}
    save(label+'-process.json',result)
    print(json.dumps(result),flush=True)
    assert not timeout and p.returncode==0,label+' failed; preserve logs, stop'
    return result

def run_dir(label,source):return source/'artifacts/d4-long-history-20261015'/('issue3-complete-'+label)

mode=sys.argv[1]
OUT.mkdir(parents=True,exist_ok=True)
assert re.fullmatch('[0-9a-f]{40}',SHA_B)
if mode=='prepare':
    assert not (OUT/'preflight.json').exists()
    assert quick(['git','rev-parse','HEAD'],A)==SHA_A
    assert quick(['git','rev-parse','HEAD'],B)==SHA_B
    assert not quick(['git','status','--porcelain'],A)
    assert not quick(['git','diff','--','runtime'],B)
    assert platform.system()=='Windows' and quick([NODE,'--version']).startswith('v24.')
    frozen=production(A);candidate=production(B)
    assert set(p for p in frozen if frozen[p]!=candidate[p])=={'runtime/core/data-contract.mjs','runtime/core/resource-ledger.mjs','runtime/core/ecology.mjs','runtime/core/market.mjs','runtime/core/actors.mjs','runtime/core/hunter.mjs','runtime/core/society.mjs','runtime/core/memory-runtime.mjs'}
    protected=Path(r'D:\Narraverse-World-Map-control')
    dirty=quick(['git','ls-files','--others','--exclude-standard'],protected).splitlines()
    assert all((protected/p).is_file() for p in dirty)
    info=json.loads(quick([NODE,'-e',"const o=require('node:os');console.log(JSON.stringify({node:process.version,execPath:process.execPath,arch:process.arch,osRelease:o.release(),cpu:o.cpus()[0].model,logicalCpus:o.cpus().length,totalMemoryBytes:o.totalmem(),freeMemoryBytes:o.freemem()}))"]))
    save('preflight.json',{'at':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'baseline':SHA_A,'candidate':SHA_B,'node':info,'powerScheme':quick(['powercfg','/GETACTIVESCHEME']),'originals':archive(),'originalDirectoryEntries':sorted(p.name for p in ORIGINAL.iterdir()),'baselineProduction':frozen,'candidateProduction':candidate,'protectedControlUntracked':{p:hash_file(protected/p) for p in dirty},'servicesBefore':services(),'harnessSha256':hash_file(HARNESS),'driverSha256':hash_file(Path(__file__)),'order':[x[0] for x in ORDER],'limits':{'stageMs':120000,'childMs':420000,'exitConfirmMs':5000,'outerSeconds':460},'timing':'no Profiler; separate processes; no OS cache flush; process.cpuUsage user+system per stage; close excludes views'})
    for label,source in ORDER:
        assert not run_dir(label,source).exists()
        bounded('prepare-'+label,[NODE,str(HARNESS),'prepare','--run-id','issue3-complete-'+label,'--contract',CONTRACT,'--git-head',SHA_A if source==A else SHA_B],B,30,source)
    print('PREPARED',flush=True)
elif mode=='tests':
    assert (OUT/'preflight.json').exists()
    base=['--test','--test-isolation=none','--test-reporter=tap','--test-timeout=90000']
    common=['tests/simulation/canonical-json-equivalence.test.mjs','tests/simulation/canonical-key-reuse.test.mjs']
    for label,source in [('B',B)]:
        files=common+(['tests/simulation/config-validation-construction.test.mjs','tests/simulation/upper-config-validation.test.mjs'] if source==B else [])
        bounded('unit-'+label,[NODE,*base,*files],source,100)
        bounded('persistence-'+label,[NODE,*base,'--test-name-pattern','^CP2a-S(?:5|7) ','tests/simulation/scene-gift-service.test.mjs'],source,100)
    # Same byte-identical parent watchdog as prior acceptance; reuse its bounded probe.
elif mode=='run':
    pre=json.loads((OUT/'preflight.json').read_text(encoding='utf-8'))
    assert hash_file(HARNESS)==pre['harnessSha256']
    for name in ['unit-B','persistence-B']:
        passed=json.loads((OUT/(name+'-process.json')).read_text(encoding='utf-8'))
        assert passed['exit']==0 and not passed['timedOut']
    for label,source in ORDER:
        archive();assert production(source)==pre['baselineProduction' if source==A else 'candidateProduction']
        bounded('measure-'+label,[NODE,str(HARNESS),'run','--run-id','issue3-complete-'+label,'--contract',CONTRACT],B,460,source)
        directory=run_dir(label,source)
        parent=json.loads((directory/'parent-result.json').read_text(encoding='utf-8'))
        child=json.loads((directory/'child-result.json').read_text(encoding='utf-8'))
        assert parent['verdict']=='COMPLETED_CONSISTENT' and parent['childExit']['code']==0 and not parent['killed'] and not parent['exitUnconfirmed']
        assert child['verdict']=='COMPLETED_CONSISTENT' and all(row['ok'] for row in child['checks'])
        bounded('verify-'+label,[NODE,str(HARNESS),'verify','--run-id','issue3-complete-'+label],B,30,source)
        assert json.loads((directory/'protection.json').read_text())['verdict']=='PROTECTION_OK'
        print('CONSISTENT '+label+' '+json.dumps(child['timings']),flush=True)
elif mode=='summarize':
    pre=json.loads((OUT/'preflight.json').read_text(encoding='utf-8'));rows=[]
    for label,source in ORDER:
        directory=run_dir(label,source)
        child=json.loads((directory/'child-result.json').read_text(encoding='utf-8'))
        parent=json.loads((directory/'parent-result.json').read_text(encoding='utf-8'))
        protection=json.loads((directory/'protection.json').read_text(encoding='utf-8'))
        assert child['verdict']=='COMPLETED_CONSISTENT' and protection['verdict']=='PROTECTION_OK'
        # Only hashes and timing/boolean evidence are exported; no world projections or save contents.
        row={'label':label,'sourceCommit':SHA_A if source==A else SHA_B,'pid':parent['childPid'],'timings':child['timings'],'parentTotalMs':parent['totalMs'],'checks':child['checks'],'startSignature':child['startSignature'],'startProjectionSignatures':child['startProjectionSignatures'],'endProjectionSignatures':child['endProjectionSignatures'],'reopenedProjectionSignatures':child['reopenedProjectionSignatures'],'receiptSignature':child['receiptSignature'],'referenceReceiptSignature':child['referenceReceiptSignature'],'produced':child['produced'],'reopenComparison':child['reopenComparison'],'childExit':parent['childExit'],'killed':parent['killed'],'exitUnconfirmed':parent['exitUnconfirmed'],'protection':protection}
        save('run-'+label+'.json',row);rows.append(row)
        assert row['startProjectionSignatures']==rows[0]['startProjectionSignatures']
        assert row['endProjectionSignatures']==row['reopenedProjectionSignatures']==rows[0]['endProjectionSignatures']
        assert row['receiptSignature']==row['referenceReceiptSignature']==rows[0]['receiptSignature']
    def describe(v):
        mean=statistics.mean(v);sd=statistics.stdev(v)
        return {'n':len(v),'valuesMs':v,'medianMs':statistics.median(v),'meanMs':mean,'minMs':min(v),'maxMs':max(v),'sampleSdMs':sd,'cvPct':100*sd/mean if mean else None}
    stats=[]
    for stage in ['first-open','submit-travel','close','reopen']:
        for metric in ['ms','cpuMs']:
            values={kind:[next(t[metric] for t in row['timings'] if t['stage']==stage) for row in rows if row['label'][0]==kind] for kind in ['A','B']}
            a,b=describe(values['A']),describe(values['B'])
            stats.append({'stage':stage,'metric':metric,'baseline':a,'candidate':b,'improvementPct':100*(1-b['medianMs']/a['medianMs']) if a['medianMs'] else None,'pairedImprovementPct':[100*(1-v/u) if u else None for u,v in zip(values['A'],values['B'])]})
    originals=archive();protected=Path(r'D:\Narraverse-World-Map-control')
    assert all(hash_file(protected/p)==h for p,h in pre['protectedControlUntracked'].items())
    assert production(A)==pre['baselineProduction'] and production(B)==pre['candidateProduction']
    after=services()
    assert after==pre['servicesBefore'],'Existing selected listener identity changed; investigate, do not kill'
    save('summary.json',{'baseline':SHA_A,'candidate':SHA_B,'order':[r['label'] for r in rows],'measurementsPerVersion':2,'statistics':stats,'parentTotalsMs':{kind:[r['parentTotalMs'] for r in rows if r['label'][0]==kind] for kind in ['A','B']},'functionalVerdict':'PASS','performanceVerdict':'SEE_REPORT_NOT_DAILY_ACCEPTANCE','allEightOriginalsUnchanged':originals==pre['originals'],'servicesAfter':after,'protectedUntrackedUnchanged':True,'productionUnchanged':True,'privateSavesExported':False})
    print(json.dumps(stats),flush=True)
else:raise ValueError('Use prepare/tests/run/summarize')
