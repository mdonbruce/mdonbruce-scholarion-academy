import json,time,uuid
SERVICES={'identity':'Single sign-on and MFA','canvas':'Canvas LMS','payments':'Payments','email':'Email delivery','hr':'Employee learning events'}
def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.execute('CREATE TABLE IF NOT EXISTS integration_registry(id TEXT PRIMARY KEY,owner TEXT,purpose TEXT,status TEXT,version INTEGER)')
  for key,name in SERVICES.items():db.execute('INSERT OR IGNORE INTO integration_registry VALUES(?,?,?,?,1)',(key,'Unassigned',name,'Planned'))
  if action=='list':
   return {'role':ctx['role'],'records':[dict(r,authentication='Not configured',permissions='None granted',dataExchanged='None',schedule='Disabled',lastSuccessfulSync=None,health='No verified connector',consent='Required before enabling',retention='Not configured') for r in db.execute('SELECT * FROM integration_registry ORDER BY id') if r['id'] in SERVICES]}
  if ctx['role']!='instructor':raise Denied('Pilot instructor required to maintain planning records')
  if action=='history':
   return {'events':[json.loads(r['payload']) for r in db.execute("SELECT payload FROM outbox WHERE json_extract(payload,'$.decision_code')='integration.plan.updated' ORDER BY rowid DESC LIMIT 100")]}
  if action!='update' or data.get('id') not in SERVICES:raise ValueError('Unknown or out-of-scope integration')
  if data.get('status') not in ['Planned','Configured but disabled','Unavailable']:raise ValueError('A verified connector is required for connection status')
  owner=data.get('owner');purpose=data.get('purpose')
  if not isinstance(owner,str) or not 1<=len(owner.strip())<=120 or not isinstance(purpose,str) or not 1<=len(purpose.strip())<=500 or type(data.get('version')) is not int:raise ValueError('Invalid planning record')
  row=db.execute('UPDATE integration_registry SET owner=?,purpose=?,status=?,version=version+1 WHERE id=? AND version=?',(owner.strip(),purpose.strip(),data['status'],data.get('id'),data['version']))
  if row.rowcount!=1:raise Conflict('Record changed or unavailable; refresh')
  db.execute('INSERT INTO outbox VALUES(?,?)',(str(uuid.uuid4()),json.dumps({'timestamp':time.time(),'tenant_id':tenant,'user_id':ctx['user'],'decision_code':'integration.plan.updated','integration_id':data['id'],'status':data['status'],'version':data['version']+1})))
  return {'saved':True,'connected':False}

