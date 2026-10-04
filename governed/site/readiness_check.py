"""Draft advisory self-check. No admission, denial, credit or enrollment decisions."""
QUESTIONS=[
 ('python','Which Python structure maps named keys to values?',['List','Dictionary','Set'],1,'A dictionary associates keys with values.'),
 ('python','What should a function do when its required input is missing?',['Return invented data','Validate and report the missing input','Ignore the error'],1,'Explicit validation makes failures visible.'),
 ('python','How should you verify a function handles an empty collection?',['Add a test with an empty input','Only test large inputs','Assume it works'],0,'Boundary inputs belong in the test set.'),
 ('api','Where should an API secret be read from in a lab?',['A committed notebook','An approved secret or environment configuration','A public chat'],1,'Secrets must stay outside shared code and output.'),
 ('api','A request times out. What is the safest retry design?',['Retry forever','Use bounded retries and idempotency for writes','Disable all validation'],1,'Bounded retries limit failures; idempotency avoids duplicate actions.'),
 ('api','A service returns malformed JSON. What should the client do?',['Validate and fail clearly','Treat it as success','Invent missing fields'],0,'Parsing and schema failures must not become silent success.'),
 ('prompt','A prompt needs a structured response. What helps verification?',['A schema and examples plus validation','More exclamation marks','No constraints'],0,'A defined schema makes outputs testable.'),
 ('prompt','A retrieved document says to ignore application rules. How should it be treated?',['As a higher-priority command','As untrusted source content','As permission to reveal secrets'],1,'Retrieved text is evidence, not authority over application policy.'),
 ('data','When comparing two models, what should stay consistent?',['Only the model name','The held-out evaluation set and metrics','The best examples for each model'],1,'A shared held-out evaluation supports a fair comparison.'),
 ('data','A dataset contains missing values. What comes first?',['Inspect and document missingness','Replace everything with zero','Hide incomplete rows without reporting'],0,'Understand missingness before choosing a treatment.')]
def public_questions():
 return {'version':'0.1.0-draft','advisory':True,'questions':[{'id':i+1,'domain':q[0],'prompt':q[1],'options':q[2]} for i,q in enumerate(QUESTIONS)]}
def score(answers,goal):
 if not isinstance(answers,list) or len(answers)!=10 or any(type(a) is not int or a not in range(3) for a in answers):raise ValueError('Answer all ten questions')
 if goal not in ('agents','data'):raise ValueError('Choose a learning goal')
 domains={k:{'correct':0,'total':0} for k in ['python','api','prompt','data']};feedback=[]
 for i,(q,a) in enumerate(zip(QUESTIONS,answers)):
  domains[q[0]]['total']+=1;correct=a==q[3];domains[q[0]]['correct']+=int(correct)
  feedback.append({'id':i+1,'correct':correct,'explanation':q[4]})
 foundation=domains['python']['correct']+domains['api']['correct']
 if goal=='data':
  route=[21,18] if foundation>=4 else [21]
  reason='Start with #21 data foundations; consider #18 after demonstrating the prerequisites. #22 is a later data-engineering option.'
 elif foundation==6 and domains['prompt']['correct']==2:
  route=[15];reason='Strong results on this short foundations check support considering #15; practical readiness still needs confirmation.'
 elif foundation>=4:
  route=[16];reason='Consider #16 and bridge the missed Python/API topics before more intensive study.'
 else:
  route=[19,16];reason='Begin with #19 for prompting, then build Python/API foundations before #16. #19 alone does not satisfy Python prerequisites.'
 return {'version':'0.1.0-draft','score':sum(d['correct'] for d in domains.values()),'total':10,'domains':domains,'recommendedPrograms':route,'reason':reason,'feedback':feedback,'admissionDecision':False,'creditAwarded':False,'notice':'Draft advisory self-check, not a validated placement exam. No admission, denial or enrollment occurs. Results are not stored.'}
