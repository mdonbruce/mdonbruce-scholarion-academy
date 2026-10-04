import unittest,test_governed,integration_registry
from governed_service import Denied,Conflict
class RegistryTests(test_governed.GovernedTests):
 def call(self,action,token=None,**data):return integration_registry.command(self.s,token or self.teacher,'scholarion','AIM310',action,data,Denied,Conflict)
 def test_update_and_history(self):
  self.call('list');self.call('update',id='email',version=1,owner='Pilot staff',purpose='Delivery planning',status='Configured but disabled')
  self.assertEqual(len(self.call('history')['events']),1)
  self.assertEqual(next(r for r in self.call('list')['records'] if r['id']=='email')['version'],2)
  with self.assertRaises(Conflict):self.call('update',id='email',version=1,owner='x',purpose='x',status='Planned')
 def test_student_cannot_edit(self):
  with self.assertRaises(Denied):self.call('update',token=self.student)
 def test_cannot_claim_connected(self):
  for status in ['Connected','Live and verified','Awaiting authorization']:
   with self.assertRaises(ValueError):self.call('update',status=status)
if __name__=='__main__':unittest.main()
