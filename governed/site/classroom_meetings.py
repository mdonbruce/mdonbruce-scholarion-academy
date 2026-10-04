import time,uuid
from urllib.parse import urlsplit

def command(service,token,tenant,course,action,data,Denied):
 ctx=service.identity(token,tenant)
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.execute('CREATE TABLE IF NOT EXISTS classroom_meetings(id TEXT PRIMARY KEY,course TEXT,title TEXT,provider TEXT,url TEXT,starts TEXT,active INTEGER,author TEXT)')
  if action=='list':return {'role':ctx['role'],'meetings':[dict(r) for r in db.execute('SELECT id,title,provider,url,starts FROM classroom_meetings WHERE course=? AND active=1 ORDER BY starts',(course,))]}
  if ctx['role']!='instructor':raise Denied('Course instructor required')
  if action=='add':
   provider=data.get('provider');url=str(data.get('url',''));parsed=urlsplit(url);host=parsed.hostname or '';domain={'zoom':'zoom.us','webex':'webex.com'}.get(provider)
   if not domain or parsed.scheme!='https' or parsed.username or parsed.password or parsed.port not in [None,443] or not(host==domain or host.endswith('.'+domain)):raise ValueError('Use a valid HTTPS Zoom or Webex meeting link')
   title=str(data.get('title','')).strip();starts=str(data.get('starts','')).strip()
   from datetime import datetime
   dt=datetime.fromisoformat(starts.replace('Z','+00:00'))
   if not dt.tzinfo or not 1<=len(title)<=150 or len(url)>2000:raise ValueError('A title and timezone-aware start time are required')
   key=str(uuid.uuid4());db.execute('INSERT INTO classroom_meetings VALUES(?,?,?,?,?,?,1,?)',(key,course,title,provider,url,dt.isoformat(),ctx['user']))
  elif action=='remove':
   key=data.get('id');db.execute('UPDATE classroom_meetings SET active=0 WHERE id=? AND course=?',(key,course))
  else:raise ValueError('Unknown meeting action')
  service.emit(db,ctx,'classroom.meeting.'+action,sources=[key],course=course);return {'saved':True}
