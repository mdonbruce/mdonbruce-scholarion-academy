"""Provider-independent free-plan timetable; no account or meeting creation claims.

Prepared for the HavenConnect integration. This module does not establish an
external connection, publish a session or write official Scholarion attendance.
"""
from datetime import datetime, timedelta
from math import ceil

def minutes(value,name,minimum=0,maximum=480):
 if type(value) is not int or not minimum<=value<=maximum:
  raise ValueError(f'{name} must be an integer from {minimum} to {maximum}')
 return value

def plan(required_live_minutes,start_at,class_block_minutes,async_minutes=0,transition_minutes=3):
 live=minutes(required_live_minutes,'requiredLiveMinutes',1)
 block=minutes(class_block_minutes,'classBlockMinutes',1,1440)
 asynchronous=minutes(async_minutes,'asyncMinutes')
 transition=minutes(transition_minutes,'transitionMinutes',3,60)
 try:start=datetime.fromisoformat(start_at.replace('Z','+00:00'))
 except (AttributeError,ValueError):raise ValueError('An ISO start time with UTC offset is required') from None
 if start.tzinfo is None or start.utcoffset() is None:raise ValueError('Start time must include a UTC offset')
 count=ceil(live/35);remaining=live;cursor=start;segments=[]
 for number in range(1,count+1):
  duration=min(35,remaining);end=cursor+timedelta(minutes=duration)
  segments.append({'number':number,'liveMinutes':duration,'startsAt':cursor.isoformat(),'endsAt':end.isoformat(),
   'warningTimes':[{'at':(cursor+timedelta(minutes=offset)).isoformat(),'minutesRemaining':duration-offset} for offset in (30,33) if offset<duration],
   'transitionMinutes':transition if number<count else 0,'nextSegment':number+1 if number<count else None,
   'meetingStatus':'NOT_CREATED','joinUrl':None,'objective':None,'activity':None,'understandingCheck':None})
  cursor=end+timedelta(minutes=transition if number<count else 0);remaining-=duration
 async_block={'startsAt':cursor.isoformat(),'endsAt':(cursor+timedelta(minutes=asynchronous)).isoformat(),'minutes':asynchronous} if asynchronous else None
 total=live+transition*(count-1)+asynchronous
 return {'schemaVersion':1,'state':'DRAFT','requiredLiveMinutes':live,'segmentCount':count,'segments':segments,
  'asyncBlock':async_block,'totalBlockMinutes':total,'classBlockMinutes':block,'overrunMinutes':max(0,total-block),
  'requiresScheduleAdjustment':total>block,'endsAt':(start+timedelta(minutes=total)).isoformat(),
  'providerCapabilityVerified':False,'publicationAllowed':False,
  'publicationRequirements':['Verified host capabilities or instructor-supplied manual links','Distinct meeting for each segment','Objectives, activities and understanding checks','Resolve schedule overrun','Instructor approval and scoped learning-platform connection']}
