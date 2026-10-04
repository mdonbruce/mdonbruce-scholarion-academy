"""Role-scoped metrics calculated from stored pilot records, never sample counts."""
import time
from lms_service import visible_grade
def snapshot(service,token,tenant,course,Denied):
 ctx=service.identity(token,tenant)
 if tenant!='scholarion':raise Denied('Scholarion only')
 with service.connect(tenant) as db:
  courses=[r['course'] for r in db.execute("SELECT course FROM enrollments WHERE user=? AND role=? AND status='active' ORDER BY course",(ctx['user'],ctx['role']))]
  records=[];assigned=[];events=[];tickets=[]
  has_hub=db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='hub_records'").fetchone()
  for code in courses:
   assigned.extend(dict(r) for r in db.execute('SELECT id,course,title FROM assignments WHERE course=? AND published=1',(code,)))
   rows=db.execute('SELECT s.id,s.assignment,s.user,s.created,a.course,a.title FROM submissions s JOIN assignments a ON a.id=s.assignment WHERE a.course=? AND (s.user=? OR ?=?) ORDER BY s.created DESC',(code,ctx['user'],ctx['role'],'instructor'))
   for r in rows:
    item=dict(r);grade=visible_grade(db,r['id'],ctx['role'])
    item['grade']=dict(grade) if grade and (ctx['role']=='instructor' or grade['posted']) else None
    records.append(item)
   if has_hub:
    events.extend(dict(r) for r in db.execute("SELECT id,title,event_date,course FROM hub_records WHERE course=? AND kind='calendar' AND owner=? AND state='active' ORDER BY event_date",(code,ctx['user'])))
    tickets.extend(dict(r) for r in db.execute("SELECT id,title,state,created,course FROM hub_records WHERE course=? AND kind='help' AND (owner=? OR ?=?) ORDER BY created DESC",(code,ctx['user'],ctx['role'],'instructor')))
  submitted={r['assignment'] for r in records}
  metrics=[{'name':'Active courses','value':len(courses),'calculation':'Active enrollment rows for your authenticated account.','href':'#live-courses'},
   {'name':'Submission receipts','value':len(records),'calculation':'Stored submission receipts, including repeat attempts, in authorized courses.','href':'#assignments'},
   {'name':'Active support requests','value':sum(t['state']=='active' for t in tickets),'calculation':'Visible help records whose state is active; archived does not mean resolved.','href':'#help'}]
  if ctx['role']=='student':metrics.append({'name':'Assignments without a submission','value':sum(a['id'] not in submitted for a in assigned),'calculation':'Published assignments with no receipt from your account. This is not an overdue count.','href':'#assignments'})
  else:metrics.append({'name':'Receipts awaiting a grade','value':sum(r['grade'] is None for r in records),'calculation':'Submission receipts without any grade version; includes earlier attempts.','href':'#grades'})
  return {'demo':True,'as_of':time.time(),'user':ctx['user'],'role':ctx['role'],'courses':courses,'metrics':metrics,'assignments':assigned,'submissions':records,'calendar':sorted(events,key=lambda e:e['event_date']),'tickets':tickets,'unavailable':['Course completion and outcome mastery: completion records not connected','Upcoming academic deadlines: assignment due dates not stored','Support response time and resolution rate: reply/resolution timestamps not stored','AI predictions, SIS drift and revenue: corresponding services not connected']}
