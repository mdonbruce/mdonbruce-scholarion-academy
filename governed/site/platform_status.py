"""Evidence-based capability inventory. Status changes require code, not a UI toggle."""
CAPABILITIES=[
 ('Academy boundary','LIVE','Only scholarion identities and database connections accepted. Existing unrelated files are preserved but never opened.','governed_service.py'),
 ('Identity','SIMULATED','Local pilot identities and sessions; OAuth, SSO, MFA and support grants missing.','workspace-session'),
 ('Teaching and coursework','LIVE','Local submissions, grade history and posting, discussions, calendar and support. Full Canvas parity is not implemented.','courses'),
 ('Curriculum intelligence','LIVE','Ten-week draft graphs, alignment evidence and peer review. Finished content and publication approval remain required.','curriculum-intelligence'),
 ('Assessment setup','LIVE','Saved self-checks and private local support tickets. Institutional policy approval and contacts pending.','assessment'),
 ('Catalog and pathways','SIMULATED','Draft program data and pathway visualizations. Complete #1–#38 specifications and authoritative transfer rules missing.','catalog'),
 ('Catalog claims review','LIVE','Server-side local draft review; restricted claims block readiness. No public publication or issuance endpoint.','platform-status'),
 ('Enrollment and records','PLANNED','Authoritative applications, enrollment projection events and official non-credit transcripts missing.','departments'),
 ('Commerce','DISABLED','No connected sandbox checkout; finance policy, subscriptions, tax and refund rules need configuration.','departments'),
 ('Credentials','SIMULATED','Design previews only. Managed signing keys, Open Badges/VC issuance and verification service missing.','credentials'),
 ('AI Tutor','LIVE','Local extractive cited answers and graded-work refusal. Generative tutoring, encrypted erasable memory and full evaluation gates missing.','governed-agent'),
 ('Hosted planning','DISABLED','Adapter present; live provider configuration and acceptance not verified.','agent-workbench'),
 ('Cloud Lab','PLANNED','No isolated execution infrastructure, LTI 1.3 service, GPU pools, autograder or learner key vault.','platform-status'),
 ('Organization accounts','DISABLED','No organization RLS or scoped SSO. Do not onboard corporate learners into this pilot.','platform-status'),
 ('Analytics','LIVE','Local authorized coursework/dashboard counts only; event pipeline, mastery, commerce and scheduled reporting missing.','dashboard'),
 ('Optional connectors','DISABLED','Avatar, voice, email, live meetings and support delivery have no verified connection.','integration-center'),
 ('Data plane and recovery','LIVE','Operator-run SQLite snapshot and isolated restore drill available; latest result shown separately. PostgreSQL, encrypted/off-site backups and point-in-time recovery missing.','operational-acceptance'),
 ('Accessibility and release','PLANNED','No full WCAG 2.2 AA, penetration-test or production acceptance sign-off. Local pilot only.','operational-acceptance')]

def snapshot():
 return {'environment':'LOCAL','productionAllowed':False,'brand':'Scholarion Academy','brandDecision':'User confirmed Scholarion Academy; Scholarion is the platform','statuses':['LIVE','CONNECTED','DISABLED','SIMULATED','PLANNED'],'definitions':{'LIVE':'Implemented local workflow; not production acceptance','CONNECTED':'External connection verified end to end','DISABLED':'Unavailable or intentionally blocked','SIMULATED':'Preview/demo, not an authoritative transaction','PLANNED':'Not implemented'},'capabilities':[dict(zip(['name','status','limits','route'],c)) for c in CAPABILITIES],'acceptance':[{'step':i,'status':'NOT VERIFIED','reason':reason} for i,reason in enumerate(['Academy admin publication and program #32 not operational','Sandbox purchase, autograding and signed issuance missing','Authoritative admission, seat reservation and waiver enforcement missing','LTI Cloud Lab and AGS passback missing','Local citations/refusal tested; full tutor scenario unverified','Organization seats and RLS absent','Program-director funnel/mastery dashboards absent','Local claims draft gate implemented; all public/credential surfaces not yet integrated','Active second data plane removed; historical artifacts still require reconciliation','Point-in-time restore infrastructure absent'],1)]}
