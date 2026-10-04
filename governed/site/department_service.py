"""Policy readiness and non-executing sandbox previews for Scholarion only."""
import json,time,uuid
from pathlib import Path
from department_rules import hold_actions,refund_quote,PolicyMissing

def command(service,token,tenant,course,action,data,Denied,Conflict):
 ctx=service.identity(token,tenant)
 if tenant!='scholarion':raise Denied('Scholarion department service only')
 with service.connect(tenant) as db:
  service.membership(db,ctx,course)
  path=service.root/'scholarion-policy.json'
  policy=json.loads(path.read_text()) if path.exists() else {}
  required=['finance.holds','finance.refunds','identity.provider','identity.retries']
  missing=[]
  for key in required:
   value=policy
   for piece in key.split('.'):
    value=value.get(piece) if isinstance(value,dict) else None
   if value is None:missing.append('policy.'+key)
  if action=='status':return {'mode':'sandbox','missing':missing,'policy_version':policy.get('version'),'financial_execution':False,'identity_provider_connected':False,'enrollment_ready':False,'departments':[{'name':name,'status':state} for name,state in [('Identity','Blocked: sandbox provider not connected'),('Registration','Not implemented: first-enrollment verification required'),('Admissions','Planned'),('Finance','Policy preview only; no processor or scheduler'),('Supporter consent','Planned'),('Learning operations','Local coursework only')]]}
  if ctx['role']!='instructor':raise Denied('Pilot instructor required')
  if action not in ('preview_holds','preview_refund'):raise ValueError('Unknown operation')
  if not policy.get('version'):raise PolicyMissing('Part E versioned policy required')
  # Previews accept synthetic values only and never execute financial actions.
  if data.get('synthetic') is not True:raise ValueError('Synthetic sandbox data required')
  result=hold_actions(policy,data.get('invoice',{}),int(time.time())) if action=='preview_holds' else refund_quote(policy,data.get('purchase',{}),data.get('elapsed_days'))
  key=str(uuid.uuid4())
  db.execute('INSERT INTO outbox VALUES(?,?)',(key,json.dumps({'timestamp':time.time(),'tenant_id':tenant,'user_id':ctx['user'],'decision_code':action,'policy_version':policy['version'],'executed':False})))
  return {'preview':result,'executed':False,'audit_id':key}
