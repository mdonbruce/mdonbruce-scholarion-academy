"""Self-reported setup and privacy-minimized local support; not proctor approval."""
import json,time,uuid

CHECKS=['Current government-issued photo ID ready','Webcam shows face, hands and workspace','Microphone working and on','Unapproved devices removed; no music','No smart glasses','Head/face mouse-control conflict referred for accommodations','No copying or pasting assessment content','Appropriate attire','Platform system check completed']
ANSWERS={
 'Webcam':"You'll need a webcam view that clearly shows your face, hands, and workspace for the whole assessment. Depending on your setup, you may need to raise the camera using a tripod, stand, or another stable method. It's a good idea to test your camera position before test day so you can adjust it without pressure.",
 'Valid ID':"The supplied guidance requires a current government-issued photo ID; expired IDs cannot be accepted. If yours will be expired on test day, request support as soon as possible. Do not upload your ID here.",
 'Testing area':"Unapproved devices need to be removed from your testing area. Please check the Assessment Policy for which items are approved. Keep your microphone on, remove smart glasses, avoid music and wear appropriate attire.",
 'Highlighting':"Yes. You can highlight assessment content when highlighting is available as an approved tool in the testing platform. Copying or pasting assessment content isn't allowed.",
 'Accessibility':"If assistive technology or camera positioning conflicts with these expectations, seek an accommodations review well before your assessment. You do not need to share a diagnosis or medical details here. This helper cannot approve or deny accommodations.",
 'Expired ID':"Please request support as soon as possible if you will not have a current government-issued photo ID before your assessment. This helper cannot grant an exception.",
 'Technical limitation':"If your camera cannot show your face, hands and workspace, request setup support before test day. This helper cannot approve an alternative setup.",
 'Incident or results':"I understand assessment concerns can be stressful. I cannot discuss specific incidents, flags, investigations or results. Request staff support without entering assessment content here.",
 'Exception':"This helper cannot grant exceptions or waivers. You can request staff support for next steps.",
 'Policy changes':"The full institutional policy and its effective dates have not been configured in this pilot. I cannot verify policy changes or speculate about future rules. Please request staff clarification.",
 'Other question':"I do not have an approved answer for that topic. Please request staff clarification; do not include assessment content, ID images, ID numbers or medical information."}

def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.execute('CREATE TABLE IF NOT EXISTS assessment_setup(owner TEXT,course TEXT,checks TEXT,revision INTEGER,PRIMARY KEY(owner,course))')
  db.execute('CREATE TABLE IF NOT EXISTS assessment_requests(owner TEXT,course TEXT,request_key TEXT,topic TEXT,ticket TEXT,PRIMARY KEY(owner,course,request_key))')
  if action=='get':
   row=db.execute('SELECT * FROM assessment_setup WHERE owner=? AND course=?',(ctx['user'],course)).fetchone()
   return {'items':CHECKS,'answers':ANSWERS,'checks':json.loads(row['checks']) if row else [],'revision':row['revision'] if row else 0,'approved':False,'guidanceStatus':'Draft supplied guidance; institutional review and full policy configuration pending','policyConfigured':False,'externalForwarding':False,'responseSLA':None}
  if action=='save':
   checks=data.get('checks');revision=data.get('revision')
   if not isinstance(checks,list) or any(type(x) is not int or not 0<=x<len(CHECKS) for x in checks) or len(set(checks))!=len(checks) or type(revision) is not int or revision<0:raise ValueError('Invalid checklist or revision')
   db.execute('INSERT OR IGNORE INTO assessment_setup VALUES(?,?,?,0)',(ctx['user'],course,'[]'))
   changed=db.execute('UPDATE assessment_setup SET checks=?,revision=revision+1 WHERE owner=? AND course=? AND revision=?',(json.dumps(checks),ctx['user'],course,revision))
   if changed.rowcount!=1:raise Conflict('Readiness changed; refresh before saving')
   service.emit(db,ctx,'assessment.setup.saved',course=course)
   return {'revision':revision+1,'saved':True,'approved':False}
  if action=='escalate':
   topic=data.get('topic');key=data.get('requestKey')
   if topic not in ANSWERS or not isinstance(key,str) or len(key)>64:raise ValueError('Choose a supported topic and request ID')
   try:uuid.UUID(key)
   except ValueError:raise ValueError('Invalid request ID')
   old=db.execute('SELECT * FROM assessment_requests WHERE owner=? AND course=? AND request_key=?',(ctx['user'],course,key)).fetchone()
   if old:
    if old['topic']!=topic:raise Conflict('Request ID already used for another topic')
    return {'id':old['ticket'],'saved':True,'externalForwarded':False}
   db.execute('CREATE TABLE IF NOT EXISTS hub_records(id TEXT PRIMARY KEY,course TEXT,kind TEXT,owner TEXT,title TEXT,body TEXT,event_date TEXT,state TEXT,version INTEGER,created REAL)')
   ticket=str(uuid.uuid4())
   db.execute('INSERT INTO hub_records VALUES(?,?,?,?,?,?,?,?,?,?)',(ticket,course,'help',ctx['user'],'Assessment setup: '+topic,'Learner requested staff guidance on '+topic+'. No free-text question or sensitive details were collected.','','active',1,time.time()))
   db.execute('INSERT INTO assessment_requests VALUES(?,?,?,?,?)',(ctx['user'],course,key,topic,ticket))
   service.emit(db,ctx,'assessment.support.requested',course=course)
   return {'id':ticket,'saved':True,'externalForwarded':False}
  raise ValueError('Unknown assessment support operation')
