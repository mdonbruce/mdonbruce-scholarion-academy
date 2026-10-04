"""Execute instructor/model Python only in an explicitly configured Docker image.

No host execution fallback, network, host mounts, Docker socket or credentials.
The image must be preinstalled and pinned by digest; this module never pulls it.
"""
import json,os,re,subprocess,uuid

def execute(lab):
 image=os.getenv('SCHOLARION_LAB_IMAGE','')
 if not re.fullmatch(r'[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}',image):
  return {'status':'blocked','reason':'Configure a preinstalled Python lab image pinned by sha256 digest.'}
 if not isinstance(lab,dict) or any(not isinstance(lab.get(k),str) or len(lab[k])>30000 for k in ['starter','solution','tests']):raise ValueError('Lab requires bounded starter, solution and tests')
 name='scholarion-lab-'+uuid.uuid4().hex
 # Output is redirected to a bounded tmpfs file, not an unbounded host pipe.
 runner="import sys,json,contextlib,resource\nresource.setrlimit(resource.RLIMIT_FSIZE,(65536,65536))\np=json.load(sys.stdin)\nwith open('/tmp/result','w+') as f:\n try:\n  with contextlib.redirect_stdout(f),contextlib.redirect_stderr(f):\n   scope={}\n   exec(compile(p['solution'],'solution.py','exec'),scope)\n   exec(compile(p['tests'],'tests.py','exec'),scope)\n  status='passed'\n except BaseException as e:\n  status='failed';f.write(type(e).__name__+': '+str(e)[:1000])\n f.seek(0);out=f.read(64000)\nprint(json.dumps({'status':status,'output':out}))"
 args=['docker','run','--rm','--pull=never','--name',name,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--memory=256m','--cpus=1','--pids-limit=32','--user=65534:65534','--tmpfs=/tmp:rw,noexec,nosuid,size=8m','-i',image,'python','-I','-c',runner]
 try:
  result=subprocess.run(args,input=json.dumps(lab),text=True,capture_output=True,timeout=25)
  if result.returncode:return {'status':'blocked','reason':'Docker engine or pinned lab image unavailable; no host execution attempted.'}
  report=json.loads(result.stdout)
  if report.get('status') not in ['passed','failed']:raise ValueError('Invalid sandbox report')
  report['image']=image
  report['notebook']={'nbformat':4,'nbformat_minor':5,'metadata':{'kernelspec':{'name':'python3','display_name':'Python 3'},'execution':{'image':image,'status':report['status']}},'cells':[{'cell_type':'code','metadata':{},'execution_count':1,'source':lab['solution']+'\n'+lab['tests'],'outputs':[{'output_type':'stream','name':'stdout','text':report['output']}]}]}
  return report
 except subprocess.TimeoutExpired:return {'status':'failed','reason':'Sandbox exceeded 25-second limit'}
 except (OSError,ValueError):return {'status':'blocked','reason':'Sandbox unavailable or invalid execution report'}
 finally:
  try:subprocess.run(['docker','rm','-f',name],capture_output=True,timeout=5)
  except (OSError,subprocess.TimeoutExpired):pass
