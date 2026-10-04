# Scholarion Project — Conversation Record

**Date captured:** October 1, 2026

> This record consolidates the Scholarion-related conversation context available in the active development session. It is intended as a project handoff/history record. The original ChatGPT service transcript itself is not directly exportable by the assistant, so this file records the decisions, user requirements, prompts, revisions, and development checkpoints available to the working session.

## 1. Naming and brand decision

- The user considered the name **Scholarion**.
- Final direction: **Scholarion is the underlying and sole platform identity for this project**.
- Do not use Scholaris Global Learning, OakHaven Global University, OGU, or related education branding in Scholarion materials.
- Scholarion platform scope: LMS, credentials, AI tutor, Cloud Lab, learning pathways, analytics, institutional/organizational tenants, curriculum authoring, integrations, governance.
- Core brand line used in designs: **Learn. Earn. Build Your Future.**
- Visual direction: professional **blue and white**, with gold accents acceptable in the logo/credential identity.

## 2. Approved public homepage

The user approved the blue-and-white Scholarion public cover page based on the earlier academy layout, with:
- Scholarion logo/wordmark
- Home
- Programs
- **LMS** dropdown
- Learning Experience
- Admissions
- For Organizations
- About
- Search
- Sign In
- Enroll Now
- Hero: Scholarion AI Academy
- Explore Programs / Watch Video
- Program/value highlights
- Program-track cards
- Learn / Practice / Earn / Advance / Impact strip

Important architecture correction agreed with user:
- The approved cover page is the **public homepage only**.
- The LMS lives **behind** the homepage.
- Sign In / Learner Portal / LMS entries route into authenticated role-specific experiences.
- Do not replace the approved homepage with an LMS dashboard.

## 3. Scholarion platform modules

Approved product architecture:
- **Scholarion LMS** — course delivery and learning environment
- **Scholarion AI** — governed AI Tutor and faculty copilots
- **Scholarion Labs** — coding labs, notebooks, datasets, API sandboxes, autograding
- **Scholarion Studio** — course/program/scenario authoring, shared modules, rubrics, item banks, publishing
- **Scholarion Credentials** — certificates, Open Badges 3.0, verification, credential wallet
- **Scholarion Pathways** — prerequisites, equivalencies, stackable credentials, transfer/waiver rules
- **Scholarion Insights** — mastery, engagement, course/program analytics
- **Scholarion Catalog** — public course/program marketplace
- **Scholarion Connect** — LTI, APIs, SSO, integrations
- **Scholarion Admin** — organizations, users, roles, governance, audit, settings

## 4. Scenario-Based Learning standard

The user established that **every course must have a capstone project** and every weekly/topic unit must contain practical scenario-based work.

Mandatory learning loop:

**Scenario → Learn → Practice → Mini Lab → Scenario Quiz → Mini Project → Project Milestone → Feedback → Capstone → Demonstration of Mastery → Credential**

Every course requires:
- Cumulative scenario-based real-world project
- Professional learner persona/role
- Messy, realistic core challenge
- 3–4 project milestones where appropriate
- Tangible final deliverable
- Scenario-based quizzes for major modules/milestones
- Plausible distractors based on common misconceptions
- Contextual feedback explaining correct and incorrect choices
- Weekly mini labs
- Weekly scenario-based mini projects
- Capstone milestones
- Portfolio artifacts where appropriate
- Capstone defense for advanced/long-form programs where appropriate

## 5. Course/project output framework

### Course Overview & Project Blueprint
- Project Title
- Persona & Role
- Organization
- Scenario
- Core Challenge
- Constraints
- Project Milestones
- Final Output
- Capstone Defense (where appropriate)

### Module-by-Module Integration
For each module:
1. Module Name
2. Workplace Scenario
3. Learning Objectives
4. Mini Lab
5. Weekly Scenario-Based Mini Project
6. Project Milestone
7. Portfolio Artifact
8. Scenario-Based Quiz with setup, question, A–D options, correct answer, contextual rationale

## 6. Credential workflow

Approved platform workflow:

**Completion event → requirements validation → credential eligibility → faculty/program approval where required → personalized certificate → Open Badge 3.0 → credential ID + QR verification → learner wallet → email delivery → audit record**

Certificate data should include:
- Student legal/full name
- Program/course title
- Credential type
- Completion date
- Learning hours
- Credential ID
- Competencies
- Authorized signatory
- Verification URL/QR
- Scholarion branding only

Credentials must not imply accreditation, degree status, CEUs, university partnership, or industry recognition unless separately verified/approved.

## 7. Proctored Assessment Setup Assistant

The user supplied a complete system prompt for a **Proctored Assessment Setup Support Assistant**. It was incorporated conceptually into Scholarion as a native assessment-support module.

