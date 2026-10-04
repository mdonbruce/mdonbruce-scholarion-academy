import unittest,test_governed,hub_service
from governed_service import Denied,Conflict
class HubTests(test_governed.GovernedTests):
 def call(self,action,**data):return hub_service.command(self.s,self.student,'scholarion','AIM310',action,data,Denied,Conflict)
 def test_lifecycle(self):
  r=self.call('create',kind='calendar',title='Study',body='Synthetic event',date='2026-10-05');rows=self.call('list',kind='calendar')['records'];self.assertEqual(len(rows),1)
  self.call('archive',kind='calendar',id=r['id'],version=1)
  self.assertEqual(self.call('list',kind='calendar')['records'][0]['state'],'archived')
  self.call('archive',kind='calendar',id=r['id'],version=2,restore=True)
  self.assertEqual(self.call('list',kind='calendar')['records'][0]['state'],'active')
 def test_bad_date(self):
  with self.assertRaises(ValueError):self.call('create',kind='calendar',title='x',body='x',date='2026-02-31')
 def test_stale(self):
  r=self.call('create',kind='help',title='Question',body='test')
  with self.assertRaises(Conflict):self.call('archive',kind='help',id=r['id'],version=99)
if __name__=='__main__':unittest.main()
