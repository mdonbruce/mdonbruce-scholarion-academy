import tempfile,unittest
from governed_service import Service,Denied,Conflict
import studio_sources as s
class SourceStudioTests(unittest.TestCase):
 def test_versioned_sources_and_edits(self):
  with tempfile.TemporaryDirectory() as tmp:
   service=Service(tmp);tokens={v['role']:k for k,v in service.identities.items()}
   def call(a,token=None,course='AIM310',**d):return s.command(service,token or tokens['instructor'],'scholarion',course,a,d,Denied,Conflict)
   p=call('create',title='Source planning',module=1);key=p['id']
   p=call('source',id=key,revision=1,title='Owned notes',text='Synthetic data notes.',citation='Instructor notes, 2026',rights='owned')
   dup=call('source',id=key,revision=2,title='Again',text='Synthetic data notes.',citation='Notes',rights='owned');self.assertEqual(dup['revision'],2)
   sid=p['package']['sources'][0]['id']
   p=call('mapping',id=key,revision=2,outcomes=[{'id':'LO1','text':'Evaluate data','competency':'C1'}],topics=[{'id':'T1','title':'Data','sourceIds':[sid],'outcomes':['LO1']}])
   self.assertEqual(sum(o['kind']=='mini_labs' for o in p['manifest']['outputs']),1)
   p=call('edit',id=key,revision=3,output='notes',body='Instructor draft')
   with self.assertRaises(ValueError):call('edit',id=key,revision=4,output='notes',body='Overwrite')
   p=call('source',id=key,revision=4,title='More',text='Additional synthetic notes',citation='Notes 2',rights='owned')
   self.assertEqual(p['package']['edits']['notes']['body'],'Instructor draft')
   self.assertTrue(next(o for o in p['manifest']['outputs'] if o['id']=='notes')['needsSourceReview'])
   with self.assertRaises(Conflict):call('regenerate',id=key,revision=4)
   self.assertFalse(call('export',id=key)['sourceTextsIncluded'])
   with self.assertRaises(Denied):call('get',id=key,token=tokens['student'])
   with self.assertRaises(Denied):call('get',id=key,course='OTHER')
if __name__=='__main__':unittest.main()
