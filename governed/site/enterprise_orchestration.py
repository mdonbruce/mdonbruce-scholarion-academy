"""Local deterministic orchestration. External actions and delivery remain disconnected."""
import json,re,time,uuid,hashlib
import engagement_policy
GATES={
 'registration':['verified_identity','active_student','open_window','no_holds','prerequisites_met','capacity_or_waitlist_consent','no_schedule_conflict','exact_selection_confirmed'],
 'payment':['verified_identity','active_student','verified_billed_amount','secure_payment_component','amount_and_method_confirmed'],
 'withdrawal':['verified_identity','verified_grade_impact','verified_refund_impact','verified_aid_impact','exact_selection_confirmed'],
 'record_change':['verified_identity','own_record','exact_change_confirmed']}
TOPICS=[('registration',r'register|registration|section|waitlist'),('payment',r'pay|tuition|balance|billing'),('withdrawal',r'withdraw|drop (?:a |my |the )?(?:class|course)'),('record_change',r'change.*address|update.*record'),('admissions',r'admission|apply|application'),('learning',r'course|module|assignment|study|baseline'),('career',r'career|internship|placement')]
ESCALATIONS=[('safety',r'self.harm|suicid|kill myself|hurt myself|harm.*others|security threat'),('complaint',r'legal|lawyer|attorney|formal complaint|grade appeal|harass|discrimination|misconduct|vulnerability'),('financial_dispute',r'chargeback|fraud|payment dispute'),('records_disclosure',r'(share|release|disclose).*(student records|transcript).*(third party|someone else)'),('human_requested',r'\bhuman\b|speak.*person|care specialist')]
def initialize(service):
 for tenant in ['scholarion']:
  with service.connect(tenant) as db:db.executescript('''
CREATE TABLE IF NOT EXISTS orchestration_sessions(id TEXT PRIMARY KEY,user TEXT NOT NULL,course TEXT NOT NULL,clarifications INTEGER NOT NULL,state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS care_cases(id TEXT PRIMARY KEY,session TEXT NOT NULL,user TEXT NOT NULL,trigger TEXT NOT NULL,state TEXT NOT NULL,created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS orchestration_trace(id TEXT PRIMARY KEY,session TEXT NOT NULL,metadata TEXT NOT NULL);
''')
def turn(service,token,tenant,course,data,Denied):
 ctx=service.identity(token,tenant)
 if tenant!='scholarion':raise Denied('Scholarion only')
 question=data.get('question');channel=data.get('channel','chat')
 if not isinstance(question,str) or not question.strip() or len(question)>4000 or channel not in ['chat','voice']:raise ValueError('Invalid turn')
 with service.connect(tenant) as db:
  db.execute('BEGIN IMMEDIATE');service.membership(db,ctx,course)
  sid=data.get('session')
  if sid:
   s=db.execute('SELECT * FROM orchestration_sessions WHERE id=? AND user=? AND course=?',(sid,ctx['user'],course)).fetchone()
   if not s:raise Denied('Session unavailable')
  else:
   sid=str(uuid.uuid4());db.execute('INSERT INTO orchestration_sessions VALUES(?,?,?,?,?)',(sid,ctx['user'],course,0,'active'));s=db.execute('SELECT * FROM orchestration_sessions WHERE id=?',(sid,)).fetchone()
  text=question.lower();trigger=next((name for name,pattern in ESCALATIONS if re.search(pattern,text)),None)
  topic=next((name for name,pattern in TOPICS if re.search(pattern,text)),None)
  # Never log or forward raw chat, even when the source requests full transcripts.
  safe=re.sub(r'\b(?:\d[ -]?){13,19}\b','[payment-data]',question)
  result={'session':sid,'executed':False,'channel':channel,'clarifications':s['clarifications'],'topic':topic or 'clarification','gate_results':[]}
  if engagement_policy.outside_scope(question):result.update(outcome='scope_redirect',message=engagement_policy.REDIRECT)
  elif s['state']=='handoff':
   case=db.execute('SELECT id FROM care_cases WHERE session=?',(sid,)).fetchone();result.update(outcome='queued',case_id=case['id'],message='Your local review request is queued. Live CARE delivery is not connected.')
  elif safe!=question and not trigger:result.update(outcome='payment_data_refused',message='Do not enter card or bank details in chat. A verified secure payment component is required; payments are not connected.')
  elif trigger or (not topic and s['clarifications']>=2):
   trigger=trigger or 'clarification_limit';key=str(uuid.uuid4());db.execute('INSERT INTO care_cases VALUES(?,?,?,?,?,?)',(key,sid,ctx['user'],trigger,'queued_local',time.time()));db.execute("UPDATE orchestration_sessions SET state='handoff' WHERE id=?",(sid,));result.update(outcome='queued',case_id=key,message='A local human-review request has been recorded. Live CARE delivery is not connected; no specialist has been notified.')
  elif re.search(r'accredit|federal aid|fafsa|approved degree',text):result.update(outcome='unverified_status',message='Scholarion Academy is a demonstration catalog. Accreditation, degree approval and federal-aid eligibility are not represented as live verified statuses.')
  elif topic in GATES:
   # Facts are NOT accepted from request JSON or conversational assertions.
   result['gate_results']=[{'condition':name,'passed':False,'reason':'Authoritative connector evidence unavailable'} for name in GATES[topic]]
   result.update(outcome='blocked',message='This action is blocked until authoritative records and confirmation are verified. No records or payments changed.')
  elif not topic:
   count=s['clarifications']+1;db.execute('UPDATE orchestration_sessions SET clarifications=? WHERE id=?',(count,sid));result.update(outcome='clarify',clarifications=count,message='Is your request about admissions, registration, payments, learning support, or career support?')
  else:result.update(outcome='route_ready',message='Your request is classified for '+topic+' support. The specialist connector is not connected; no external action occurred.')
  if channel=='voice' and result['outcome']=='clarify':result['message']='Which service do you need help with?'
  result=engagement_policy.validate_output(result)
  trace={'output_policy_blocked':result['output_policy_blocked'],'policy_version':result['policy_version'],'timestamp':time.time(),'tenant_id':tenant,'user_id':ctx['user'],'session_id':sid,'course_id':course,'prompt_hash':hashlib.sha256(safe.encode()).hexdigest(),'topic':result['topic'],'gate_results':result['gate_results'],'clarification_count':result['clarifications'],'escalation_trigger':trigger,'outcome':result['outcome'],'model_version':'deterministic-router-v1','actions_invoked':[],'sources':[]}
  payload=json.dumps(trace);db.execute('INSERT INTO orchestration_trace VALUES(?,?,?)',(str(uuid.uuid4()),sid,payload));db.execute('INSERT INTO outbox VALUES(?,?)',(str(uuid.uuid4()),payload))
  return result
def cases(service,token,tenant,course,Denied):
 ctx=service.identity(token,tenant)
 if tenant!='scholarion':raise Denied('Scholarion only')
 if ctx['role']!='instructor':raise Denied('Staff identity required')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  return [dict(r) for r in db.execute('SELECT c.* FROM care_cases c JOIN orchestration_sessions s ON s.id=c.session WHERE s.course=? ORDER BY c.created DESC LIMIT 50',(course,))]

