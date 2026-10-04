"""Deterministic sandbox rules. No payment execution or identity capture."""
from datetime import datetime,timezone

class PolicyMissing(ValueError):pass

def section(policy,*path):
 value=policy
 for key in path:
  if not isinstance(value,dict) or key not in value:raise PolicyMissing('Missing policy.'+'.'.join(path))
  value=value[key]
 return value

def integer(value,name,minimum=0):
 if type(value) is not int or value<minimum:raise ValueError(name+' must be an integer')
 return value

def hold_actions(policy,invoice,now):
 """Return idempotent notification/hold intents; caller persists atomically.

 Notice must already exist with a timestamp strictly before activation. A late
 scheduler run announces now and postpones enforcement by the notice period.
 """
 rules=section(policy,'finance','holds')
 notice=integer(rules.get('advance_notice_seconds'),'advance_notice_seconds',1)
 reminders=rules.get('reminder_days');levels=rules.get('levels')
 if not isinstance(reminders,list) or not isinstance(levels,list) or not levels:raise ValueError('Hold schedule required')
 amount=integer(invoice.get('balance_minor'),'balance_minor')
 due=integer(invoice.get('due_at'),'due_at');now=integer(now,'now')
 if amount==0:return [{'key':'release:'+h,'type':'hold.released','hold':h} for h in invoice.get('active_holds',[])]
 actions=[]
 for day in reminders:
  integer(day,'reminder day')
  if now>=due+day*86400:actions.append({'key':'reminder:'+str(day),'type':'payment.reminder','amount_minor':amount,'clearance':'Pay the outstanding invoice balance.'})
 for level in levels:
  name=level.get('name')
  if name not in ('soft','hard'):raise ValueError('Unknown hold level')
  effective=due+integer(level.get('after_days'),'after_days')*86400
  announced=invoice.get('announcements',{}).get(name)
  if announced is None and now>=effective-notice:
   actions.append({'key':'notice:'+name,'type':'hold.announced','hold':name,'amount_minor':amount,'clearance':'Pay the outstanding invoice balance.','effective_at':max(effective,now+notice)})
  elif announced is not None:
   announced=integer(announced,'announcement timestamp')
   if now>=max(effective,announced+notice) and now>announced and name not in invoice.get('active_holds',[]):actions.append({'key':'place:'+name,'type':'hold.placed','hold':name})
 return actions

def refund_quote(policy,purchase,elapsed_days):
 rules=section(policy,'finance','refunds')
 limit=integer(rules.get('auto_approve_limit_minor'),'auto approve limit')
 schedule=rules.get('schedule')
 if not isinstance(schedule,list) or not schedule:raise ValueError('Refund schedule required')
 previous=-1;selected=None
 integer(elapsed_days,'elapsed days')
 for band in schedule:
  day=integer(band.get('through_day'),'through_day');bps=integer(band.get('refund_basis_points'),'refund_basis_points')
  if day<=previous or bps>10000:raise ValueError('Invalid refund schedule')
  previous=day
  if selected is None and elapsed_days<=day:selected=bps
 model=purchase.get('model')
 if model not in ('pay_as_you_go','pay_in_full','installments'):raise ValueError('Unsupported payment model')
 scope='course' if model=='pay_as_you_go' else 'program'
 if purchase.get('scope')!=scope or not purchase.get('scope_id'):raise ValueError('Refund scope must match payment model')
 paid=integer(purchase.get('paid_minor'),'paid_minor');refunded=integer(purchase.get('refunded_minor'),'refunded_minor')
 if refunded>paid:raise ValueError('Refunds exceed collected amount')
 if selected is None:return {'decision':'staff_review','reason':'Outside published schedule','scope':scope,'amount_minor':None}
 # Cumulative entitlement less earlier refunds, bounded by actual collections.
 amount=max(0,(paid*selected//10000)-refunded)
 return {'decision':'staff_review' if amount>limit else 'eligible_within_policy','reason':'Above automatic approval limit' if amount>limit else 'Within schedule','scope':scope,'scope_id':purchase['scope_id'],'amount_minor':amount,'executed':False}

def identity_result(policy,provider_payload,prior_failures):
 provider=section(policy,'identity','provider');retries=section(policy,'identity','retries')
 if not isinstance(provider,dict) or provider.get('mode')!='sandbox' or not provider.get('name'):raise ValueError('Sandbox identity provider required')
 maximum=integer(retries.get('max_attempts'),'max_attempts',1)
 integer(prior_failures,'prior_failures')
 if prior_failures>=maximum:return {'result':'needs_review','retry_allowed':False}
 allowed={'result','provider_reference','verified_at','verified_name','verified_dob'}
 if set(provider_payload)-allowed:raise ValueError('Unexpected identity fields; ID images and numbers are prohibited')
 result=provider_payload.get('result')
 if result not in ('verified','failed','needs_review'):raise ValueError('Invalid provider result')
 for key in ('provider_reference','verified_at'):
  if not isinstance(provider_payload.get(key),str) or not 1<=len(provider_payload[key])<=200:raise ValueError('Provider reference and verification date required')
 stamp=datetime.fromisoformat(provider_payload['verified_at'].replace('Z','+00:00'))
 if stamp.tzinfo is None:raise ValueError('Verification date requires timezone')
 if result=='verified':
  if not isinstance(provider_payload.get('verified_name'),str) or not 1<=len(provider_payload['verified_name'])<=200:raise ValueError('Verified name required')
  datetime.strptime(provider_payload.get('verified_dob',''),'%Y-%m-%d')
 record={k:v for k,v in provider_payload.items() if k in allowed}
 if result!='verified':
  record.pop('verified_name',None);record.pop('verified_dob',None)
 return {'record':record,'result':result,'retry_allowed':result=='failed' and prior_failures+1<maximum,'requires_review':result=='needs_review' or result=='failed' and prior_failures+1>=maximum}
