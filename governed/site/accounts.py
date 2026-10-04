"""Local username/password + TOTP accounts. Never grants a session before MFA."""
import base64,hashlib,hmac,json,re,secrets,struct,time
from urllib.parse import quote

def initialize(service):
 with service.connect('scholarion') as db:
  db.executescript('''CREATE TABLE IF NOT EXISTS accounts(username TEXT PRIMARY KEY,password TEXT,kind TEXT,secret TEXT,active INTEGER DEFAULT 0,last_step INTEGER DEFAULT -1,disabled INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS account_sessions(hash TEXT PRIMARY KEY,username TEXT,expires REAL);
CREATE TABLE IF NOT EXISTS account_challenges(hash TEXT PRIMARY KEY,username TEXT,expires REAL,attempts INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS account_limits(name TEXT PRIMARY KEY,attempts INTEGER,until REAL);
CREATE TABLE IF NOT EXISTS account_invites(hash TEXT PRIMARY KEY,kind TEXT,expires REAL,used INTEGER DEFAULT 0);''')
 path=service.root/'account-bootstrap.txt'
 if not path.exists():path.write_text(secrets.token_urlsafe(32),encoding='utf-8')

def sha(s):return hashlib.sha256(s.encode()).hexdigest()
def cipher(service):
 from cryptography.fernet import Fernet
 path=service.root/'account-encryption.key'
 if not path.exists():
  try:
   with path.open('xb') as f:f.write(Fernet.generate_key())
  except FileExistsError:pass
 return Fernet(path.read_bytes())
def password_hash(password,salt=None):
 if not isinstance(password,str) or not 12<=len(password)<=128:raise ValueError('Use a password of 12–128 characters')
 salt=salt or secrets.token_hex(16)
 return salt+':'+hashlib.scrypt(password.encode(),salt=bytes.fromhex(salt),n=16384,r=8,p=1).hex()
def code(secret,step=None):
 step=int(time.time()/30) if step is None else step
 value=hmac.new(base64.b32decode(secret),struct.pack('>Q',step),hashlib.sha1).digest();offset=value[-1]&15
 return str((struct.unpack('>I',value[offset:offset+4])[0]&0x7fffffff)%1000000).zfill(6)
def identity(service,token):
 with service.connect('scholarion') as db:
  row=db.execute('SELECT a.*,s.expires FROM account_sessions s JOIN accounts a ON a.username=s.username WHERE s.hash=? AND s.expires>? AND a.active=1 AND a.disabled=0',(sha(token),time.time())).fetchone()
  if not row:return None
  return {'user':row['username'],'tenant':'scholarion','role':{'student':'student','employee':'instructor','super_admin':'instructor'}[row['kind']],'accountType':row['kind'],'expires':row['expires'],'realm':'password-totp'}

