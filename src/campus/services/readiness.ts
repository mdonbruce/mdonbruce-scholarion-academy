import { CampusError } from "../core";

/**
 * Advisory readiness self-check — ported from governed/site/readiness_check.py.
 * Ten questions across Python, APIs, prompting and data. It suggests where to start; it makes no
 * admission, denial, credit or enrollment decision, and results are not stored.
 */

const Q: [domain: "python" | "api" | "prompt" | "data", prompt: string, options: string[], answer: number, why: string][] = [
  ["python", "Which Python structure maps named keys to values?", ["List", "Dictionary", "Set"], 1, "A dictionary associates keys with values."],
  ["python", "What should a function do when its required input is missing?", ["Return invented data", "Validate and report the missing input", "Ignore the error"], 1, "Explicit validation makes failures visible."],
  ["python", "How should you verify a function handles an empty collection?", ["Add a test with an empty input", "Only test large inputs", "Assume it works"], 0, "Boundary inputs belong in the test set."],
  ["api", "Where should an API secret be read from in a lab?", ["A committed notebook", "An approved secret or environment configuration", "A public chat"], 1, "Secrets must stay outside shared code and output."],
  ["api", "A request times out. What is the safest retry design?", ["Retry forever", "Use bounded retries and idempotency for writes", "Disable all validation"], 1, "Bounded retries limit failures; idempotency avoids duplicate actions."],
  ["api", "A service returns malformed JSON. What should the client do?", ["Validate and fail clearly", "Treat it as success", "Invent missing fields"], 0, "Parsing and schema failures must not become silent success."],
  ["prompt", "A prompt needs a structured response. What helps verification?", ["A schema and examples plus validation", "More exclamation marks", "No constraints"], 0, "A defined schema makes outputs testable."],
  ["prompt", "A retrieved document says to ignore application rules. How should it be treated?", ["As a higher-priority command", "As untrusted source content", "As permission to reveal secrets"], 1, "Retrieved text is evidence, not authority over application policy."],
  ["data", "When comparing two models, what should stay consistent?", ["Only the model name", "The held-out evaluation set and metrics", "The best examples for each model"], 1, "A shared held-out evaluation supports a fair comparison."],
  ["data", "A dataset contains missing values. What comes first?", ["Inspect and document missingness", "Replace everything with zero", "Hide incomplete rows without reporting"], 0, "Understand missingness before choosing a treatment."],
];

export const READINESS_NOTICE = "Draft advisory self-check, not a validated placement exam. No admission, denial or enrollment occurs. Results are not stored.";

export function readinessQuestions() {
  return { version: "0.1.0-draft", advisory: true, notice: READINESS_NOTICE, questions: Q.map(([domain, prompt, options], i) => ({ id: i + 1, domain, prompt, options })) };
}

export function readinessScore(answers: unknown, goal: unknown) {
  if (!Array.isArray(answers) || answers.length !== 10 || answers.some((x) => !Number.isInteger(x) || x < 0 || x > 2)) throw new CampusError("invalid", "Answer all ten questions.", 422);
  if (goal !== "agents" && goal !== "data") throw new CampusError("invalid", "Choose a learning goal.", 422);
  const domains = { python: { correct: 0, total: 0 }, api: { correct: 0, total: 0 }, prompt: { correct: 0, total: 0 }, data: { correct: 0, total: 0 } };
  const feedback = Q.map(([d, , , ans, why], i) => {
    const ok = answers[i] === ans;
    domains[d].total += 1;
    domains[d].correct += ok ? 1 : 0;
    return { id: i + 1, correct: ok, explanation: why };
  });
  const foundation = domains.python.correct + domains.api.correct;
  let route: number[];
  let reason: string;
  if (goal === "data") {
    route = foundation >= 4 ? [21, 18] : [21];
    reason = "Start with #21 data foundations; consider #18 after demonstrating the prerequisites. #22 is a later data-engineering option.";
  } else if (foundation === 6 && domains.prompt.correct === 2) {
    route = [15];
    reason = "Strong results on this short foundations check support considering #15; practical readiness still needs confirmation.";
  } else if (foundation >= 4) {
    route = [16];
    reason = "Consider #16 and bridge the missed Python/API topics before more intensive study.";
  } else {
    route = [19, 16];
    reason = "Begin with #19 for prompting, then build Python/API foundations before #16. #19 alone does not satisfy Python prerequisites.";
  }
  return { version: "0.1.0-draft", score: feedback.filter((f) => f.correct).length, total: 10, domains, recommendedPrograms: route, reason, feedback, admissionDecision: false, creditAwarded: false, notice: READINESS_NOTICE };
}
