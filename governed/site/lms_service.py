import json,time,uuid,math

def visible_grade(db,submission,role):
 latest=db.execute('SELECT * FROM grade_versions WHERE submission=? ORDER BY version DESC LIMIT 1',(submission,)).fetchone()
 if role=='instructor':return latest
 publication=db.execute('SELECT version FROM grade_publications WHERE submission=?',(submission,)).fetchone()
 if publication is None:return latest if latest and latest['posted'] else None
 return db.execute('SELECT * FROM grade_versions WHERE submission=? AND version=?',(submission,publication['version'])).fetchone()

def initialize(service,root):
 for tenant in ['scholarion']:
  with service.connect(tenant) as db:
   db.executescript((root/'migrations/002_coursework.sql').read_text())
   db.execute('INSERT OR IGNORE INTO assignments VALUES(?,?,?,?,?)',('AIM310-evidence','AIM310','Workflow evidence review','Describe a baseline, an approval boundary and two failure tests. Include measured results and limitations. Use synthetic data only.',1))

def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 with service.connect(tenant) as db:
  db.execute('BEGIN IMMEDIATE')
  service.membership(db,ctx,course)
  def event(kind,record):
   db.execute('INSERT INTO outbox VALUES(?,?)',(str(uuid.uuid4()),json.dumps({'timestamp':time.time(),'tenant_id':tenant,'course_id':course,'user_id':ctx['user'],'decision_code':kind,'record_id':record})))
  def authorized_submission(key):
   row=db.execute('SELECT s.* FROM submissions s JOIN assignments a ON a.id=s.assignment WHERE s.id=? AND a.course=?',(key,course)).fetchone()
   if not row or (ctx['role']!='instructor' and row['user']!=ctx['user']):raise Denied('Submission unavailable')
   return row
  if action=='list':
   assignments=[dict(r) for r in db.execute('SELECT * FROM assignments WHERE course=? AND (published=1 OR ?=?)',(course,ctx['role'],'instructor'))]
   rows=db.execute('SELECT s.* FROM submissions s JOIN assignments a ON a.id=s.assignment WHERE a.course=? AND (s.user=? OR ?=?) ORDER BY s.created DESC',(course,ctx['user'],ctx['role'],'instructor')).fetchall()
   submissions=[]
   for r in rows:
    item=dict(r);g=visible_grade(db,r['id'],ctx['role'])
    item['grade']=dict(g) if g and (ctx['role']=='instructor' or g['posted']) else None
    submissions.append(item)
   return {'role':ctx['role'],'assignments':assignments,'submissions':submissions}
  if action=='submit':
   if ctx['role']!='student':raise Denied('Student identity required')
   assignment=data.get('assignment');body=data.get('body');key=data.get('request_key')
   if not isinstance(body,str) or not body.strip() or len(body)>10000 or not isinstance(key,str) or not 8<=len(key)<=100:raise ValueError('Invalid submission')
   a=db.execute('SELECT id FROM assignments WHERE id=? AND course=? AND published=1',(assignment,course)).fetchone()
   if not a:raise Denied('Assignment unavailable')
   old=db.execute('SELECT * FROM submissions WHERE user=? AND assignment=? AND request_key=?',(ctx['user'],assignment,key)).fetchone()
   if old:
    if old['body']!=body.strip():raise Conflict('Request key already used for different content')
    return dict(old)
   ident=str(uuid.uuid4());db.execute('INSERT INTO submissions VALUES(?,?,?,?,?,?)',(ident,assignment,ctx['user'],body.strip(),time.time(),key));event('submission_received',ident)
   return dict(db.execute('SELECT * FROM submissions WHERE id=?',(ident,)).fetchone())
  if action in ['grade','post','history']:
   if ctx['role']!='instructor':raise Denied('Instructor identity required')
   row=authorized_submission(data.get('submission'))
   old=db.execute('SELECT * FROM grade_versions WHERE submission=? ORDER BY version DESC LIMIT 1',(row['id'],)).fetchone()
   if action=='history':return [dict(r) for r in db.execute('SELECT * FROM grade_versions WHERE submission=? ORDER BY version',(row['id'],))]
   current=old['version'] if old else 0
   if type(data.get('version')) is not int or data['version']!=current:raise Conflict('Grade changed; refresh before editing')
   if action=='grade':
    # Preserve the existing public version when editing legacy records as well.
    db.execute('INSERT OR IGNORE INTO grade_publications VALUES(?,?)',(row['id'],old['version'] if old and old['posted'] else None))
    score=data.get('score');feedback=data.get('feedback')
    if type(score) not in [int,float] or not math.isfinite(score) or not 0<=score<=100 or not isinstance(feedback,str) or not feedback.strip() or len(feedback)>5000:raise ValueError('Invalid grade')
    posted=0
   else:
    if not old or type(data.get('posted')) is not bool:raise ValueError('Save a grade first')
    score=old['score'];feedback=old['feedback'];posted=int(data['posted'])
   db.execute('INSERT INTO grade_versions VALUES(?,?,?,?,?,?,?)',(row['id'],current+1,score,feedback,posted,ctx['user'],time.time()));event('grade_'+action,row['id'])
   if action=='post':db.execute('INSERT INTO grade_publications VALUES(?,?) ON CONFLICT(submission) DO UPDATE SET version=excluded.version',(row['id'],current+1 if posted else None))
   return {'version':current+1,'posted':bool(posted)}
  raise ValueError('Unknown coursework operation')
