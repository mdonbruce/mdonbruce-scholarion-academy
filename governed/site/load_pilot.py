"""Isolated HTTP load check: synthetic users, temporary database, no hosted inference."""
import concurrent.futures,http.client,json,math,secrets,tempfile,threading,time
from collections import Counter
from pathlib import Path
from http.server import ThreadingHTTPServer
from governed_service import Service,Handler,PilotServer

def run(users):
 with tempfile.TemporaryDirectory() as directory:
  service=Service(directory);tokens=[]
  with service.connect('scholarion') as db:
   for index in range(users):
    token=secrets.token_urlsafe(32);user=f'load-learner-{index}';tokens.append(token)
    service.identities[token]={'tenant':'scholarion','user':user,'role':'student','expires':time.time()+600}
    db.execute('INSERT INTO enrollments VALUES(?,?,?,?)',(user,'AIM310','student','active'))
  server=PilotServer(('127.0.0.1',0),Handler);server.service=service
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start();barrier=threading.Barrier(users)
  def learner(index):
   barrier.wait();results=[]
   for action in ['dashboard','coursework/list','coursework/submit','dashboard']:
    client=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=15)
    payload={'tenant':'scholarion','course':'AIM310'}
    if action.endswith('submit'):payload.update(assignment='AIM310-evidence',body='Synthetic capacity-test evidence',request_key=f'load-request-{index}')
    start=time.perf_counter();status=0
    try:
     client.request('POST','/api/'+action,json.dumps(payload),{'Host':'127.0.0.1:4180','Authorization':'Bearer '+tokens[index]})
     response=client.getresponse();response.read();status=response.status
    except (OSError,TimeoutError):pass
    finally:client.close()
    results.append({'write':action.endswith('submit'),'ms':(time.perf_counter()-start)*1000,'status':status})
   return results
  try:
   with concurrent.futures.ThreadPoolExecutor(max_workers=users) as executor:records=[r for group in executor.map(learner,range(users)) for r in group]
  finally:server.shutdown();server.server_close();thread.join()
  def p95(write):
   values=sorted(r['ms'] for r in records if r['write']==write)
   return round(values[math.ceil(len(values)*.95)-1],2)
  return {'concurrentLearners':users,'requests':len(records),'unexpectedErrors':sum(r['status']!=200 for r in records),'statusCounts':dict(Counter(r['status'] for r in records)),'readP95Milliseconds':p95(False),'writeP95Milliseconds':p95(True)}

if __name__=='__main__':
 config=json.loads((Path(__file__).parent/'pilot_capacity.json').read_text())
 results=[run(config[key]) for key in ['baselineConcurrentLearners','stressConcurrentLearners']]
 for result in results:result['passed']=result['unexpectedErrors']/result['requests']<=config['maxUnexpectedErrorRate'] and result['readP95Milliseconds']<=config['readP95Milliseconds'] and result['writeP95Milliseconds']<=config['writeP95Milliseconds']
 report={'scope':'Local synthetic HTTP workload; not production or model-provider capacity acceptance','timestamp':time.time(),'results':results}
 output=Path(__file__).parent/'PILOT-LOAD-RESULTS.json';history_path=output.with_name('PILOT-LOAD-HISTORY.json')
 history=json.loads(history_path.read_text()) if history_path.exists() else []
 if output.exists() and not history:history.append(json.loads(output.read_text()))
 history.append(report);history_path.write_text(json.dumps(history,indent=2));output.write_text(json.dumps(report,indent=2))
 print(json.dumps(report,indent=2))
