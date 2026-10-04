import unittest,json
from pathlib import Path
import self_paced
class SelfPacedSyncTests(unittest.TestCase):
 def test_catalog_matches_discovery(self):
  records={p['id']:p for p in json.loads((Path(self_paced.ROOT)/'dist/data/programs.json').read_text(encoding='utf-8'))}
  for p in self_paced.catalog():
   row=records[p['id']]
   self.assertEqual(row['courses'],p['courses']);self.assertEqual(row['courseCount'],len(p['courses']))
   self.assertEqual(row['sequentialWeeks'],len(p['courses'])*10)
   self.assertEqual(row['discoveryRoute'],'#self-paced/'+str(p['id']))
   self.assertFalse(row['waiverApproved']);self.assertTrue(all(not t['approval'] for t in row['transfer']))
   self.assertIn('none is approved',row['specification'])
 def test_all_weeks_accounted_for(self):
  for p in self_paced.catalog():
   for c in p['courses']:
    self.assertEqual([w for m in c['modules'] for w in range(m['weeks'][0],m['weeks'][1]+1)],list(range(1,11)))
if __name__=='__main__':unittest.main()
