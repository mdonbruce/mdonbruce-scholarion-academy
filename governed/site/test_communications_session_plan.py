import unittest
from communications_session_plan import plan

class SessionPlanTests(unittest.TestCase):
 def test_required_live_examples(self):
  for live,count,total in [(50,2,53),(90,3,96),(120,4,129),(240,7,258)]:
   with self.subTest(live=live):
    p=plan(live,'2026-10-05T09:00:00-04:00',live)
    self.assertEqual(p['segmentCount'],count);self.assertEqual(p['totalBlockMinutes'],total)
    self.assertEqual(sum(s['liveMinutes'] for s in p['segments']),live)
    self.assertTrue(p['requiresScheduleAdjustment']);self.assertFalse(p['publicationAllowed'])
    self.assertTrue(all(s['joinUrl'] is None for s in p['segments']))
 def test_explicit_async_choice(self):
  p=plan(35,'2026-10-05T09:00:00-04:00',50,async_minutes=15)
  self.assertEqual(p['segmentCount'],1);self.assertEqual(p['totalBlockMinutes'],50)
  self.assertEqual(p['asyncBlock']['minutes'],15);self.assertFalse(p['requiresScheduleAdjustment'])
 def test_warnings_and_final_short_segment(self):
  p=plan(50,'2026-10-05T09:00:00-04:00',53)
  self.assertEqual([w['minutesRemaining'] for w in p['segments'][0]['warningTimes']],[5,2])
  self.assertEqual(p['segments'][1]['startsAt'],'2026-10-05T09:38:00-04:00')
  self.assertEqual(p['segments'][1]['warningTimes'],[])
 def test_no_extra_transition_after_last_segment(self):
  p=plan(70,'2026-10-05T09:00:00-04:00',73)
  self.assertEqual(p['totalBlockMinutes'],73);self.assertEqual(p['segments'][-1]['transitionMinutes'],0)
 def test_input_constraints(self):
  for value in [0,-1,481,True,35.5,'35']:
   with self.assertRaises(ValueError):plan(value,'2026-10-05T09:00:00Z',90)
  with self.assertRaises(ValueError):plan(35,'2026-10-05T09:00:00',90)
  with self.assertRaises(ValueError):plan(35,'2026-10-05T09:00:00Z',90,transition_minutes=2)

if __name__=='__main__':unittest.main()
