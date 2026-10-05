# Agentic Cloud Labs & Course Studio — acceptance map

Specification: "System Prompt — Scholarion Agentic Cloud Labs & Master Studio Generator" (§17 acceptance tests). Each line names where the behaviour is verified. Tests run in CI (`npm test`); screens are rendered and checked with axe in CI.

| # | Acceptance test | Evidence |
|---|---|---|
| 1 | Every main route renders and its controls work | `scripts/campus-render.tsx` renders all 15 learning-area routes for AI-801 (dashboard, modules, sources, lecture studio, cloud labs, mini-labs, activities, assignments, quizzes, workspaces, demos, gradebook/passbook, instructor, environment, outputs) |
| 2 | Save, leave and resume a workspace | `campus-learning-area.test.ts` "save, leave and resume keeps files…" |
| 3 | Autonomous agents run within enforced permissions | `campus-learning-area.test.ts` "disallowed tools are blocked automatically…"; `workspace/agent.ts` |
| 4 | Disallowed tools and cross-user access blocked | same file, "cross-user workspaces are blocked"; `campus-runner-lab.test.ts` "another learner's workspace…" |
| 5 | Practice doesn't consume attempts or post grades | `campus-learning-area.test.ts` "practice is unlimited…"; `campus-runner-lab.test.ts` |
| 6–7 | Two valid submissions accepted; a third rejected | "two graded attempts; the third is rejected with 409…" (both files) |
| 8 | Infrastructure failure doesn't consume an attempt | "infrastructure failure does not consume an attempt"; "a paused lab is an infrastructure failure" |
| 9 | Scores, rubric feedback and pass/fail post automatically | `graded.ts:submit → postGrade`; gradebook assertions in both files |
| 10 | Highest valid attempt recorded | "…the highest attempt is recorded" |
| 11 | Duplicate requests don't duplicate attempts or grades | "a duplicate idempotency key returns the same submission…" |
| 12 | Quiz answers reviewable after grading | "quiz attempt 2 uses different variants; Check Answers only after grading" |
| 13 | Students can't obtain answer keys | "learner views never contain answer keys"; studio "student-access outputs contain no answer-key strings"; runner lab hidden vectors |
| 14 | Projection lock hides answers and controls | "answers start locked; only the course instructor unlocks…"; PIN-locked Instructor Lab tests |
| 15 | HTML lab applications run | Student/Instructor/Demo HTML generated per module (`studio/generate.ts`), rendered in the preview |
| 16 | Application demonstrations produce results | `simlab.ts` demos and `studio-ai801-agentic_demo.html` |
| 17 | Lecture decks contain ten slides | studio "deck has exactly 10 slides…"; PowerPoint deck tests |
| 18–20 | Audio/video playable; ~5-min 720p requirements videos; ~16-min two-host audio | Scripts, captions and storyboards are generated with timing; the requirements-video preview renders with ffmpeg when present. Narrated audio and full videos are marked **awaiting rendering** — no text-to-speech service is connected, so they are not claimed as finished. |
| 21 | Sources, links, downloads, protected access | studio source tests (unavailable URLs, private hosts blocked); "learners: 403 on instructor outputs…" |
| 22 | Output sets saved in organized folders | studio "completes every step and produces every folder" (`Scholarion_Academy/<Program>/<Course>/Module_NN/<Topic>/01_Sources … 13_Environment_Templates`) |

## Graded lab: implement a bounded tool runner

Added for the module brief's lab ("Implement Bounded Tool Runner", rubric 30/30/30/10):

- Workspace template `bounded-runner` (`runner/agent.py`, `runner/bounds.json`, `runner/plan.json`, synthetic `system.log`).
- Grader `services/labgrade.ts` — **never executes learner code**. Architecture and code structure are static checks; tool bounds are the learner's JSON configuration applied by the grader to hidden tool-call vectors (traversal, look-alike roots, absolute paths, non-allowlisted hosts); task completion replays the plan against the learner's bounds and the lab policy within the step budget.
- Tool bounds is a mandatory criterion: a score above 70% still fails if bounds don't pass.
- Practice (`graded.practice_runner_lab`) checks the current files without using an attempt.

## Remaining configuration requirements

- Text-to-speech and video rendering services for narrated audio and full requirements videos.
- A container runner for real shell execution (the terminal is a simulated shell over a virtual filesystem until an administrator connects one).
- Google/NotebookLM integration is not implemented and is not claimed.
