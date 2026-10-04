"""Model-agnostic bounded planning contract; decisions never execute writes."""
import json
def plan(provider,goal,max_steps=3,read_tool=None):
 if not isinstance(goal,str) or not 1<=len(goal)<=2000:raise ValueError('Invalid goal')
 if type(max_steps) is not int or not 1<=max_steps<=5:raise ValueError('Invalid step budget')
 history=[]
 for step in range(max_steps):
  result=provider.generate({'goal':goal,'observations':history,'allowed_actions':['search_memory','read_course_standard','propose_support_request','finish']})
  if not isinstance(result,dict) or set(result)!={'action','summary'} or result['action'] not in ['search_memory','read_course_standard','propose_support_request','finish'] or not isinstance(result['summary'],str) or len(result['summary'])>1000:raise ValueError('Model decision failed schema validation')
  history.append(result)
  if result['action']=='finish':return {'steps':history,'state':'completed','executed':False}
  if read_tool and result['action'] in ['read_course_standard','search_memory']:
   observation=read_tool(result['action'])
   if not isinstance(observation,dict):raise ValueError('Invalid tool observation')
   history.append({'tool':result['action'],'observation':observation})
   continue
  # A model proposal is not authorization to invoke a tool.
  return {'steps':history,'state':'action_review_required','executed':False}
 return {'steps':history,'state':'budget_exhausted','executed':False}
