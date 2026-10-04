import unittest,tempfile,sqlite3
from governed_service import Service,Denied,Conflict,FALLBACK,REFUSAL
class GovernedTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.s=Service(self.tmp.name)
  self.student=next(k for k,v in self.s.identities.items() if v['tenant']=='scholarion' and v['role']=='student')
  self.teacher=next(k for k,v in self.s.identities.items() if v['tenant']=='scholarion' and v['role']=='instructor')
 def tearDown(self):self.tmp.cleanup()
 def test_tenant_denied_before_database(self):
  before=self.s.db_accesses
  with self.assertRaises(Denied):self.s.query(self.student,'devtech','AIM310','baseline')
  self.assertEqual(before,self.s.db_accesses)
 def test_citations(self):self.assertIn('[Source: Study guide, Section: module-1]',self.s.query(self.student,'scholarion','AIM310','baseline')['answer'])
 def test_refusal(self):self.assertEqual(REFUSAL,self.s.query(self.student,'scholarion','AIM310','complete graded assessment')['answer'])
 def test_fallback(self):self.assertEqual(FALLBACK,self.s.query(self.student,'scholarion','AIM310','unicorn')['answer'])
 def test_unpublished(self):self.assertEqual(FALLBACK,self.s.query(self.student,'scholarion','AIM310','Private assessment answer')['answer'])
 def test_enrollment(self):
  with self.assertRaises(Denied):self.s.query(self.student,'scholarion','OTHER','baseline')
 def test_student_draft_denied(self):
  with self.assertRaises(Denied):self.s.drafts(self.student,'scholarion','AIM310','draft')
 def test_approval_and_stale_edit(self):
  d=self.s.drafts(self.teacher,'scholarion','AIM310','Draft feedback')[0]
  self.assertFalse(self.s.approve(self.teacher,'scholarion','AIM310',d['id'],1)['published'])
  with self.assertRaises(Conflict):self.s.approve(self.teacher,'scholarion','AIM310',d['id'],1)
 def test_audit_minimization_and_append_only(self):
  self.s.query(self.student,'scholarion','AIM310','baseline person@example.com')
  events=self.s.events(self.teacher,'scholarion','AIM310');self.assertEqual(1,len(events));self.assertNotIn('person@example.com',str(events))
  with self.s.connect('scholarion') as db:
   with self.assertRaises(sqlite3.IntegrityError):db.execute('DELETE FROM outbox')
 def test_future_and_locked(self):
  with self.s.connect('scholarion') as db:db.execute('UPDATE sources SET unlocked=0')
  self.assertEqual(FALLBACK,self.s.query(self.student,'scholarion','AIM310','baseline')['answer'])
if __name__=='__main__':unittest.main()
