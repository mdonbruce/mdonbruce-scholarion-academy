import unittest
from unittest.mock import patch
import hosted_planner

class CapacityTests(unittest.TestCase):
 def test_busy_calls_never_reach_provider(self):
  slots=hosted_planner.CAPACITY['maxConcurrentCallsPerProcess']
  for _ in range(slots):hosted_planner.CALL_SLOTS.acquire()
  try:
   with patch.object(hosted_planner.Provider,'_generate') as generate:
    with self.assertRaisesRegex(ValueError,'busy'):hosted_planner.Provider().generate({})
    generate.assert_not_called()
  finally:
   for _ in range(slots):hosted_planner.CALL_SLOTS.release()
 def test_failed_call_releases_slot(self):
  with patch.object(hosted_planner.Provider,'_generate',side_effect=ValueError('Unavailable')):
   with self.assertRaises(ValueError):hosted_planner.Provider().generate({})
  acquired=[hosted_planner.CALL_SLOTS.acquire(blocking=False) for _ in range(hosted_planner.CAPACITY['maxConcurrentCallsPerProcess'])]
  for success in acquired:
   if success:hosted_planner.CALL_SLOTS.release()
  self.assertTrue(all(acquired))

if __name__=='__main__':unittest.main()
