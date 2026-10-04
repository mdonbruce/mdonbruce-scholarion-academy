"""Closed output vocabulary for the disconnected deterministic concierge.

Do not reuse this as a claim that arbitrary LLM output is safely filtered.
Live inference requires a separate evaluated output policy.
"""
import re
NOTICE='Scholarion Academy is in pre-launch. Records are demonstration data.'
REDIRECT='This assistant supports Scholarion Academy only. Please use the other organization’s own support channel.'
FALLBACK='I cannot verify this response against approved Scholarion information. Please request staff review.'
TOPICS={'admissions','learning','career','registration','payment','withdrawal','record_change'}
APPROVED={
 'Your local review request is queued. Live CARE delivery is not connected.',
 'Do not enter card or bank details in chat. A verified secure payment component is required; payments are not connected.',
 'A local human-review request has been recorded. Live CARE delivery is not connected; no specialist has been notified.',
 'Scholarion Academy is a demonstration catalog. Accreditation, degree approval and federal-aid eligibility are not represented as live verified statuses.',
 'This action is blocked until authoritative records and confirmation are verified. No records or payments changed.',
 'Is your request about admissions, registration, payments, learning support, or career support?',
 'Which service do you need help with?',REDIRECT}
APPROVED.update('Your request is classified for '+topic+' support. The specialist connector is not connected; no external action occurred.' for topic in TOPICS)
def outside_scope(question):
 return bool(re.search(r'\boak\s*haven\b|\bdev\s*tech\b|\bhaven\w*\b|\bscholaris guest\b',question,re.I))
def validate_output(result):
 # Unapproved claims cannot pass by adding a negation, encoding a phrase or
 # changing spelling: only the entire approved template is accepted.
 blocked=result.get('message') not in APPROVED
 if blocked:result.update(message=FALLBACK,outcome='output_policy_blocked',executed=False)
 result['notice']=NOTICE
 result['message']=NOTICE+' '+result['message']
 result['policy_version']='scholarion-engagement-1'
 result['output_policy_blocked']=blocked
 return result
