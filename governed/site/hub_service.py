import json,time,uuid,datetime
def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant);kind=data.get('kind')
 if kind not in ['calendar','discussions','help']:raise ValueError('Unknown module')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.execute('CREATE TABLE IF NOT EXISTS hub_records(id TEXT PRIMARY KEY,course TEXT,kind TEXT,owner TEXT,title TEXT,body TEXT,event_date TEXT,state TEXT,version INTEGER,created REAL)')
  db.execute('CREATE TABLE IF NOT EXISTS support_replies(id TEXT PRIMARY KEY,record TEXT,author TEXT,role TEXT,body TEXT,created REAL)')
  db.execute('CREATE TABLE IF NOT EXISTS support_resolution(record TEXT PRIMARY KEY,resolved REAL,resolver TEXT)')
  def allowed(r):return kind=='discussions' or r['owner']==ctx['user'] or (kind=='help' and ctx['role']=='instructor')
  if action=='list':
   rows=db.execute('SELECT * FROM hub_records WHERE course=? AND kind=? ORDER BY event_date,created DESC',(course,kind)).fetchall()
   records=[]
   for row in rows:
    if not allowed(row):continue
    record=dict(row)
    if kind=='help':
     record['replies']=[dict(r) for r in db.execute('SELECT * FROM support_replies WHERE record=? ORDER BY created,id',(row['id'],))]
     resolution=db.execute('SELECT * FROM support_resolution WHERE record=?',(row['id'],)).fetchone();record['resolution']=dict(resolution) if resolution else None
    records.append(record)
   return {'role':ctx['role'],'user':ctx['user'],'records':records}
  if action=='create':
   title=data.get('title');body=data.get('body');date=data.get('date','')
   if not isinstance(title,str) or not title.strip() or len(title)>150 or not isinstance(body,str) or not body.strip() or len(body)>5000:raise ValueError('Title and content required')
   if kind=='calendar':datetime.date.fromisoformat(date)
   else:date=''
   key=str(uuid.uuid4());db.execute('INSERT INTO hub_records VALUES(?,?,?,?,?,?,?,?,?,?)',(key,course,kind,ctx['user'],title.strip(),body.strip(),date,'active',1,time.time()))
  elif action in ['reply','resolve','reopen']:
   if kind!='help':raise ValueError('Support operation required')
   key=data.get('id');row=db.execute('SELECT * FROM hub_records WHERE id=? AND course=? AND kind=?',(key,course,kind)).fetchone()
   if not row or not allowed(row):raise Denied('Record unavailable')
   if type(data.get('version')) is not int:raise ValueError('Version required')
   if action=='resolve' and ctx['role']!='instructor':raise Denied('Instructor resolution required')
   if action=='reply':
    body=data.get('body')
    if not isinstance(body,str) or not 1<=len(body.strip())<=5000:raise ValueError('Reply text required')
    if row['state']!='active':raise Conflict('Reopen the request before replying')
   elif action=='resolve' and row['state']!='active':raise Conflict('Request is not active')
   elif action=='reopen' and row['state']!='resolved':raise Conflict('Request is not resolved')
   state='resolved' if action=='resolve' else 'active'
   changed=db.execute('UPDATE hub_records SET state=?,version=version+1 WHERE id=? AND version=?',(state,key,data['version']))
   if changed.rowcount!=1:raise Conflict('Record changed; refresh first')
   if action=='reply':db.execute('INSERT INTO support_replies VALUES(?,?,?,?,?,?)',(str(uuid.uuid4()),key,ctx['user'],ctx['role'],body.strip(),time.time()))
   elif action=='resolve':db.execute('INSERT INTO support_resolution VALUES(?,?,?) ON CONFLICT(record) DO UPDATE SET resolved=excluded.resolved,resolver=excluded.resolver',(key,time.time(),ctx['user']))
  elif action=='archive':
   key=data.get('id');row=db.execute('SELECT * FROM hub_records WHERE id=? AND course=? AND kind=?',(key,course,kind)).fetchone()
   if not row or not allowed(row) or not(row['owner']==ctx['user'] or kind=='help' and ctx['role']=='instructor'):raise Denied('Record unavailable')
   if type(data.get('version')) is not int:raise ValueError('Version required')
   changed=db.execute("UPDATE hub_records SET state=?,version=version+1 WHERE id=? AND version=?",('active' if data.get('restore') is True else 'archived',key,data['version']))
   if changed.rowcount!=1:raise Conflict('Record changed; refresh first')
  else:raise ValueError('Unknown operation')
  db.execute('INSERT INTO outbox VALUES(?,?)',(str(uuid.uuid4()),json.dumps({'timestamp':time.time(),'tenant_id':tenant,'course_id':course,'user_id':ctx['user'],'decision_code':kind+'.'+action,'record_id':key})))
  return {'id':key,'saved':True}
