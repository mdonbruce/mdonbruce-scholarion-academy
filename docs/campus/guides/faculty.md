# Faculty guide

For instructors, teaching assistants and course designers. Staging only: demonstration data, sandbox payments, and outside connectors (meeting platforms, identity providers, proctoring and similarity tools) are not connected unless your school's administrator has set them up.

## Set up a course

1. **Home page.** In course settings choose what students see first: modules, assignments, syllabus, a **front page** (edit any page and turn on "Front page"), or **recent activity** (announcements, discussions, assignments, quizzes and pages, newest first).
2. **Modules.** Add pages, assignments, quizzes, discussions, files and tool links. Set prerequisites and requirements; locked items show students why they're locked.
3. **Grading.** Pick a grading scheme (letter, pass/fail or GPA). Set the late policy: a deduction per day *or* per hour, a floor, and a missing-work score. The missing score is stored as a real grade (marked "missing") so it appears in the gradebook history.
4. **Student permissions.** Course settings control whether students can create discussions and whether they may edit or delete their own posts.

## Pages

- Write in the text editor: `## Heading`, `- list`, `![alt text](https://…)`, `[link text](page:id)`, tables and code blocks. The accessibility check lists problems before you publish.
- **Who can edit:** teachers only, teachers and students, or anyone in the course. Students can change the body of a published page they can open, never its title or settings; every save is kept as a revision you can restore.
- Links to other course content always show the current title. Renaming or deleting the target updates every page that links to it.
- Outside embeds appear only for https sources on your school's trusted domains; anything else shows as a plain link.

## Quizzes

- Draw questions from banks by tag. Banks can be **shared with the account** so other courses under it can use them; each question keeps a content revision that increases with every content edit.
- Turn on the **calculator** (basic or scientific) for a quiz; it opens beside the questions.
- **Reports:** item analysis, **student analysis** (every attempt's answers and points per question, also as CSV) and **outcomes analysis** (per aligned outcome: average and how many students reached mastery).
- **Restrictions:** access code and IP filters. Your administrator can define named filters; use them as `@Name`.
- **Proctoring:** practice check-ins use the pre-test checklist. If your school registered an LTI proctoring tool, choose it on the quiz; students then start through that tool and are sent back to begin.

## Grading

- The grader shows each submission with rubrics, annotations and comments; post grades when ready.
- The gradebook has a grid view and an **individual view** (one student at a time, previous/next).
- If a rubric hides its score total, students see the ratings without the total.
- **Analytics** shows weekly activity and per-assignment results. Under each assignment, "Message students from this chart" writes to students who are missing work, not yet graded, or scored below/above a percentage.

## Student View

Press **Student View** to create (or reuse) the course's test student, then **Enter Student View** to use the course as that student. You can act only as your course's test student. It never counts in the roster, gradebook, analytics or reports; **Reset test student** clears its work.

## Groups and live sessions

- Group members share **group files** with a storage quota (set per group, or the account's default).
- Live sessions can carry recordings. Each recording gets a delete-after date from the session's recording retention (days); a nightly job removes expired recordings. Retention 0 means recordings aren't kept.

## Agentic Cloud Labs (AI-801 and similar courses)

- Learners work in saved workspaces (files, editor, simulated terminal, run/stop/reset/save/resume, budgets). Agent runs are autonomous within the lab policy you set in Environment; blocked actions fail automatically.
- The graded lab **Implement a bounded tool runner** is scored on architecture (30), tool bounds (30, must pass), task completion (30) and code structure (10). Learner code is never executed on the server: structure is checked and the learner's plan is replayed against their bounds.
- Every graded lab, mini-lab, quiz, worksheet and project allows two attempts; the highest counts; practice never uses an attempt.