Core approved talking points:
- Current government-issued photo ID; expired IDs not accepted
- Webcam must clearly show face, hands, and workspace throughout testing
- Microphone on
- Unapproved devices removed; no music
- No unapproved head/facial movement mouse-control software (accommodation exception path)
- No smart glasses
- No copying/pasting assessment content
- Appropriate attire
- Highlighting allowed when available as an approved testing-platform tool
- Accessibility/accommodation concerns routed supportively to the approved process without asking for diagnosis/medical details
- Assistant cannot grant exceptions, approve accommodations, discuss incident flags/investigations/results, or expose assessment content

Planned native objects:
- ProctoringPolicy
- AssessmentProctoringRule
- PreTestChecklist
- ReadinessCheckResult
- AssessmentSupportCase
- AccommodationReferral
- SupportEscalation
- PolicyAcknowledgement

## 8. LMS architecture direction

The attached LMS specification was reviewed as a functionality source, but all legacy branding is to be converted to Scholarion.

Core functionality to preserve/build:
- Roles and granular permissions
- Dashboard
- Courses/sections/terms
- Modules with prerequisites, requirements, sequential progression and conditional learning
- Assignments and submissions
- Modern quiz engine and item banks
- Discussions
- Gradebook and grading workspace
- Outcomes/mastery
- Rubrics
- People/groups
- Files/media
- Calendar/scheduler
- Inbox/notifications
- Blueprint/shared content
- Import/export
- LTI 1.3/Advantage
- APIs and webhooks
- Analytics
- Mobile/PWA
- Accessibility (WCAG 2.2 AA target)
- Audit and governance
- AI permissions and graded-work protection

Scholarion-specific additions:
- Scenario object
- Mini Lab
- Mini Project
- Project Milestone
- Capstone
- Capstone Defense
- Portfolio Artifact
- Scenario Question type
- Project Workspace
- Scholarion Labs
- Scholarion Studio
- Scholarion Credentials
- Scholarion Pathways

## 9. Program catalog work

The project contains extensive program architecture and specifications through program positions #1–#38, with #27 treated as proposed/pending in the working design.

The newer self-paced line (#28–#38) includes Guided Projects, Short Courses, Specializations and Professional Certificates and is designed to stack into live/cohort programs.

See the copied requirements files in `/requirements` for the detailed program specifications and catalog rules.

## 10. Development checkpoints

### v0.1
Initial standalone Scholarion shell created.

### v0.2
Attempted interactive role workspaces and LMS navigation. User identified that the public homepage and LMS application were being conflated.

### v0.3
Added Proctored Assessment Setup experience and support-assistant concept.

### v0.4
Separated public homepage from LMS/application surfaces:
- `index.html` public home
- `lms.html` LMS overview
- `login.html` sign-in
- `app.html` learner dashboard
- `faculty.html` faculty workspace
- `admin.html` admin workspace
- `proctor.html` proctored assessment support

User reported sandbox HTML preview was blank/unreliable. Review workflow changed from interactive HTML to **visual-first rendered checkpoints**.

## 11. Visual review workflow

User explicitly requested that subsequent development be reviewed visually, not by operating/downloading the development build.

Agreed process:
1. Preserve approved homepage.
2. Implement next development checkpoint.
3. Render screenshots/mockups of actual major screens.
4. Present them in chat for visual review.
5. Correct omissions/design drift before proceeding.

Visual checkpoints created include:
- Public homepage
- Sign in
- Learner dashboard
- Course home
- Module view
- Mini Lab
- Scenario Quiz
- Mini Project
- Capstone Project
- Gradebook & Progress
- Credentials & Pathways
- Proctored Assessment Setup

## 12. Scholarion logo

A Scholarion logo concept was generated featuring:
- Open book
- Knowledge/tree network
- Globe/global learning motif
- Deep blue/navy with gold accents
- SCHOLARION wordmark
- “LEARN. EARN. BUILD YOUR FUTURE.”
- “A GLOBAL LEARNING PLATFORM”

The logo image is included in the `/designs` folder.

## 13. Current project state at archive time

**Defined/approved:**
- Scholarion identity
- Public homepage visual direction
- LMS/application separation
- Platform modules
- SBL framework
- Capstone/mini-project requirement
- Proctoring support design
- Curriculum/catalog architecture
- Credential workflow
- Visual review workflow

**Early implementation / prototype:**
- Learner shell
- Faculty shell
- Admin shell
- LMS overview
- Proctor support page

**Still to implement operationally:**
- Persistent authentication
- Database-backed LMS objects
- Course/module engine
- Assignment/submission engine
- Scenario quiz engine
- Labs/autograding
- Projects/capstone workflow
- Gradebook/grading workspace
- Studio authoring
- Pathways engine
- Credential issuance/email/verification
- AI Tutor/Copilot services
- Analytics/Insights
- Integration layer
- Production deployment

