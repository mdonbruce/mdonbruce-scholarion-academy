from pathlib import Path
import zipfile,hashlib,json
root=Path(__file__).resolve().parent
target=root.parent/'scholarion-accounts-classroom-2026-10-02.zip'
files=list((root/'dist').rglob('*'))+list((root/'migrations').rglob('*'))+list((root/'contracts').rglob('*'))+list((root/'program15-review').rglob('*'))
files += [root/n for n in ['governed_service.py','lms_service.py','hub_service.py','integration_registry.py','engagement_policy.py','AGENTFORCE-REVIEW.txt','agent_workbench.py','local_mcp.py','model_planner.py','hosted_planner.py','AGENT-WORKBENCH.txt','agent_runtime.py','AGENT-RUNTIME-REVIEW.txt','readiness_check.py','PROGRAM-BATCH-STATUS.txt','build_program15.py','build_consolidation.py','CONSOLIDATION-15-25.txt','live_dashboard.py','PRODUCT-WORKFLOW-REVIEW.txt','operational_acceptance.py','OPERATIONAL-ACCEPTANCE-REVIEW.txt','department_rules.py','department_service.py','DEPARTMENT-REVIEW.txt','curriculum_engine.py','course_formats.json','CURRICULUM-FORMATS-REVIEW.txt','enterprise_orchestration.py','LOCAL-RELEASE.txt','MASTER-SPEC-REVIEW.txt']]
files += [root/'README.md',root/'DEEP-REVIEW-2026-10-02.txt',root/'RELIABILITY-IMPLEMENTATION-2026-10-02.txt',root/'pilot_capacity.json',root/'load_pilot.py',root/'PILOT-LOAD-RESULTS.json']+list(root.glob('test_*.py'))+list(root.glob('test-*.cjs'))
files += [root/'PILOT-LOAD-HISTORY.json',root/'curriculum_intelligence.py',root/'CCI-SPEC-RECONCILIATION.txt']
files += [root/'assessment_support.py',root/'ASSESSMENT-SUPPORT-REVIEW.txt']
files += [root/'platform_status.py',root/'catalog_review.py',root/'MASTER-PLATFORM-RECONCILIATION.txt',root/'MASTER-PLATFORM-TEST-RESULT.txt']
files += [root/'recovery.py',root/'REVISED-MASTER-RECOVERY-REVIEW.txt',root/'RECOVERY-TEST-RESULT.txt']
files += [root/'self_paced.py',root/'build_self_paced_practice.py',root/'SELF-PACED-REVIEW.txt',root/'SELF-PACED-TEST-RESULT.txt']+list((root/'self-paced-review').glob('*.ipynb'))
files += [root/'program_shells.py',root/'PROGRAM-SHELL-REVIEW.txt',root/'PROGRAM-SHELL-TEST-RESULT.txt']
files += [root/'program26.py',root/'PROGRAM26-REVIEW.txt',root/'PROGRAM26-TEST-RESULT.txt']
files += [root/'curriculum_commons.py',root/'COMMONS-REVIEW.txt']
files += [root/'additional_programs.py',root/'build_additional_brochures.py',root/'ADDITIONAL-PROGRAMS-REVIEW.txt']
files += [root/'core_programs.py',root/'CORE-PROGRAMS-REVIEW.txt',root/'CORE-READINESS-RESULTS.json']
files += [root/'voice_studio.py',root/'VOICE-PLATFORM-REVIEW.txt']
files += [root/'assignment_packages.py',root/'ASSIGNMENT-PACKAGES-REVIEW.txt']
files += [root/'studio_sources.py',root/'SOURCE-STUDIO-REVIEW.txt']
files += [root/'accounts.py',root/'classroom_meetings.py',root/'ACCOUNTS-CLASSROOM.txt']
files += [root/'studio_engine.py',root/'studio_lab_runner.py',root/'studio_renderers.py',root/'STUDIO-BUILD-STATUS.txt']
with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
 for f in files:
  if f.is_file():z.write(f,'site/'+f.relative_to(root).as_posix())
with zipfile.ZipFile(target) as z:
 assert not any('private-governed' in n or 'identities.json' in n or '.sqlite3' in n for n in z.namelist())
manifest={'release':'accounts-classroom-2026-10-02','production':False,'allModulesOperational':False,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'archive':target.name}
(root.parent/'scholarion-accounts-classroom-release.json').write_text(json.dumps(manifest,indent=2))
print(target.name+' created; private tokens and databases excluded.')
