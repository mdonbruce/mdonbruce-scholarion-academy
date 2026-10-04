"""Course-scoped catalog review drafts; cannot publish or issue credentials."""
import json,re,time,uuid,unicodedata

def findings(title,body):
 text=unicodedata.normalize('NFKC',title+' '+body)
 return sorted(set(m.group(0).lower() for m in re.finditer(r'\b(?:accredit\w*|PG|degrees?|universit\w*|partners?\w*|guaranteed\s+(?:employment|job|credit))\b',text,re.I)))

def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 if ctx['role']!='instructor':raise Denied('Instructor review required')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.execute('CREATE TABLE IF NOT EXISTS catalog_reviews(id TEXT PRIMARY KEY,course TEXT,owner TEXT,title TEXT,body TEXT,findings TEXT,created REAL)')
  if action=='list':return {'records':[dict(r,findings=json.loads(r['findings'])) for r in db.execute('SELECT * FROM catalog_reviews WHERE course=? ORDER BY created DESC LIMIT 100',(course,))],'publicationEnabled':False}
  if action!='review':raise ValueError('Unknown operation; publication disabled')
  title=data.get('title');body=data.get('body')
  if not isinstance(title,str) or not 1<=len(title.strip())<=200 or not isinstance(body,str) or not 1<=len(body.strip())<=8000:raise ValueError('Title and bounded copy required')
  issues=findings(title,body);key=str(uuid.uuid4())
  db.execute('INSERT INTO catalog_reviews VALUES(?,?,?,?,?,?,?)',(key,course,ctx['user'],title.strip(),body.strip(),json.dumps(issues),time.time()))
  service.emit(db,ctx,'catalog.claims.blocked' if issues else 'catalog.claims.reviewed',course=course)
  return {'id':key,'findings':issues,'status':'BLOCKED' if issues else 'REQUIRES HUMAN REVIEW','published':False,'note':'Conservative phrase check only; absence of findings does not verify claims. No approved-claim exception registry is configured.'}