def command(service,token,action,data,Denied):
 initialize(service)
 with service.connect('scholarion') as db:
  db.execute('BEGIN IMMEDIATE')
  if action=='status':return {'bootstrapAvailable':not bool(db.execute("SELECT 1 FROM accounts WHERE kind='super_admin'").fetchone())}
  if action in ['register','bootstrap']:
   username=str(data.get('username','')).strip().lower()
   if not re.fullmatch(r'[a-z0-9][a-z0-9_.-]{2,63}',username):raise ValueError('Username must contain 3–64 letters, digits, dots, underscores or hyphens')
   kind='student'
   if action=='bootstrap':
    if db.execute("SELECT 1 FROM accounts WHERE kind='super_admin'").fetchone() or not hmac.compare_digest(str(data.get('setupCode','')),(service.root/'account-bootstrap.txt').read_text().strip()):raise Denied('Initial administrator setup unavailable or code invalid')
    kind='super_admin'
   elif data.get('invite'):
    invite=db.execute('SELECT * FROM account_invites WHERE hash=? AND used=0 AND expires>?',(sha(str(data['invite'])),time.time())).fetchone()
    if not invite:raise Denied('Invitation invalid or expired')
    kind=invite['kind'];db.execute('UPDATE account_invites SET used=1 WHERE hash=?',(invite['hash'],))
   if db.execute('SELECT 1 FROM accounts WHERE username=?',(username,)).fetchone():raise ValueError('Username unavailable')
   ph=password_hash(data.get('password'));secret=base64.b32encode(secrets.token_bytes(20)).decode()
   db.execute('INSERT INTO accounts(username,password,kind,secret) VALUES(?,?,?,?)',(username,ph,kind,cipher(service).encrypt(secret.encode()).decode()))
   challenge=secrets.token_urlsafe(32);db.execute('INSERT INTO account_challenges VALUES(?,?,?,0)',(sha(challenge),username,time.time()+600))
   return {'challenge':challenge,'setupSecret':secret,'setupUri':'otpauth://totp/'+quote('Scholarion Academy:'+username)+'?secret='+secret+'&issuer=Scholarion%20Academy','mfaRequired':True}
  if action=='login':
   username=str(data.get('username','')).strip().lower();limit=db.execute('SELECT * FROM account_limits WHERE name=?',(username,)).fetchone()
   if limit and limit['attempts']>=5 and limit['until']>time.time():return {'error':'Too many attempts. Try again in 15 minutes.'}
   row=db.execute('SELECT * FROM accounts WHERE username=? AND disabled=0',(username,)).fetchone()
   try:valid=hmac.compare_digest(password_hash(data.get('password'),row['password'].split(':')[0] if row else '0'*32),row['password'] if row else '')
   except ValueError:valid=False
   if not valid:
    attempts=limit['attempts']+1 if limit and limit['until']>time.time() else 1
    db.execute('INSERT OR REPLACE INTO account_limits VALUES(?,?,?)',(username,attempts,time.time()+900))
    return {'error':'Invalid username or password'}
   # Failed MFA also contributes to the per-account login limit.
   db.execute('INSERT OR REPLACE INTO account_limits VALUES(?,?,?)',(username,(limit['attempts'] if limit and limit['until']>time.time() else 0)+1,time.time()+900))
   challenge=secrets.token_urlsafe(32);db.execute('INSERT INTO account_challenges VALUES(?,?,?,0)',(sha(challenge),username,time.time()+300))
   result={'challenge':challenge,'mfaRequired':True}
   if not row['active']:result['setupSecret']=cipher(service).decrypt(row['secret'].encode()).decode()
   return result
  if action=='verify':
   challenge=db.execute('SELECT * FROM account_challenges WHERE hash=? AND expires>? AND attempts<5',(sha(str(data.get('challenge',''))),time.time())).fetchone()
   if not challenge:return {'error':'Verification expired or attempt limit reached. Sign in again.'}
   row=db.execute('SELECT * FROM accounts WHERE username=? AND disabled=0',(challenge['username'],)).fetchone()
   if not row:return {'error':'Account unavailable'}
   secret=cipher(service).decrypt(row['secret'].encode()).decode();now=int(time.time()/30)
   accepted=next((step for step in [now-1,now,now+1] if step>row['last_step'] and hmac.compare_digest(code(secret,step),str(data.get('code','')))),None)
   if accepted is None:
    db.execute('UPDATE account_challenges SET attempts=attempts+1 WHERE hash=?',(challenge['hash'],));return {'error':'Invalid or already used authenticator code'}
   db.execute('UPDATE accounts SET active=1,last_step=? WHERE username=?',(accepted,row['username']))
   db.execute('DELETE FROM account_challenges WHERE username=?',(row['username'],));db.execute('DELETE FROM account_limits WHERE name=?',(row['username'],))
   session=secrets.token_urlsafe(32);db.execute('INSERT INTO account_sessions VALUES(?,?,?)',(sha(session),row['username'],time.time()+28800))
   return {'sessionToken':session,'user':row['username'],'accountType':row['kind']}
  if action=='logout':db.execute('DELETE FROM account_sessions WHERE hash=?',(sha(token),));return {'signedOut':True}
  ctx=identity(service,token)
  if not ctx or ctx['accountType']!='super_admin':raise Denied('Super Admin access required')
  if action=='list':return {'accounts':[dict(r) for r in db.execute('SELECT username,kind,active,disabled FROM accounts ORDER BY username')]}
  if action=='invite':
   if data.get('kind') not in ['student','employee','super_admin']:raise ValueError('Invalid account type')
   invite=secrets.token_urlsafe(32);db.execute('INSERT INTO account_invites VALUES(?,?,?,0)',(sha(invite),data['kind'],time.time()+86400));service.emit(db,ctx,'account.invitation.created');return {'invite':invite,'expiresInHours':24}
  if action=='enroll':
   row=db.execute('SELECT * FROM accounts WHERE username=? AND disabled=0',(data.get('username'),)).fetchone();course=str(data.get('course',''))
   if not row or not db.execute('SELECT 1 FROM enrollments WHERE course=?',(course,)).fetchone():raise ValueError('Choose an existing account and course')
   role='student' if row['kind']=='student' else 'instructor'
   db.execute('INSERT OR REPLACE INTO enrollments VALUES(?,?,?,?)',(row['username'],course,role,'active'));service.emit(db,ctx,'account.course.assigned',course=course);return {'saved':True}
  raise ValueError('Unknown account action')
