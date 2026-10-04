"""Operator-only SQLite snapshot and isolated restore drill. Never replaces live data."""
import argparse,hashlib,json,sqlite3,time,uuid
from contextlib import closing
from pathlib import Path

def digest(path):
 with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def readonly(path):return sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True)

def verify(db):
 if db.execute('PRAGMA integrity_check').fetchall()!=[('ok',)]:raise ValueError('Database integrity check failed')
 if db.execute('PRAGMA foreign_key_check').fetchall():raise ValueError('Foreign key check failed')
 tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
 counts={t:db.execute('SELECT count(*) FROM "'+t.replace('"','""')+'"').fetchone()[0] for t in tables}
 return counts

def backup(root):
 root=Path(root).resolve();source=root/'scholarion.sqlite3'
 if not source.is_file() or source.is_symlink():raise ValueError('Academy database required')
 recovery=root/'recovery'
 if recovery.is_symlink():raise ValueError('Recovery directory must not be a link')
 recovery.mkdir(exist_ok=True);folder=recovery/str(uuid.uuid4());folder.mkdir()
 target=folder/'snapshot.sqlite3'
 with closing(readonly(source)) as src,closing(sqlite3.connect(target)) as dst:
  src.backup(dst);counts=verify(dst)
 manifest={'version':1,'id':folder.name,'created':time.time(),'sha256':digest(target),'tables':counts,'scope':'Academy SQLite only; excludes identities, files, secrets and external services'}
 (folder/'manifest.json').write_text(json.dumps(manifest,indent=2))
 return folder.name

def drill(root,key):
 root=Path(root).resolve()
 if str(uuid.UUID(key))!=key:raise ValueError('Invalid snapshot ID')
 folder=root/'recovery'/key
 if folder.resolve()!=folder or (folder/'snapshot.sqlite3').is_symlink() or (folder/'manifest.json').is_symlink():raise ValueError('Snapshot path must not be a link')
 manifest=json.loads((folder/'manifest.json').read_text());source=folder/'snapshot.sqlite3'
 if manifest.get('version')!=1 or manifest.get('id')!=key or digest(source)!=manifest.get('sha256'):raise ValueError('Snapshot manifest or checksum mismatch')
 started=time.monotonic();run=folder/('drill-'+str(uuid.uuid4()));run.mkdir();target=run/'restored.sqlite3'
 with closing(readonly(source)) as src,closing(sqlite3.connect(target)) as dst:
  src.backup(dst);counts=verify(dst)
  if counts!=manifest['tables']:raise ValueError('Restored row counts differ from snapshot')
 report={'status':'PASSED','snapshotId':key,'snapshotCreated':manifest['created'],'checkedAt':time.time(),'elapsedSeconds':round(time.monotonic()-started,3),'integrity':'ok','foreignKeys':'ok','rowCountsMatch':True,'productionRestore':False,'scope':manifest['scope'],'limits':'Local snapshot drill only; not point-in-time recovery, encrypted backup, off-site durability or full application disaster recovery. Checksum is not an external authenticity anchor.'}
 (run/'result.json').write_text(json.dumps(report,indent=2))
 latest=root/'recovery'/'latest.json'
 if latest.is_symlink():raise ValueError('Invalid report location')
 temp=latest.with_name(str(uuid.uuid4())+'.json');temp.write_text(json.dumps(report,indent=2));temp.replace(latest)
 return report

def status(root):
 path=Path(root)/'recovery'/'latest.json'
 if not path.is_file():return {'status':'NOT RUN','productionRestore':False}
 try:
  raw=json.loads(path.read_text())
  # Never expose paths, table names, learner data or arbitrary local fields.
  return {k:raw[k] for k in ['status','snapshotCreated','checkedAt','elapsedSeconds','integrity','foreignKeys','rowCountsMatch','productionRestore','scope','limits']}
 except (ValueError,KeyError,OSError):return {'status':'INVALID REPORT','productionRestore':False}

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--data',default=str(Path(__file__).parent/'private-governed'));parser.add_argument('action',choices=['backup','drill','backup-and-drill']);parser.add_argument('--snapshot');args=parser.parse_args()
 if args.action=='backup':print(backup(args.data))
 else:print(json.dumps(drill(args.data,backup(args.data) if args.action=='backup-and-drill' else args.snapshot),indent=2))
