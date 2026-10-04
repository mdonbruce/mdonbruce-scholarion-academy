"""Course-scoped versioned curriculum commons with explicit draft program pins."""
import json,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 if ctx['role']!='instructor':raise Denied('Instructor required')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  db.executescript('''
CREATE TABLE IF NOT EXISTS commons_versions(scope_course TEXT,module TEXT,version INTEGER,title TEXT,body TEXT,programs TEXT,author TEXT,created REAL,PRIMARY KEY(scope_course,module,version));
CREATE TABLE IF NOT EXISTS commons_pin_history(scope_course TEXT,program INTEGER,module TEXT,version INTEGER,revision INTEGER,author TEXT,created REAL,PRIMARY KEY(scope_course,program,module,revision));
CREATE TRIGGER IF NOT EXISTS commons_history_no_update BEFORE UPDATE ON commons_pin_history BEGIN SELECT RAISE(ABORT,'Immutable pin history'); END;
CREATE TRIGGER IF NOT EXISTS commons_history_no_delete BEFORE DELETE ON commons_pin_history BEGIN SELECT RAISE(ABORT,'Immutable pin history'); END;
CREATE TABLE IF NOT EXISTS commons_pins(scope_course TEXT,program INTEGER,module TEXT,version INTEGER,revision INTEGER,author TEXT,created REAL,PRIMARY KEY(scope_course,program,module));
CREATE TRIGGER IF NOT EXISTS commons_versions_no_update BEFORE UPDATE ON commons_versions BEGIN SELECT RAISE(ABORT,'Immutable module version'); END;
CREATE TRIGGER IF NOT EXISTS commons_versions_no_delete BEFORE DELETE ON commons_versions BEGIN SELECT RAISE(ABORT,'Immutable module version'); END;
''')
  if action=='load':
   modules=json.loads((ROOT/'dist/data/consolidation.json').read_text(encoding='utf-8'))['modules']
   db.execute('BEGIN IMMEDIATE')
   for m in modules:db.execute('INSERT OR IGNORE INTO commons_versions VALUES(?,?,?,?,?,?,?,?)',(course,m['id'],1,m['title'],'Source-derived mapping only. Add original lesson design, assessed outcomes and evidence references before academic review.',json.dumps(m['programs']),ctx['user'],time.time()))
   service.emit(db,ctx,'commons.drafts.loaded',course=course)
   return {'loaded':len(modules),'published':False}
  if action=='list':
   return {'modules':[dict(r,programs=json.loads(r['programs'])) for r in db.execute('SELECT * FROM commons_versions WHERE scope_course=? ORDER BY module,version DESC',(course,))],'pins':[dict(r) for r in db.execute('SELECT * FROM commons_pins WHERE scope_course=? ORDER BY program,module',(course,))],'published':False}
  key=data.get('module');version=data.get('version')
  if not isinstance(key,str) or type(version) is not int or version<1:raise ValueError('Module and positive version required')
  db.execute('BEGIN IMMEDIATE')
  row=db.execute('SELECT * FROM commons_versions WHERE scope_course=? AND module=? AND version=?',(course,key,version)).fetchone()
  if not row:raise Denied('Module version unavailable in this course')
  if action=='revise':
   latest=db.execute('SELECT max(version) FROM commons_versions WHERE scope_course=? AND module=?',(course,key)).fetchone()[0]
   if version!=latest:raise Conflict('Module changed; reload the latest version')
   title=data.get('title');body=data.get('body')
   if not isinstance(title,str) or not 1<=len(title.strip())<=200 or not isinstance(body,str) or not 1<=len(body.strip())<=12000:raise ValueError('Bounded title and original design text required')
   db.execute('INSERT INTO commons_versions VALUES(?,?,?,?,?,?,?,?)',(course,key,version+1,title.strip(),body.strip(),row['programs'],ctx['user'],time.time()))
   service.emit(db,ctx,'commons.version.created',course=course)
   return {'version':version+1,'existingPinsChanged':False,'published':False}
  if action=='pin':
   program=data.get('program');revision=data.get('revision')
   if type(program) is not int or program not in range(1,26) or program not in json.loads(row['programs']) or type(revision) is not int or revision<0:raise ValueError('Program mapping or pin revision invalid')
   # A curriculum draft must exist; this is not an enrollment or live-cohort mutation.
   if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='program_shell_versions'").fetchone() or not db.execute('SELECT 1 FROM program_shell_versions WHERE scope_course=? AND program=?',(course,program)).fetchone():raise ValueError('Load the program design shell first')
   db.execute('INSERT OR IGNORE INTO commons_pins VALUES(?,?,?,?,?,?,?)',(course,program,key,version,0,ctx['user'],time.time()))
   changed=db.execute('UPDATE commons_pins SET version=?,revision=revision+1,author=?,created=? WHERE scope_course=? AND program=? AND module=? AND revision=?',(version,ctx['user'],time.time(),course,program,key,revision))
   if changed.rowcount!=1:raise Conflict('Program pin changed; reload first')
   db.execute('INSERT INTO commons_pin_history VALUES(?,?,?,?,?,?,?)',(course,program,key,version,revision+1,ctx['user'],time.time()))
   service.emit(db,ctx,'commons.program.pinned',sources=[key+':v'+str(version),'program:'+str(program)],course=course)
   return {'version':version,'revision':revision+1,'published':False}
  raise ValueError('Unknown operation; module publication is disabled')
