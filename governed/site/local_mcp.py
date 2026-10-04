"""Allowlisted stdio MCP 2025-11-25 client and local read-only server."""
import json,sys,subprocess,threading,queue
VERSION='2025-11-25'
def call_local(method,params=None):
 # No user-supplied executable, shell, host or file path.
 p=subprocess.Popen([sys.executable,__file__,'serve'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
 q=queue.Queue()
 threading.Thread(target=lambda:[q.put(line) for line in p.stdout],daemon=True).start()
 def send(m,params,ident=None):
  msg={'jsonrpc':'2.0','method':m,'params':params}
  if ident is not None:msg['id']=ident
  p.stdin.write(json.dumps(msg)+'\n');p.stdin.flush()
 def receive(ident):
  try:r=json.loads(q.get(timeout=5))
  except queue.Empty:raise ValueError('MCP timeout')
  if r.get('id')!=ident or 'error' in r:raise ValueError('MCP response rejected')
  return r['result']
 try:
  send('initialize',{'protocolVersion':VERSION,'capabilities':{},'clientInfo':{'name':'scholarion','version':'1'}},1)
  if receive(1).get('protocolVersion')!=VERSION:raise ValueError('Unsupported protocol')
  send('notifications/initialized',{})
  send(method,params or {},2);return receive(2)
 finally:
  p.terminate();p.wait(timeout=5);p.stdin.close();p.stdout.close()
def serve():
 initialized=False
 for line in sys.stdin:
  r=json.loads(line);method=r.get('method')
  if method=='notifications/initialized':initialized=True;continue
  if method=='initialize':result={'protocolVersion':VERSION,'capabilities':{'tools':{}},'serverInfo':{'name':'scholarion-course-policy','version':'1'}}
  elif initialized and method=='tools/list':result={'tools':[{'name':'course_standard','description':'Read the approved course duration.','inputSchema':{'type':'object','properties':{},'additionalProperties':False}}]}
  elif initialized and method=='tools/call' and r.get('params')=={'name':'course_standard','arguments':{}}:result={'content':[{'type':'text','text':'All Scholarion courses use the standard 10-week format.'}],'isError':False}
  else:
   print(json.dumps({'jsonrpc':'2.0','id':r.get('id'),'error':{'code':-32602,'message':'Unsupported request'}}),flush=True);continue
  print(json.dumps({'jsonrpc':'2.0','id':r.get('id'),'result':result}),flush=True)
if __name__=='__main__' and sys.argv[-1]=='serve':serve()
