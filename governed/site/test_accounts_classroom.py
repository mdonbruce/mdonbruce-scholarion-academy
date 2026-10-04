import tempfile,unittest
import accounts,classroom_meetings
from governed_service import Service,Denied

class AccountClassroomTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.s=Service(self.tmp.name)
  self.tokens={v['role']:k for k,v in self.s.identities.items()}
 def call(self,action,token='',**data):return accounts.command(self.s,token,action,data,Denied)
 def create(self,name='learner',action='register',**extra):
  r=self.call(action,username=name,password='A long unique password!',**extra)
  return r,self.call('verify',challenge=r['challenge'],code=accounts.code(r['setupSecret']))
 def test_password_alone_never_creates_session(self):
  r=self.call('register',username='learner',password='A long unique password!',kind='super_admin')
  self.assertNotIn('sessionToken',r)
  with self.s.connect('scholarion') as db:self.assertEqual(db.execute('SELECT kind FROM accounts').fetchone()[0],'student')
  self.assertIn('error',self.call('verify',challenge=r['challenge'],code='wrong'))
  verified=self.call('verify',challenge=r['challenge'],code=accounts.code(r['setupSecret']))
  self.assertEqual(self.s.identity(verified['sessionToken'],'scholarion')['accountType'],'student')
  self.assertIn('error',self.call('verify',challenge=r['challenge'],code=accounts.code(r['setupSecret'])))
 def test_password_hash_and_encrypted_mfa(self):
  r,v=self.create()
  with self.s.connect('scholarion') as db:
   row=db.execute('SELECT * FROM accounts').fetchone();self.assertNotIn('password!',row['password']);self.assertNotEqual(row['secret'],r['setupSecret'])
  self.call('logout',token=v['sessionToken']);self.assertIsNone(accounts.identity(self.s,v['sessionToken']))
 def test_admin_invites_and_course_assignment(self):
  r,v=self.create('owner','bootstrap',setupCode=(self.s.root/'account-bootstrap.txt').read_text())
  token=v['sessionToken'];invite=self.call('invite',token=token,kind='employee')['invite']
  employee,ev=self.create('teacher',invite=invite)
  self.assertEqual(ev['accountType'],'employee')
  with self.assertRaises(Denied):self.call('invite',token=ev['sessionToken'],kind='super_admin')
  self.call('enroll',token=token,username='teacher',course='AIM310')
  with self.s.connect('scholarion') as db:self.s.membership(db,self.s.identity(ev['sessionToken'],'scholarion'),'AIM310')
  with self.assertRaises(Denied):self.s.identity(self.tokens['instructor'],'scholarion')
 def test_password_rate_limit(self):
  self.create()
  for _ in range(5):self.assertIn('error',self.call('login',username='learner',password='wrong password'))
  self.assertIn('Too many',self.call('login',username='learner',password='A long unique password!')['error'])
 def test_meeting_access_and_link_validation(self):
  def call(action,role='instructor',course='AIM310',**data):return classroom_meetings.command(self.s,self.tokens[role],'scholarion',course,action,data,Denied)
  call('add',title='Office hours',provider='zoom',url='https://us02web.zoom.us/j/12345',starts='2026-10-06T10:00:00-04:00')
  self.assertEqual(len(call('list',role='student')['meetings']),1)
  with self.assertRaises(Denied):call('list',role='student',course='OTHER')
  with self.assertRaises(Denied):call('add',role='student')
  for url in ['javascript:alert(1)','https://zoom.us.attacker.test/j/1','https://user:pass@zoom.us/j/1']:
   with self.assertRaises(ValueError):call('add',title='Bad',provider='zoom',url=url,starts='2026-10-06T10:00:00Z')

if __name__=='__main__':unittest.main()
