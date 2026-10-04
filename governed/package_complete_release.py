from pathlib import Path
import hashlib, json, subprocess, zipfile

ROOT = Path(__file__).resolve().parent
TARGET = ROOT / 'Scholarion-Academy-complete-source-2026-10-04.zip'
BLOCKED = {'private-governed', '.git', 'node_modules', '__pycache__', '.pytest_cache', '.wrangler', '.venv'}

def allowed(path):
    return not any(p in BLOCKED for p in path.parts) and not (
        path.name.startswith('.env') and not path.name.endswith(('.example', '.sample'))
    ) and path.suffix.lower() not in {'.sqlite', '.sqlite3', '.db', '.key', '.pem', '.pyc'} and path.name not in {'identities.json', 'account-bootstrap.txt'}

readme = '''Scholarion Academy — complete development source, 2026-10-04

This bundle contains the current development application, assets, curriculum
packages, tests and review reports. Complete source does not mean every planned
external service or production feature is implemented.

Run Scholarion locally (Python 3.12 or newer):
  cd site
  python -m pip install cryptography Pillow python-docx python-pptx reportlab
  python governed_service.py
Open http://127.0.0.1:4180/#workspace-session

On first run, read site/private-governed/account-bootstrap.txt locally and use
First Super Admin setup. Choose your own username/password and configure an
authenticator for two-factor authentication. No existing accounts, passwords,
session data, private keys or learner records are included in this download.
Local pilot-token login is disabled. Account actions belong on the account page.

HavenConnect's current integration source is in integrations/HavenConnect-current.
It is a separate application; follow its own README and package.json. Its Zoom
and Webex connections require provider configuration. Scholarion currently lets
instructors publish meeting links for enrolled students; automatic cross-app
meeting synchronization is not complete. Genesys remains disabled.

Preserve site/.openai/hosting.json: it identifies Scholarion. Never replace it
with the HavenConnect hosting configuration in the integrations folder.

This bundle is not a production deployment. Hosted model configuration, isolated
lab execution dependencies and some media workflows still require setup; consult
site/STUDIO-BUILD-STATUS.txt and the feature review reports for limitations.
Older review documents describe historical releases; this file and current code
take precedence for packaging and account setup.
'''

files = [(p, p.relative_to(ROOT).as_posix()) for p in (ROOT / 'site').rglob('*') if p.is_file() and allowed(p.relative_to(ROOT))]
haven = ROOT / 'integrations/HavenConnect-current'
tracked = subprocess.check_output(['git', '-C', str(haven), 'ls-files', '-z']).decode().split('\0')
files += [(haven / n, 'integrations/HavenConnect-current/' + n) for n in tracked if n and (haven / n).is_file() and allowed(Path(n))]
files.append((Path(__file__), 'package_complete_release.py'))
manifest = {'created': '2026-10-04', 'productionDeployment': False, 'files': []}
with zipfile.ZipFile(TARGET, 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('START-HERE.txt', readme)
    for path, name in sorted(files, key=lambda x:x[1]):
        data = path.read_bytes()
        archive.writestr(name, data)
        manifest['files'].append({'path':name, 'sha256':hashlib.sha256(data).hexdigest()})
    archive.writestr('SOURCE-MANIFEST.json', json.dumps(manifest, indent=2))
with zipfile.ZipFile(TARGET) as archive:
    assert archive.testzip() is None
    assert all(allowed(Path(n)) for n in archive.namelist())
    assert archive.read('site/.openai/hosting.json') == (ROOT/'site/.openai/hosting.json').read_bytes()
    for item in manifest['files']:
        assert hashlib.sha256(archive.read(item['path'])).hexdigest() == item['sha256']
digest = hashlib.sha256(TARGET.read_bytes()).hexdigest()
TARGET.with_suffix('.sha256').write_text(digest + '  ' + TARGET.name + '\n')
print(json.dumps({'archive':str(TARGET), 'files':len(files)+2, 'sizeMB':round(TARGET.stat().st_size/1024**2,2), 'integrity':'passed', 'sha256':digest}))
