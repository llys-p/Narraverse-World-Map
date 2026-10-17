import sys,subprocess,time,json,os,ctypes
from pathlib import Path
root=Path(__file__).resolve().parents[1];label=sys.argv[1];limit=float(sys.argv[2]);command=sys.argv[3:];phaseFile=None
if command[:1]==['--phase-file']:phaseFile=root/command[1];command=command[2:]
assert label.replace('-','').isalnum() and 0<limit<=600 and command
base=root/'artifacts/d4e12';base.mkdir(parents=True,exist_ok=True)
stdout=base/(label+'.txt');meta=base/(label+'.json');assert not stdout.exists() and not meta.exists()
start=time.perf_counter();timed=False;unconfirmed=False;cpu=None;job=None;jobProtected=False;phaseKilled=None
with stdout.open('wb') as output:
 p=subprocess.Popen(command,cwd=root,stdout=output,stderr=subprocess.STDOUT,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
 if os.name=='nt':
  from ctypes import wintypes
  class BASIC(ctypes.Structure):
   _fields_=[('processTime',ctypes.c_longlong),('jobTime',ctypes.c_longlong),('flags',wintypes.DWORD),('minWS',ctypes.c_size_t),('maxWS',ctypes.c_size_t),('active',wintypes.DWORD),('affinity',ctypes.c_size_t),('priority',wintypes.DWORD),('scheduling',wintypes.DWORD)]
  class IO(ctypes.Structure):_fields_=[(name,ctypes.c_ulonglong) for name in ['readOps','writeOps','otherOps','readBytes','writeBytes','otherBytes']]
  class EXTENDED(ctypes.Structure):_fields_=[('basic',BASIC),('io',IO),('processMemory',ctypes.c_size_t),('jobMemory',ctypes.c_size_t),('peakProcess',ctypes.c_size_t),('peakJob',ctypes.c_size_t)]
  api=ctypes.windll.kernel32;api.CreateJobObjectW.restype=wintypes.HANDLE
  api.SetInformationJobObject.argtypes=[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD]
  api.AssignProcessToJobObject.argtypes=[wintypes.HANDLE,wintypes.HANDLE];api.TerminateJobObject.argtypes=[wintypes.HANDLE,wintypes.UINT];api.CloseHandle.argtypes=[wintypes.HANDLE]
  job=api.CreateJobObjectW(None,None);info=EXTENDED();info.basic.flags=0x2000
  jobProtected=bool(job and api.SetInformationJobObject(job,9,ctypes.byref(info),ctypes.sizeof(info)) and api.AssignProcessToJobObject(job,int(p._handle)))
 print(json.dumps({'label':label,'pid':p.pid,'limitSeconds':limit}),flush=True)
 try:
  while p.poll() is None:
   now=time.perf_counter()
   if now-start>=limit:raise subprocess.TimeoutExpired(command,limit)
   if phaseFile and phaseFile.exists():
    try:phase=json.loads(phaseFile.read_text(encoding='utf-8'))
    except (ValueError,OSError):phase=None
    if phase and phase.get('phase') and time.time()*1000-phase['startedAt']>120000:
     phaseKilled=phase['phase'];raise subprocess.TimeoutExpired(command,120)
   try:p.wait(timeout=min(.2,limit-(now-start)))
   except subprocess.TimeoutExpired:pass
 except subprocess.TimeoutExpired:
  timed=True
  if jobProtected:api.TerminateJobObject(job,9)
  elif os.name=='nt':subprocess.run(['taskkill','/PID',str(p.pid),'/T','/F'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
  else:p.kill()
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:unconfirmed=True
 if os.name=='nt' and not unconfirmed:
  from ctypes import wintypes
  c,e,k,u=(wintypes.FILETIME() for _ in range(4))
  if ctypes.windll.kernel32.GetProcessTimes(int(p._handle),ctypes.byref(c),ctypes.byref(e),ctypes.byref(k),ctypes.byref(u)):
   cpu=((k.dwHighDateTime<<32)+k.dwLowDateTime+(u.dwHighDateTime<<32)+u.dwLowDateTime)/10000
if job:api.CloseHandle(job)
record=dict(command=command,pid=p.pid,exitCode=p.returncode,timedOut=timed,unconfirmed=unconfirmed,wallMs=round((time.perf_counter()-start)*1000,3),cpuMs=cpu,hardLimitMs=limit*1000,jobProtected=jobProtected,phaseKilled=phaseKilled)
meta.write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8');print(json.dumps(record),flush=True)
raise SystemExit(0 if p.returncode==0 and not timed and not unconfirmed else 1)
