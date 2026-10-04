/**
 * Scholaris AI Academy — Programs #15–#25 (live and cohort), the self-paced line #28–#38,
 * the shared module library and the learning paths. All titles, outcomes, projects and copy
 * are original Scholaris writing; market references were used for gap analysis only.
 * Fees are sandbox placeholders an admin sets before go-live.
 */
import { AI_TA, COMMON_FAQ, LEAD, REFUND, TECH, type ProgramSpec, type QuizItem, type SPCourse, type WeekSpec } from "./programs-data";
import { LABS } from "./labs-data";

/* ---------------- Shared module library ---------------- */

export interface LibraryModule {
  key: string;
  title: string;
  version: string;
  content: string;
  usedBy: string[];
  dualFramework?: boolean;
  textbook?: string;
}

export const LIBRARY: LibraryModule[] = [
  { key: "env", title: "Python & AI Dev Environment", version: "1.0", content: "venv/conda, VS Code, Jupyter, Git and GitHub, secrets handling, async calls", usedBy: ["#15", "#16", "#17", "#18", "#21", "#22", "#24"] },
  { key: "pyfound", title: "Python Foundations (Gaddis-aligned)", version: "1.0", content: "Syntax, decisions and loops, functions, files, OOP, exceptions", usedBy: ["#17", "#18", "#21", "#24"], textbook: "Gaddis, Starting Out with Python, 6th ed." },
  { key: "wrangle", title: "Data Wrangling & Visualization", version: "1.0", content: "NumPy, pandas, plotting, exploratory data analysis", usedBy: ["#17", "#18", "#21", "#22", "#24"] },
  { key: "mlfound", title: "ML Foundations", version: "1.0", content: "Supervised and unsupervised learning, feature engineering, train/validate/test, cross-validation, evaluation metrics, bias–variance, scikit-learn pipelines", usedBy: ["#3", "#17", "#18", "#21", "#24"], textbook: "Raschka et al.; Géron, 3rd ed. (recommended readings)" },
  { key: "dl", title: "Neural Networks & Deep Learning", version: "1.0", content: "Perceptrons, backpropagation, optimizers, regularization, CNNs, sequence models, transfer learning, GPU training in the Cloud Lab — parallel PyTorch and TensorFlow/Keras labs", usedBy: ["#3", "#17", "#18", "#24"], dualFramework: true, textbook: "Raschka et al. (PyTorch); Géron, 3rd ed. (TensorFlow/Keras)" },
  { key: "nlp", title: "NLP & Transformers", version: "1.0", content: "Text preprocessing, embeddings, attention, transformers, fine-tuning a pretrained model, evaluation", usedBy: ["#17", "#18", "#19", "#24"], dualFramework: true },
  { key: "llm", title: "LLM Fundamentals, Context & Prompting", version: "1.0", content: "Tokens, context windows, sampling, prompt patterns, structured output, function calling", usedBy: ["#2", "#15", "#16", "#17", "#19", "#24"] },
  { key: "appdel", title: "AI App Delivery", version: "1.0", content: "FastAPI, Pydantic schemas, streaming, Streamlit and Gradio front ends", usedBy: ["#15", "#16", "#17", "#22", "#24"] },
  { key: "vectors", title: "Embeddings, Vector DBs & Hybrid Search", version: "1.0", content: "Embeddings, similarity metrics, chunking, vector stores, hybrid search", usedBy: ["#1", "#2", "#15", "#16", "#17", "#22", "#24"] },
  { key: "rag", title: "Chains, Memory & RAG", version: "1.0", content: "Prompt templates, output parsers, memory, document loaders, retrieval pipelines", usedBy: ["#1", "#2", "#15", "#16", "#17", "#24"] },
  { key: "agents", title: "Agents & Tool Use", version: "1.0", content: "Agent loops, ReAct and plan-and-execute, typed tools, tool error handling", usedBy: ["#1", "#2", "#15", "#16", "#17", "#24"] },
  { key: "graphs", title: "Graph Workflows, Human-in-the-Loop & Persistence", version: "1.0", content: "State, nodes and edges, routing, approval gates, checkpoints, sub-graphs", usedBy: ["#1", "#15", "#24"] },
  { key: "mcp", title: "MCP Servers & Ecosystem Integrations", version: "1.0", content: "Hosts, clients, servers, tools/resources/prompts, transports, permission scopes", usedBy: ["#1", "#4", "#14", "#15", "#24"] },
  { key: "multiagent", title: "Multi-Agent Orchestration", version: "1.0", content: "Supervisors, crews, handoffs, shared state, failure handling", usedBy: ["#1", "#14", "#15", "#24"] },
  { key: "agenticrag", title: "Agentic RAG & GraphRAG", version: "1.0", content: "Self-RAG, corrective RAG, reranking, query expansion, knowledge graphs, multi-hop", usedBy: ["#1", "#15", "#22", "#24"] },
  { key: "evals", title: "Evaluation, Tracing & Testing", version: "1.0", content: "Eval datasets, LLM-as-judge calibrated to human labels, regression suites, tracing", usedBy: ["#1", "#14", "#15", "#23", "#24"] },
  { key: "observe", title: "Observability, Monitoring & Fine-Tuning", version: "1.0", content: "OpenTelemetry, dashboards, drift, cost, SLOs, LoRA/QLoRA", usedBy: ["#15", "#24", "#27"] },
  { key: "guardrails", title: "Guardrails, LLM Security & Red-Teaming", version: "1.0", content: "OWASP LLM Top 10, injection, validators, PII redaction, red-team suites", usedBy: ["#1", "#15", "#22", "#24"] },
  { key: "deploy", title: "Containers, CI/CD & Cloud Deployment", version: "1.0", content: "Docker, Compose, registries, CI/CD, blue/green and canary releases", usedBy: ["#1", "#15", "#22", "#24", "#27"] },
  { key: "automation", title: "Workflow Automation", version: "1.0", content: "n8n; no-code platforms; webhooks into agents", usedBy: ["#5", "#6", "#7", "#14", "#15", "#24"] },
  { key: "responsible", title: "Responsible AI & Governance", version: "1.0", content: "Bias, privacy, explainability, regulation, oversight", usedBy: ["all"] },
  { key: "strategy", title: "AI Strategy, ROI & Change Management", version: "1.0", content: "Opportunity mapping, business cases, adoption and change", usedBy: ["#9", "#13", "#20", "#23", "#25"] },
];

/* ---------------- Learning paths ---------------- */

export const LEARNING_PATHS: { key: string; title: string; steps: string[]; note?: string }[] = [
  { key: "agentic-engineer", title: "AI Foundations → Agentic Engineer", steps: ["#21", "#18", "#19", "#16", "#15"], note: "Program #1 is the alternative final step (credit is mutually exclusive with #15)." },
  { key: "genai-builder", title: "GenAI Builder", steps: ["#19", "#2", "#17"] },
  { key: "no-code", title: "No-Code Professional", steps: ["#7", "#6", "#5"] },
  { key: "data-platforms", title: "Data & AI Platforms", steps: ["#21", "#22", "#27"], note: "#27 is proposed and not built until approved." },
  { key: "product-strategy", title: "Product & Strategy", steps: ["#20", "#23", "#12", "#13", "#25"], note: "#23 or #12, then #13 and #25." },
  { key: "long-form", title: "Long-form (all-in-one)", steps: ["#24"] },
  { key: "self-paced-to-live", title: "Self-paced → Live", steps: ["#37", "#38", "#32", "#30", "#31", "#28", "#15"], note: "#30 or #31; finish with live #15 or #1." },
  { key: "leaders", title: "Leaders", steps: ["#34", "#20", "#13", "#25"] },
  { key: "quick-start", title: "Quick-start projects", steps: ["#35", "#36"] },
];

/** Proposed, not built until the product owner approves it. */
export const PROPOSED = [{ code: "#27", title: "Certificate in MLOps & LLMOps", weeks: 8, library: ["observe", "deploy", "evals", "env"], rationale: "The reference category lists an MLOps certificate; the observability and deployment library modules already exist, so an 8-week program would mostly assemble them with a production capstone." }];

/* ---------------- helpers ---------------- */

const CAREER = ["Résumé and portfolio review", "Mock interviews", "Role mapping", "Portfolio guidance for your projects"];
const NONCREDIT = "Non-credit professional training. It does not carry academic credit.";
const FUNDING = "Self-pay, employer sponsorship, team invoicing and installments (sandbox) are accepted. As non-credit training it is not eligible for federal student aid or military education benefits.";
const VALIDITY = "The certificate does not expire; the skills it covers evolve, so refresher modules are offered.";
const GADDIS = "Gaddis, Starting Out with Python, 6th ed. (Python foundations; chapter map in the instructor guide)";
const ML_BOOKS = ["Raschka et al., Machine Learning with PyTorch and Scikit-Learn (recommended reading)", "Géron, Hands-On Machine Learning, 3rd ed. (recommended reading)"];

const w = (week: string, title: string, focus: string, lib: string[] = [], extra: Partial<WeekSpec> = {}): WeekSpec => ({ week, title, focus, lib, ...extra });

function live(p: Partial<ProgramSpec> & Pick<ProgramSpec, "code" | "slug" | "title" | "productType" | "track" | "valueStatement" | "overview" | "level" | "weeks" | "outcomes" | "audience" | "prerequisites" | "codingRequirement" | "curriculum" | "projects" | "tools">, o: { price: number; start: number; hours: [number, number] | null; schedule: string; capacity?: number; faqs?: { q: string; a: string }[]; cert?: string; badge?: string }): ProgramSpec {
  const weeksText = o.hours ? `${o.hours[0]}–${o.hours[1]} hours a week` : "a weekly load confirmed before enrollment opens";
  return {
    blocks: [{ key: "A", title: p.title, weeks: `1–${p.weeks}` }],
    learningExperience: ["Live online sessions with the faculty team", "Guided labs and office hours", "Peer groups", AI_TA, "Recordings with chapters and transcripts", "Program support desk"],
    faculty: [LEAD],
    credential: { certificate: `Scholaris AI Academy Certificate of Completion — ${o.cert ?? p.title}`, badge: o.badge ?? `${p.title.replace(/^(Advanced )?Certificate in /, "")} badge (Open Badges 3.0)`, description: `Issued when the required work and the capstone meet the rubric. ${VALIDITY}` },
    careerServices: CAREER,
    fees: { price: o.price, earlyBirdPrice: Math.round(o.price * 0.9), installments: 3, installmentFee: 0, teamMinSeats: 3, teamDiscountPct: 10, referralCredit: 100 },
    cohort: { code: `${p.code.replace("#", "P")}-NEXT`, startInDays: o.start, applicationDeadlineInDays: o.start - 7, earlyBirdInDays: Math.max(3, o.start - 14), capacity: o.capacity ?? 40, timeZone: "America/New_York", schedule: o.schedule },
    faqs: [...(o.faqs ?? []), ...COMMON_FAQ({ weeks: p.weeks, hours: weeksText, refund: REFUND, tech: TECH })],
    creditStatement: NONCREDIT,
    fundingStatement: FUNDING,
    accessMonths: 24,
    lateEnrollmentDays: 7,
    grading: "graded",
    hoursPerWeek: o.hours,
    format: "online",
    formatText: `${p.weeks} weeks · ${o.schedule}`,
    validity: VALIDITY,
    dataCards: p.dataCards ?? [{ key: `${p.slug}-data`, name: `Synthetic project datasets for ${p.title}`, purpose: "Projects and capstone", rows: 5000, fields: ["id", "features", "labels or documents"], source: "Generated by Scholaris; no real people or organizations.", caveats: "Simplified distributions for teaching." }],
    ...p,
  } as ProgramSpec;
}

function q(prompt: string, choices: string[], answer: string, explanation?: string): QuizItem {
  return { kind: "multiple_choice", prompt, choices, answer, explanation };
}
function tf(prompt: string, answer: "True" | "False", explanation?: string): QuizItem {
  return { kind: "true_false", prompt, answer, explanation };
}

function selfPaced(p: Partial<ProgramSpec> & Pick<ProgramSpec, "code" | "slug" | "title" | "valueStatement" | "overview" | "level" | "outcomes" | "audience" | "prerequisites" | "codingRequirement" | "projects" | "tools">, sp: NonNullable<ProgramSpec["selfPaced"]>, o: { price: number; hoursPerWeek: [number, number]; weeks: number }): ProgramSpec {
  const type = sp.type;
  const typeLabel = { guided_project: "Guided Project", short_course: "Short Course", specialization: "Specialization", professional_certificate: "Professional Certificate" }[type];
  const credential =
    type === "guided_project"
      ? { certificate: `Scholaris AI Academy completion badge — ${p.title}`, badge: `${p.title} completion badge (Open Badges 3.0)`, description: "Issued when the autograded build passes." }
      : type === "short_course"
        ? { certificate: `Scholaris AI Academy Course Certificate — ${p.title}`, badge: `${p.title} course badge (Open Badges 3.0)`, description: `Issued when every graded quiz (80% to pass) and the final project are complete. ${VALIDITY}` }
        : type === "specialization"
          ? { certificate: `Scholaris AI Academy Specialization Certificate — ${p.title}`, badge: `${p.title} specialization badge (Open Badges 3.0)`, description: `Issued when every course and the capstone project are complete; each course also issues a Course Certificate. ${VALIDITY}` }
          : { certificate: `Scholaris AI Academy Professional Certificate — ${p.title}`, badge: `${p.title} professional badge (Open Badges 3.0)`, description: `Issued when every course and the portfolio capstone are complete; each course also issues a Course Certificate. ${VALIDITY}` };
  const hrs = sp.courses.reduce((s, c) => s + c.hours, 0);
  return {
    productType: type,
    track: p.track ?? (p.codingRequired === false ? "No-code" : "Builder"),
    weeks: o.weeks,
    hoursPerWeek: o.hoursPerWeek,
    format: "online",
    formatText: `Self-paced · ${typeLabel} · about ${hrs} hours · ${sp.suggestedPace}`,
    blocks: sp.courses.map((c) => ({ key: c.code, title: c.title, weeks: `${c.hours} h` })),
    curriculum: sp.courses.flatMap((c, ci) => c.modules.map((m, mi) => ({ week: `${ci + 1}.${mi + 1}`, title: `${c.title}: ${m.title}`, focus: m.focus, lib: m.lib ?? [], course: c.code }))),
    learningExperience: ["Short captioned videos with transcripts and chapters", "Readings: original notes plus cited public papers and docs", "Ungraded labs with a Student Starter notebook; the Instructor EXECUTED notebook unlocks after you submit", "Graded quizzes (80% to pass, retakes after a cooldown)", ...(p.codingRequired === false ? [] : ["Autograded programming assignments in the Scholaris Cloud Lab"]), "Discussion prompts", AI_TA, "Suggested deadlines that reset automatically if you fall behind"],
    faculty: [LEAD],
    credential,
    careerServices: type === "guided_project" ? [] : ["Portfolio guidance for your final project", "Role mapping"],
    fees: { price: o.price, earlyBirdPrice: o.price, installments: 1, installmentFee: 0, teamMinSeats: 5, teamDiscountPct: 15, referralCredit: 10 },
    cohort: { code: `${p.code.replace("#", "SP")}-OPEN`, startInDays: 0, applicationDeadlineInDays: 365, earlyBirdInDays: 0, capacity: 100000, timeZone: "UTC", schedule: "Start any time" },
    faqs: [
      { q: "How does access work?", a: `Audit${sp.audit ? " is free (content visible, graded items locked)" : " isn't offered for this product"}; buy the ${typeLabel.toLowerCase()} to unlock graded work and the credential${sp.inPlus ? ", or use a Scholaris Plus subscription" : ""}. All payments are sandbox on this staging site.` },
      { q: "Does it count toward live programs?", a: "Completed specializations and professional certificates waive the equivalent modules in live programs where a transfer rule is listed on this page." },
      { q: "What if I fall behind?", a: "Suggested deadlines reset automatically. Your progress is kept." },
      { q: "Can my company license this course?", a: "Yes. Licensed cohorts get instructor-led in-class activities with an instructor edition and answer key." },
    ],
    creditStatement: NONCREDIT,
    fundingStatement: "Pay per product, or use a Scholaris Plus subscription where included (sandbox). Not eligible for federal student aid.",
    accessMonths: 12,
    lateEnrollmentDays: 0,
    grading: "graded",
    selfPaced: sp,
    formatKind: "self_paced",
    validity: VALIDITY,
    dataCards: p.dataCards ?? [{ key: `${p.slug}-data`, name: `Synthetic lab data for ${p.title}`, purpose: "Labs and final project", rows: 1000, fields: ["id", "inputs", "expected"], source: "Generated by Scholaris.", caveats: "Teaching data only." }],
    ...p,
  } as ProgramSpec;
}

const mod = (title: string, focus: string, lib: string[] = [], extra: Partial<SPCourse["modules"][number]> = {}) => ({ title, focus, lib, ...extra });

/* =====================================================================
 * Live and cohort programs #15–#25
 * ===================================================================== */

const P15_WEEKENDS: [string, string, string, string, string[]][] = [
  ["Foundations Weekend: Workbench and Delivery", "A builder's AI workbench: environments, secrets, Git and concurrent model calls", "Shipping AI behind an API: FastAPI, typed schemas, streaming and quick front ends", "", ["env", "appdel"]],
  ["Models and Meaning", "Inside the model call: context budgets, multi-provider clients, prompting patterns, structured output and function calling", "Meaning as vectors: embeddings, stores, similarity, chunking, hybrid search and retrieval architecture", "", ["llm", "vectors"]],
  ["Chains and Agents", "Composable pipelines: templates, parsers, memory, loaders and retriever strategies", "The agent loop: reason-act versus plan-execute, typed tools, SQL agents, tool failures and streamed steps", "", ["rag", "agents"]],
  ["Stateful Graphs", "State machines for agents: schemas, nodes, conditional routing, specialist routers and node tests", "Graphs that recover: cycles, self-correction, approval interrupts, checkpoints, fan-out and sub-graphs", "", ["graphs"]],
  ["Measure and Connect", "Seeing what agents do: traces, eval sets, calibrated judges, regression and A/B runs, monitoring", "Model Context Protocol, part one: hosts, clients, servers, primitives, transports, scopes and the inspector", "", ["evals", "mcp"]],
  ["Protocols and Deep Agents", "Model Context Protocol, part two: ecosystem servers, chaining, MCP inside graphs and crews, security", "Agents that improve: rubric reflection, replanning, long-term memory, consolidation and confidence flags", "", ["mcp", "agents"]],
  ["Teams and Retrieval at Depth", "Role-based crews: sequential and hierarchical processes, delegation, crew-as-node and failure handling", "Retrieval that fixes itself: self-RAG, corrective RAG, reranking, HyDE, query expansion, GraphRAG and multi-hop", "", ["multiagent", "agenticrag"]],
  ["Ship and Observe", "From laptop to cloud: images, Compose stacks, health checks, registries, CI/CD, blue/green and canary", "Running in production: OpenTelemetry, dashboards, drift, cost per run, SLOs — and when LoRA/QLoRA tuning pays off", "", ["deploy", "observe"]],
  ["Safety and Automation", "Defense in depth: the OWASP LLM Top 10, injection anatomy, rails, validators, PII redaction and red-teaming", "Automations that call agents: self-hosted n8n, triggers, LLM nodes, retries, schedules and webhook bridges", "", ["guardrails", "automation"]],
  ["Capstone Weekend", "Capstone build I: problem, architecture choice (graph, crew or hybrid), RAG, MCP, guardrails, monitoring; peer design review", "Capstone build II: containerize, CI/CD, load and cost tests, security review, docs, peer code review and a live demo", "", ["deploy", "evals"]],
];

const P15: ProgramSpec = live(
  {
    code: "#15",
    slug: "agentic-ai-engineering-weekend",
    title: "Advanced Certificate in Agentic AI Engineering — Weekend Intensive",
    productType: "live_intensive",
    track: "Builder",
    catalogTrack: "Builder",
    codingRequired: true,
    formatKind: "live_weekend",
    valueStatement: "Ten live weekends to build, secure, ship and operate production-shaped agent systems.",
    overview: [
      "A weekend intensive for working developers. Every Saturday and Sunday session is a guided build — demo, lab, checkpoint — so about 70% of your time is hands-on.",
      "You move from a clean AI workbench to retrieval, agents, stateful graphs, MCP, multi-agent crews, agentic retrieval, deployment, observability, guardrails and automation, and finish with a production-shaped capstone you defend live.",
      "Batches run every 4–6 weeks in time-zone-friendly slots, with a capped cohort size so mentors can work with you individually.",
    ],
    level: "advanced",
    weeks: 10,
    outcomes: [
      "Build and deliver LLM applications behind typed, streaming APIs with secure configuration.",
      "Design retrieval and agentic retrieval layers and measure their quality.",
      "Implement stateful graph agents, role-based crews and MCP integrations with human approval steps.",
      "Evaluate, trace, guard and red-team agent systems against known LLM risks.",
      "Containerize, deploy and monitor a multi-agent platform with CI/CD and cost controls.",
    ],
    audience: ["Software developers moving into AI engineering", "Backend and platform engineers", "Data scientists who ship services", "Technical leads building agent products"],
    prerequisites: "Working Python and comfort calling web APIs. No prior agent-framework, Docker or Kubernetes experience is needed. Take the 10-question self-check on this page.",
    codingRequirement: "Coding required — Python throughout.",
    curriculum: P15_WEEKENDS.map(([title, sat, sun, , lib], i) => w(String(i + 1), title, `${sat}. ${sun}.`, lib, { sessions: [sat, sun], kind: i === 9 ? "capstone" : undefined })),
    electives: ["E1 AI-assisted coding with quality, testing and review discipline", "E2 No-code automation platforms and hybrid Python-agent automations", "E3 Programmatic prompting and optimization (e.g., DSPy)", "E4 Agent interoperability protocols (status verified at build time)", "E5 Generative AI and LLM security"],
    projects: [
      { key: "p1", kind: "project", week: "2", name: "Guest Request Triage Agent", description: "Haven hospitality sandbox: classify, route and draft replies to guest requests with structured output.", skills: ["structured output", "routing"] },
      { key: "p2", kind: "project", week: "2", name: "Multi-Step Reasoning Assistant", description: "Answers complex policy and booking questions and compares reasoning patterns on the same set.", skills: ["prompting patterns", "evaluation"] },
      { key: "p3", kind: "project", week: "2", name: "Course Catalog Semantic Search", description: "Hybrid search over the Scholarion Demo University catalog with an evaluation table.", skills: ["embeddings", "hybrid search"] },
      { key: "p4", kind: "project", week: "3", name: "Policy Document Q&A Chain", description: "Question answering over synthetic handbooks with citations.", skills: ["retrieval", "citations"] },
      { key: "p5", kind: "project", week: "4", name: "Stateful Market-Research Graph", description: "Conditional branches and a human approval gate before publishing findings.", skills: ["graph workflows", "human-in-the-loop"] },
      { key: "p6", kind: "project", week: "7", name: "Supervisor Multi-Agent Planner", description: "A supervisor with specialist sub-agents plans event or travel logistics.", skills: ["supervisor pattern", "handoffs"] },
      { key: "p7", kind: "project", week: "7", name: "Content Operations Crew", description: "Researcher, analyst and writer roles scored with a rubric.", skills: ["crews", "rubric scoring"] },
      { key: "p8", kind: "project", week: "6", name: "Deep Research Agent", description: "Hierarchical decomposition, memory and confidence reporting.", skills: ["planning", "memory", "confidence"] },
      { key: "p9", kind: "project", week: "9", name: "Hybrid Order-Intelligence Pipeline", description: "MediGrid sandbox, non-clinical only: an n8n automation layer feeding a graph agent.", skills: ["automation", "agent integration"] },
      {
        key: "capstone", kind: "capstone", week: "10", name: "Production-Shaped Multi-Agent Platform", description: "A HavenConnect customer-intelligence sandbox platform with RAG, MCP, guardrails, tracing, dashboards, containers and CI/CD — about 15 build hours, scored on a 100-point mentor rubric with a live demo defense.", skills: ["system design", "deployment", "observability", "security"],
        requirements: ["Architecture and technology choice justified (graph, crew or hybrid)", "Retrieval layer with measured quality", "MCP integration with scoped permissions", "Guardrails and a red-team pass", "Tracing and a monitoring dashboard", "Containerized stack with CI/CD", "Load and cost test results", "Docs: README, API spec and ADRs", "Peer code review addressed", "Live demo defense", "Security review", "Retrospective and limitations", "Cost per run reported", "Evaluation suite with a baseline", "Clear human approval points", "Clean repository and reproducible setup", "Incident and rollback plan", "Data card for every dataset", "Accessibility of the demo UI", "Presentation quality"],
      },
    ],
    tools: [
      { family: "Languages and environments", items: ["Python", "VS Code", "Jupyter"] },
      { family: "Model access", items: ["At least two LLM providers", "A local open-model runtime"] },
      { family: "Frameworks", items: ["Graph and chain frameworks", "A role-based crew framework", "A conversational multi-agent framework", "An indexing framework", "DSPy"] },
      { family: "Data and retrieval", items: ["Local and managed vector databases", "Pydantic"] },
      { family: "Apps", items: ["FastAPI", "Streamlit or Gradio", "A visual flow builder"] },
      { family: "MCP", items: ["MCP SDK", "MCP inspector"] },
      { family: "Ops", items: ["A tracing/eval platform", "OpenTelemetry", "Prometheus and Grafana", "An LLM-monitoring tool", "Docker and Compose", "GitHub Actions", "One cloud container runtime"] },
      { family: "Safety", items: ["Guardrail frameworks", "PII redaction"] },
      { family: "Automation and model hub", items: ["n8n", "Hugging Face with PEFT"] },
    ],
    completion: "weekend_intensive",
    gradedPerformance: true,
    mutuallyExclusive: ["#1"],
    passRules: ["All 20 live modules attended, or the recording reviewed with the lab submitted", "All module assessments passed", "Capstone at least 70/100 on the mentor rubric, with a live demo defense", "Final knowledge check passed (2 attempts, free remediation between attempts)"],
    batches: [
      { code: "AAE-AM", label: "Americas morning batch", startInDays: 12, timeZone: "America/New_York", satStart: "10:00", sunStart: "10:00", capacity: 30 },
      { code: "AAE-PM", label: "Evening batch", startInDays: 12, timeZone: "America/New_York", satStart: "18:00", sunStart: "18:00", capacity: 30 },
      { code: "AAE-NEXT", label: "Next rolling batch (Lagos/London friendly)", startInDays: 47, timeZone: "Africa/Lagos", satStart: "14:00", sunStart: "14:00", capacity: 30 },
    ],
    selfCheck: {
      questions: [
        { id: "a1", prompt: "What does json.loads return for '{\"a\": 1}'?", options: ["a dict", "a string", "a list", "a tuple"], answer: "a dict" },
        { id: "a2", prompt: "Which HTTP method usually creates a resource?", options: ["POST", "GET", "HEAD", "OPTIONS"], answer: "POST" },
        { id: "a3", prompt: "What does `await` do inside an async function?", options: ["pauses until the awaited task completes", "starts a new thread", "blocks the whole program forever", "converts code to C"], answer: "pauses until the awaited task completes" },
        { id: "a4", prompt: "Where should an API key live in a project?", options: ["an environment variable or secret store", "hard-coded in the source", "in the README", "in a public gist"], answer: "an environment variable or secret store" },
        { id: "a5", prompt: "What is a Python virtual environment for?", options: ["isolating a project's packages", "speeding up the CPU", "encrypting files", "hosting a website"], answer: "isolating a project's packages" },
        { id: "a6", prompt: "A 429 response from an API usually means…", options: ["too many requests — back off and retry", "success", "the resource was created", "the server moved"], answer: "too many requests — back off and retry" },
        { id: "a7", prompt: "An embedding is…", options: ["a vector representing meaning", "a compressed zip file", "a database index type only", "a GPU driver"], answer: "a vector representing meaning" },
        { id: "a8", prompt: "Structured output from an LLM is most useful when…", options: ["code must parse the answer reliably", "you want longer answers", "you want to hide the prompt", "the model is offline"], answer: "code must parse the answer reliably" },
        { id: "a9", prompt: "What does `git commit` do?", options: ["records staged changes in the local history", "uploads to GitHub", "deletes a branch", "installs packages"], answer: "records staged changes in the local history" },
        { id: "a10", prompt: "Which is a typed schema library common in Python APIs?", options: ["Pydantic", "Pillow", "Pygame", "Pytest-mock"], answer: "Pydantic" },
      ],
      passMin: 8,
      routeTo: ["#16", "#19"],
    },
    selfCheckBands: [
      { min: 8, route: ["#15"], message: "You're ready for #15." },
      { min: 5, route: ["#16"], message: "Start with #16 (Agentic AI for Developers); it credits into #15 Weekends 1–3." },
      { min: 0, route: ["#19", "#16"], message: "Start with #19 (LLM Prompt Engineering) and then #16 before #15." },
    ],
    dataCards: [
      { key: "guest_requests", name: "Synthetic guest requests (Haven hospitality sandbox)", purpose: "P1 triage agent", rows: 3000, fields: ["request_id", "channel", "text", "category", "urgency"], source: "Generated by Scholaris.", caveats: "Fictional guests and properties." },
      { key: "handbooks", name: "Synthetic policy handbooks", purpose: "P4 Q&A chain", rows: 40, fields: ["doc_id", "section", "text"], source: "Written by Scholaris.", caveats: "Not real policy." },
      { key: "orders", name: "Synthetic pharmacy order events (MediGrid, non-clinical)", purpose: "P9 hybrid pipeline", rows: 20000, fields: ["order_id", "status", "warehouse", "eta"], source: "Generated by Scholaris.", caveats: "No patient or clinical data; non-clinical status only." },
    ],
  },
  { price: 3200, start: 12, hours: [10, 12], schedule: "Saturdays and Sundays, 3 hours each (60 live hours) plus 4–6 hours of self-paced lab work", capacity: 30, badge: "Agentic AI Engineering capstone badge (Open Badges 3.0)", faqs: [{ q: "How is #15 different from Program 1?", a: "Same domain, different format: #15 is a weekend intensive with deeper production and MLOps work. Credit for the two is mutually exclusive." }, { q: "What if I miss a session?", a: "Review the recording and submit that session's lab — it counts as attended." }] },
);

const P16: ProgramSpec = live(
  {
    code: "#16", slug: "agentic-ai-for-developers", title: "Certificate in Agentic AI for Developers", productType: "live_intensive", track: "Builder", catalogTrack: "Builder", codingRequired: true, formatKind: "live_weekend",
    valueStatement: "Five live weekends from your first model call to a deployed, evaluated agent.",
    overview: ["An on-ramp for developers: environment and app delivery, model APIs and prompting, retrieval basics, tool-using agents, and a first look at graph workflows and MCP.", "It credits into #15 Weekends 1–3, so you can continue straight into the intensive."],
    level: "intermediate", weeks: 5,
    outcomes: ["Set up a secure AI development workbench and deliver a model-backed API.", "Use model APIs with prompting patterns and structured output.", "Build a basic retrieval pipeline with citations.", "Implement a tool-using agent with error handling.", "Deploy a single-agent app and evaluate it against a test set."],
    audience: ["Developers new to LLM applications", "Engineers preparing for #15"], prerequisites: "Working Python and basic web API experience.", codingRequirement: "Coding required — Python.",
    curriculum: [
      w("1", "Workbench and Delivery", "Environments, secrets and Git; a FastAPI service with typed schemas and streaming.", ["env", "appdel"], { sessions: ["Workbench setup and secure configuration", "Your first model-backed API"] }),
      w("2", "Talking to Models", "Model APIs, prompting patterns, structured output and function calling.", ["llm"], { sessions: ["Prompt patterns that hold up", "Structured output and function calls"] }),
      w("3", "Retrieval Basics", "Embeddings, chunking, vector search and grounded answers with citations.", ["vectors", "rag"], { sessions: ["Embeddings and vector search", "A cited retrieval pipeline"] }),
      w("4", "Agents With Tools", "The agent loop, typed tools and failure handling; a first graph workflow and MCP server.", ["agents", "graphs", "mcp"], { sessions: ["Tool-using agents", "Graphs and MCP: a first look"] }),
      w("5", "Ship It", "Deploy the agent, write an evaluation set and present results.", ["deploy", "evals"], { kind: "capstone", sessions: ["Deploy and evaluate", "Capstone demos"] }),
    ],
    projects: [{ key: "capstone", kind: "capstone", week: "5", name: "Deployed Single-Agent App With Evaluation", description: "A deployed agent with typed tools and an evaluation report against a test set.", skills: ["deployment", "evaluation", "tool use"], requirements: ["Deployed and reachable", "Typed tools with error handling", "Evaluation set and results", "Grounded answers where retrieval is used", "Short demo"] }],
    tools: [{ family: "Development", items: ["Python", "VS Code", "FastAPI", "Streamlit or Gradio"] }, { family: "Models and retrieval", items: ["An LLM API", "A vector database"] }, { family: "Agents", items: ["A graph framework", "MCP SDK"] }],
    waives: [{ toCode: "#15", weeks: ["1", "2", "3"], note: "Completion of #16 waives #15 Weekends 1–3 (Modules 1–6)." }],
  },
  { price: 1400, start: 19, hours: [6, 8], schedule: "Saturdays and Sundays, 3 hours each (30 live hours)", capacity: 40 },
);

const P17: ProgramSpec = live(
  {
    code: "#17", slug: "generative-ai-professional-pathway", title: "Generative AI Professional Pathway", productType: "pathway", track: "Builder", catalogTrack: "Builder", codingRequired: true, formatKind: "cohort",
    valueStatement: "A stacked 24-week path from Python and data to shipped generative AI products.",
    overview: ["Five stacked courses in order: Data Science with Python (#21 core), AI with Python (#18 core), LLM Prompt Engineering (#19), a new GenAI Applications course, and Agentic AI for Developers (#16).", "Each course issues its own certificate; finishing the path adds the pathway credential."],
    level: "intermediate", weeks: 24,
    outcomes: ["Analyze data and build ML models in Python.", "Train and evaluate deep learning and NLP models.", "Design, evaluate and secure prompts for business workflows.", "Build multimodal and retrieval-backed GenAI applications responsibly.", "Deliver a GenAI product prototype with an evaluation and launch case."],
    audience: ["Career changers with basic programming", "Analysts and developers moving into GenAI"], prerequisites: "Basic programming. The Python foundations material is aligned with Gaddis, Starting Out with Python, 6th ed.", codingRequirement: "Coding required — Python.",
    pathway: { includes: ["#21", "#18", "#19", "#16"], note: "GenAI Applications (8 weeks) is the new course in this pathway; the capstone sits in its final week." },
    curriculum: [
      w("1", "GenAI Applications: Multimodal Foundations", "Text, image and audio models and what each is good for.", ["llm"], { course: "GENAI" }),
      w("2", "Retrieval-Backed Apps", "Building retrieval apps end to end with evaluation.", ["vectors", "rag"], { course: "GENAI" }),
      w("3", "Fine-Tuning, Gently", "When and how to fine-tune a small model; parameter-efficient methods.", ["nlp", "observe"], { course: "GENAI", dual: true }),
      w("4", "Images and Audio, Responsibly", "Image and audio generation under Haven consent and provenance rules; disclosure and watermarking.", ["responsible"], { course: "GENAI" }),
      w("5", "Apps People Use", "Delivery with FastAPI and simple front ends; streaming and latency.", ["appdel"], { course: "GENAI" }),
      w("6", "Evaluation and Safety", "Evaluating GenAI apps; injection and data-leak risks.", ["evals", "guardrails"], { course: "GENAI" }),
      w("7", "Product Thinking for GenAI", "Users, metrics and cost for a GenAI product.", ["strategy"], { course: "GENAI" }),
      w("8", "Capstone: GenAI Product Prototype", "Prototype, evaluation and launch case.", ["evals"], { course: "GENAI", kind: "capstone" }),
    ],
    projects: [{ key: "capstone", kind: "capstone", week: "8", name: "GenAI Product Prototype", description: "A working GenAI prototype with an evaluation report, safety notes and a launch case.", skills: ["product prototyping", "evaluation", "responsible GenAI"], requirements: ["Working prototype", "Evaluation set and results", "Safety and consent review", "Cost and latency notes", "Launch case and demo"] }],
    tools: [{ family: "Core", items: ["Python", "Jupyter", "Google Colab"] }, { family: "Models", items: ["LLM APIs", "An image or audio generation API (consented use only)", "Hugging Face with PEFT"] }, { family: "Apps", items: ["FastAPI", "Streamlit or Gradio", "A vector database"] }],
    textbooks: [GADDIS, ...ML_BOOKS],
  },
  { price: 5200, start: 28, hours: [8, 10], schedule: "Weekly live session plus self-paced work, 24 weeks", cert: "Generative AI Professional Pathway", badge: "Generative AI Professional Pathway credential (Open Badges 3.0)" },
);

const P18: ProgramSpec = live(
  {
    code: "#18", slug: "ai-with-python", title: "Certificate in Artificial Intelligence with Python (TensorFlow & PyTorch)", productType: "cohort_program", track: "Builder", catalogTrack: "Builder", codingRequired: true, formatKind: "cohort",
    valueStatement: "Eight weeks from search and classical ML to deep learning and NLP — in both major frameworks.",
    overview: ["A cohort program that moves from AI problem solving through the full ML workflow to neural networks, vision and language models.", "Every deep learning lab ships in PyTorch and TensorFlow/Keras versions; you pick one, and the instructor solution covers both."],
    level: "intermediate", weeks: 8,
    outcomes: ["Frame AI problems and apply search and problem-solving methods.", "Build data training pipelines and engineer features.", "Train and evaluate supervised and unsupervised models with appropriate metrics.", "Train neural networks, CNNs and transformer models in PyTorch or TensorFlow/Keras.", "Document models responsibly with model cards and bias checks."],
    audience: ["Developers and analysts with basic Python", "Learners continuing from #21"], prerequisites: "Basic Python (a Gaddis-aligned refresher is included in Week 1) and high-school algebra.", codingRequirement: "Coding required — Python.",
    curriculum: [
      w("1", "Thinking Like an AI Builder", "The AI landscape, search and problem solving, and a Gaddis-aligned Python refresher.", ["pyfound", "env"]),
      w("2", "Data Training Pipelines", "Data preparation, training pipelines and feature engineering.", ["wrangle", "mlfound"]),
      w("3", "Supervised Learning and Model Evaluation", "Metrics, cross-validation, confusion matrices, ROC/PR and calibration.", ["mlfound"]),
      w("4", "Finding Structure", "Clustering and dimensionality reduction.", ["mlfound"]),
      w("5", "Neural Networks in Two Frameworks", "From scratch to PyTorch and TensorFlow/Keras: training loops, optimizers, regularization.", ["dl"], { dual: true }),
      w("6", "Seeing With CNNs", "Convolutional networks and transfer learning for vision.", ["dl"], { dual: true }),
      w("7", "Language Models", "Text pipelines, embeddings, sequence models, transformers, fine-tuning a small pretrained model.", ["nlp"], { dual: true }),
      w("8", "Responsible ML and Capstone", "Bias, explainability, model cards, and the capstone.", ["responsible"], { kind: "capstone" }),
    ],
    projects: [{ key: "capstone", kind: "capstone", week: "8", name: "End-to-End Model With a Model Card", description: "A tabular, vision or NLP model trained and evaluated as a baseline and in a deep learning framework, documented with a model card.", skills: ["ML workflow", "deep learning", "model documentation"], requirements: ["Baseline model and metrics", "Deep learning model in PyTorch or TensorFlow/Keras", "Evaluation with appropriate metrics", "Bias and error analysis", "Model card"] }],
    tools: [{ family: "Core", items: ["Python", "Jupyter", "scikit-learn"] }, { family: "Deep learning", items: ["PyTorch", "TensorFlow/Keras", "Hugging Face Transformers"] }, { family: "Compute", items: ["Scholaris Cloud Lab (GPU templates planned)"] }],
    textbooks: [GADDIS, ...ML_BOOKS],
    adoptCourse: { courseId: "crs_academy_p18", weeks: { "5": "mod_academy_p15_1", "6": "mod_academy_p15_2" } },
  },
  { price: 1900, start: 10, hours: [8, 10], schedule: "Two live sessions a week plus labs", capacity: 40 },
);

const P19: ProgramSpec = live(
  {
    code: "#19", slug: "llm-prompt-engineering", title: "Certificate in LLM Prompt Engineering & LLM Applications", productType: "cohort_program", track: "Builder-light", catalogTrack: "Builder", codingRequired: false, formatKind: "cohort",
    valueStatement: "Five weeks to design, test and secure prompts — and ship a small LLM app around them.",
    overview: ["Learn how models read prompts, which patterns hold up, how to measure prompt quality with test sets, and how to defend against injection and leakage.", "Light coding: notebooks are provided, and the capstone pairs an evaluated prompt suite with a small app."],
    level: "beginner", weeks: 5,
    outcomes: ["Explain how LLMs process prompts and context.", "Apply prompt patterns and structured outputs to business tasks.", "Evaluate prompts with test sets and track regressions.", "Defend prompts against injection and data leakage.", "Build a reusable prompt library and a small LLM application."],
    audience: ["Analysts and operations staff", "Developers new to LLMs", "Product and content teams"], prerequisites: "Comfort with spreadsheets or basic scripting. No prior AI experience needed.", codingRequirement: "Light coding — provided notebooks; no prior coding required.",
    curriculum: [
      w("1", "How Models Read", "Tokens, context, sampling and why wording matters.", ["llm"]),
      w("2", "Patterns and Structure", "Prompt patterns, structured outputs and retrieval-backed prompting.", ["llm", "rag"]),
      w("3", "Testing Prompts", "Test sets, rubrics, regression runs and a reusable prompt library.", ["evals"]),
      w("4", "Prompt Security and Programmatic Prompting", "Injection, leakage and an introduction to programmatic prompt optimization; multimodal prompts.", ["guardrails", "llm"]),
      w("5", "Capstone: Evaluated Prompt Suite and App", "An evaluated prompt suite plus a small LLM app for a business workflow.", ["evals"], { kind: "capstone" }),
    ],
    projects: [{ key: "capstone", kind: "capstone", week: "5", name: "Evaluated Prompt Suite and LLM App", description: "A versioned prompt library with a test set and results, wrapped in a small app for one business workflow.", skills: ["prompt design", "evaluation", "prompt security"], requirements: ["Prompt library with versions", "Test set and pass rates", "Injection tests", "Working app", "Demo"] }],
    tools: [{ family: "Core", items: ["A chat-based LLM", "Google Colab notebooks", "An LLM API (Scholaris sandbox key)"] }, { family: "Evaluation", items: ["A prompt evaluation tool (selected at cohort start)"] }],
  },
  { price: 900, start: 14, hours: [4, 6], schedule: "Weekly live session plus self-paced work" },
);

const P20: ProgramSpec = live(
  {
    code: "#20", slug: "genai-business-transformation", title: "Certificate in Generative AI for Business Transformation", productType: "cohort_program", track: "Business", catalogTrack: "Business & Leadership", codingRequired: false, formatKind: "cohort",
    valueStatement: "Six no-code weeks to find, prioritize and pilot generative AI in your business.",
    overview: ["A condensed form of Program 13's first course — how generative AI works, prompting for leaders, AI across functions and responsible AI — plus a one-week use-case portfolio sprint.", "It credits toward Program 13."],
    level: "beginner", weeks: 6,
    outcomes: ["Explain generative AI capabilities, costs and limits in business terms.", "Use prompting safely in executive and team workflows.", "Identify generative AI opportunities across business functions.", "Apply responsible AI and policy basics to proposed uses.", "Present a prioritized opportunity map with a pilot plan."],
    audience: ["Managers and functional leads", "Consultants", "Business owners"], prerequisites: "None.", codingRequirement: "No coding required.",
    curriculum: [
      w("1", "What Changed, and Why It Matters", "Generative AI's business impact through a leader's lens.", ["strategy"]),
      w("2", "Generative AI Without Jargon", "Context, hallucinations, cost and vendor-claim red flags.", ["llm"]),
      w("3", "Prompting at Work", "Workflows, templates and what never to paste into public tools.", ["llm"]),
      w("4", "AI Across Functions", "Marketing, operations, HR, finance and product through cited public cases.", ["strategy"]),
      w("5", "Responsible Use", "Bias, privacy, regulation and an internal AI-use policy.", ["responsible"]),
      w("6", "Use-Case Portfolio Sprint", "Prioritize opportunities and plan a pilot.", ["strategy"], { kind: "capstone" }),
    ],
    projects: [{ key: "capstone", kind: "capstone", week: "6", name: "Prioritized Opportunity Map and Pilot Plan", description: "An effort–impact–risk map of opportunities and a pilot plan for the top one.", skills: ["prioritization", "pilot planning"], requirements: ["Opportunity map", "Prioritization rationale", "Pilot plan with owner and KPIs", "Risk notes", "Presentation"] }],
    tools: [{ family: "Exploration", items: ["A chat-based LLM assistant"] }, { family: "Collaboration", items: ["Slides and documents", "A whiteboard tool"] }],
    waives: [{ toCode: "#13.1", weeks: ["1", "2", "3", "4", "5"], note: "Completion of #20 waives #13 Course 1 Weeks 1–5." }, { toCode: "#13", weeks: ["1", "2", "3", "4", "5"], note: "Completion of #20 waives #13 Weeks 1–5." }],
  },
  { price: 1100, start: 21, hours: [3, 5], schedule: "Weekly live session (no code)" },
);

const P21: ProgramSpec = live(
  {
    code: "#21", slug: "data-science-with-python", title: "Certificate in Data Science with Python", productType: "cohort_program", track: "Builder", catalogTrack: "Data", codingRequired: true, formatKind: "cohort",
    valueStatement: "Eight weeks to clean, explore, test and communicate data with Python.",
    overview: ["From a Gaddis-aligned Python refresh to NumPy and pandas, cleaning, exploration, statistics, a first scikit-learn model and telling the story with data.", "It's the prerequisite path for #18 and #22."],
    level: "beginner", weeks: 8,
    outcomes: ["Write Python for data tasks using core language features.", "Clean and reshape data with NumPy and pandas.", "Explore and visualize data to find patterns.", "Apply statistics and hypothesis tests correctly.", "Build an introductory model and communicate results in a report and dashboard."],
    audience: ["Analysts", "Career changers", "Developers new to data"], prerequisites: "Basic computer skills; the Week 1 refresher covers Python from Gaddis, Starting Out with Python, 6th ed.", codingRequirement: "Coding required — Python (taught from basics).",
    curriculum: [
      w("1", "Python for Data", "A Gaddis-aligned refresh: types, decisions, loops, functions and files.", ["pyfound", "env"]),
      w("2", "Arrays and Frames", "NumPy arrays and pandas data frames.", ["wrangle"]),
      w("3", "Cleaning Real-World Data", "Missing values, types, duplicates and reshaping.", ["wrangle"]),
      w("4", "Seeing the Data", "EDA and visualization.", ["wrangle"]),
      w("5", "Statistics That Hold Up", "Distributions, confidence intervals and hypothesis tests.", ["mlfound"]),
      w("6", "A First Model", "Introductory ML with scikit-learn.", ["mlfound"]),
      w("7", "Storytelling With Data", "Reports and dashboards for decision makers.", ["wrangle"]),
      w("8", "Capstone: Analysis and Dashboard", "An analysis report and dashboard on a large synthetic dataset.", [], { kind: "capstone" }),
    ],
    projects: [{ key: "capstone", kind: "capstone", week: "8", name: "Analysis Report and Dashboard", description: "A reproducible analysis and dashboard on a large synthetic dataset.", skills: ["data cleaning", "statistics", "communication"], requirements: ["Reproducible notebook", "Cleaning log", "Correct statistical tests", "Dashboard", "Written findings and limits"] }],
    tools: [{ family: "Core", items: ["Python", "Jupyter", "NumPy", "pandas", "Matplotlib", "scikit-learn"] }, { family: "Dashboards", items: ["Streamlit"] }],
    textbooks: [GADDIS],
    prerequisiteFor: ["#22"],
    feeds: ["#18"],
  },
  { price: 1500, start: 7, hours: [6, 8], schedule: "Two live sessions a week plus labs" },
);

const P22: ProgramSpec = live(
  {
    code: "#22", slug: "data-engineering-with-genai", title: "Advanced Certificate in Data Engineering with Generative AI", productType: "cohort_program", track: "Builder", catalogTrack: "Data", codingRequired: true, formatKind: "cohort",
    valueStatement: "Twelve weeks to build data platforms that feed reliable, governed AI.",
    overview: ["Core data engineering — SQL and modeling, batch and streaming pipelines, orchestration, lakehouse concepts, quality and lineage, one cloud data platform — followed by the data layer generative AI needs.", "You finish with a production-style pipeline that keeps a retrieval application fresh."],
    level: "advanced", weeks: 12,
    outcomes: ["Model data and write efficient SQL for analytics.", "Build batch and streaming pipelines with orchestration.", "Apply data quality, lineage and governance controls.", "Engineer ingestion, embedding and vector-store pipelines at scale.", "Use LLM-assisted ETL and SQL generation with validation."],
    audience: ["Data engineers", "Analytics engineers", "Backend developers moving into data"], prerequisites: "Program #21 or equivalent Python and SQL experience (an advisor can confirm equivalence).", codingRequirement: "Coding required — Python and SQL.",
    curriculum: [
      w("1", "SQL and Data Modeling", "Relational modeling, dimensional design and performant SQL.", ["env"]),
      w("2", "Batch Pipelines", "Extract, transform, load; idempotency and backfills.", []),
      w("3", "Streaming Pipelines", "Events, windows and exactly-once concerns.", []),
      w("4", "Orchestration", "Scheduling, dependencies, retries and alerting.", []),
      w("5", "Lakehouse Concepts", "Tables, formats and governance on one verified platform.", []),
      w("6", "Quality and Lineage", "Tests, contracts and lineage tracking.", ["evals"]),
      w("7", "Cloud Data Services", "One provider's managed data services, chosen and verified.", ["deploy"]),
      w("8", "Document Ingestion for AI", "Parsing, chunking and metadata for retrieval.", ["vectors"]),
      w("9", "Embedding Pipelines at Scale", "Batch embedding, vector-store operations and cost.", ["vectors", "agenticrag"]),
      w("10", "Fresh, Governed Retrieval Data", "RAG freshness, PII handling and governance.", ["guardrails", "responsible"]),
      w("11", "LLM-Assisted ETL and SQL", "Generating transforms and SQL with validation gates.", ["llm", "evals"]),
      w("12", "Capstone: Pipeline Feeding a RAG App", "A production-style pipeline that keeps a retrieval app current.", ["appdel"], { kind: "capstone" }),
    ],
    projects: [{ key: "capstone", kind: "capstone", week: "12", name: "Production-Style Pipeline Feeding a RAG App", description: "Ingestion, transformation, quality checks and embedding refresh feeding a retrieval application.", skills: ["pipelines", "data quality", "vector operations"], requirements: ["Orchestrated pipeline", "Data quality tests", "Lineage documented", "Embedding refresh with freshness metric", "PII controls", "RAG app reading the data"] }],
    tools: [{ family: "Data", items: ["PostgreSQL", "One orchestration tool", "One lakehouse platform (verified at cohort start)"] }, { family: "AI data layer", items: ["A vector database", "An embedding API"] }, { family: "Ops", items: ["Docker", "GitHub Actions"] }],
  },
  { price: 2600, start: 35, hours: [8, 10], schedule: "Two live sessions a week plus labs" },
);

const P23: ProgramSpec = live(
  {
    code: "#23", slug: "ai-product-management", title: "Advanced Certificate in AI Product Management", productType: "cohort_program", track: "Business & Product", catalogTrack: "Product", codingRequired: false, formatKind: "cohort",
    valueStatement: "Ten weeks of AI product management craft — from discovery to launch and beyond.",
    overview: ["The day-to-day craft of managing AI products: discovery, research, feasibility, specs, evaluations, metrics, responsible AI, unit economics, launch and working with ML and agent teams.", "Program 12 focuses on designing and pitching an AI product; this program focuses on running one. Shared modules don't earn double credit."],
    level: "intermediate", weeks: 10,
    outcomes: ["Discover and validate AI product opportunities with users.", "Assess data readiness and technical feasibility.", "Write AI product requirements with evaluation criteria.", "Define metrics, experiments and unit economics for AI features.", "Plan launches and post-launch monitoring with responsible AI controls."],
    audience: ["Product managers", "Product owners", "Founders"], prerequisites: "Product or project experience helps; no coding required.", codingRequirement: "No coding required.",
    curriculum: [
      w("1", "Finding AI Opportunities", "Problem discovery and where AI genuinely helps.", ["strategy"]),
      w("2", "Researching With Users", "User research for AI-powered experiences.", []),
      w("3", "Data and Feasibility", "Data readiness and technical feasibility with your team.", ["mlfound"]),
      w("4", "Specs for Probabilistic Products", "AI PRDs and specifications with acceptance criteria.", []),
      w("5", "Evals for PMs", "Model and agent evaluations product managers can own.", ["evals"]),
      w("6", "Metrics and Experiments", "North-star and guardrail metrics; experimentation.", ["evals"]),
      w("7", "Responsible AI in the Lifecycle", "Compliance, oversight and documentation.", ["responsible"]),
      w("8", "Unit Economics", "Pricing and cost of AI features.", ["strategy"]),
      w("9", "Launch and Monitor", "Launch plans and post-launch monitoring; working with ML and agent teams.", ["observe"]),
      w("10", "Capstone: Full AI Product Spec", "Spec with evaluation and launch plans.", [], { kind: "capstone" }),
    ],
    projects: [{ key: "capstone", kind: "capstone", week: "10", name: "Full AI Product Spec With Eval and Launch Plans", description: "A complete spec for an AI feature with an evaluation plan and a launch plan.", skills: ["specification", "evaluation planning", "launch planning"], requirements: ["Problem and users", "Feasibility and data assessment", "PRD with acceptance criteria", "Evaluation plan", "Metrics and unit economics", "Launch and monitoring plan", "Responsible AI review"] }],
    tools: [{ family: "Product", items: ["Documents and slides", "A whiteboard tool", "A chat-based LLM for prototyping"] }],
  },
  { price: 2100, start: 28, hours: [5, 7], schedule: "Weekly live session plus self-paced work" },
);

const P24: ProgramSpec = live(
  {
    code: "#24", slug: "extended-generative-agentic-ai", title: "Extended Professional Program in Generative & Agentic AI", productType: "pathway", track: "Builder", catalogTrack: "Builder", codingRequired: true, formatKind: "cohort",
    valueStatement: "A 32-week flagship path from data science to production agent systems, finished with an industry capstone.",
    overview: ["The long-form path: Data Science with Python (#21 core), AI with Python (#18), LLM Prompt Engineering (#19), the agentic foundations content of Program 2, and the #15 engineering content paced weekly rather than on weekends.", "It ends with a 12-week, mentor-supervised industry capstone in finance, hospitality, education or healthcare operations — all on synthetic data — with career-services milestones along the way."],
    level: "intermediate", weeks: 32,
    outcomes: ["Build data and ML foundations in Python.", "Train and evaluate deep learning and NLP models.", "Design, evaluate and secure LLM prompts and applications.", "Engineer, deploy and operate multi-agent systems.", "Deliver a mentor-supervised industry capstone."],
    audience: ["Career changers committed to AI engineering", "Developers wanting the full path"], prerequisites: "Basic programming; Python foundations are aligned with Gaddis, Starting Out with Python, 6th ed.", codingRequirement: "Coding required — Python.",
    pathway: { includes: ["#21", "#18", "#19", "#15"], missing: ["#2"], note: "Program 2 content joins the sequence once Program 2 is in the catalog. #15 content is cohort-paced here, not a weekend intensive." },
    curriculum: [
      w("1", "Industry Capstone: Track Selection", "Choose a finance, hospitality, education or healthcare-operations track; scope a problem with your mentor.", ["strategy"], { course: "CAP" }),
      w("2", "Industry Capstone: Data and Design", "Synthetic data, data cards and system design review.", ["evals"], { course: "CAP" }),
      w("3", "Industry Capstone: Build Sprint 1", "Core pipeline and agents.", ["agents"], { course: "CAP" }),
      w("4", "Industry Capstone: Build Sprint 2", "Retrieval and tools.", ["agenticrag", "mcp"], { course: "CAP" }),
      w("5", "Industry Capstone: Evaluation", "Evaluation suite and baselines.", ["evals"], { course: "CAP" }),
      w("6", "Industry Capstone: Safety", "Guardrails and a red-team pass.", ["guardrails"], { course: "CAP" }),
      w("7", "Industry Capstone: Deployment", "Containers, CI/CD and monitoring.", ["deploy", "observe"], { course: "CAP" }),
      w("8", "Career Milestone: Portfolio Review", "Portfolio and résumé review (a service, not a placement promise).", [], { course: "CAP" }),
      w("9", "Industry Capstone: Hardening", "Load, cost and security testing.", ["deploy"], { course: "CAP" }),
      w("10", "Career Milestone: Mock Interviews", "Technical mock interviews with mentors.", [], { course: "CAP" }),
      w("11", "Industry Capstone: Documentation", "README, ADRs and an operations guide.", [], { course: "CAP" }),
      w("12", "Industry Capstone: Defense", "Final presentation and defense.", [], { course: "CAP", kind: "capstone" }),
    ],
    projects: [{ key: "capstone", kind: "capstone", week: "12", name: "Mentor-Supervised Industry Capstone", description: "A production-shaped system for one industry track, built on synthetic data with a mentor.", skills: ["system design", "evaluation", "deployment", "communication"], requirements: ["Problem scoped with mentor", "Synthetic data with data cards", "Evaluation suite with baseline", "Guardrails and red-team results", "Deployed with monitoring", "Documentation", "Final defense"] }],
    tools: [{ family: "Across the path", items: ["Python", "Jupyter", "scikit-learn", "PyTorch or TensorFlow/Keras", "LLM APIs", "Graph and crew frameworks", "MCP SDK", "Docker", "GitHub Actions"] }],
    textbooks: [GADDIS, ...ML_BOOKS],
  },
  { price: 7800, start: 42, hours: [10, 12], schedule: "Weekly live sessions plus labs, 32 weeks", cert: "Extended Professional Program in Generative & Agentic AI", badge: "Extended Generative & Agentic AI program credential (Open Badges 3.0)" },
);

const P25: ProgramSpec = live(
  {
    code: "#25", slug: "applied-ai-business-leaders", title: "Extended Professional Certificate in Applied AI for Business Leaders", productType: "pathway", track: "Leadership", catalogTrack: "Business & Leadership", codingRequired: false, formatKind: "cohort",
    valueStatement: "Twenty-four weeks to lead a real AI initiative from governance to a board-ready readout.",
    overview: ["Both courses of Program 13 — generative AI strategy and agent adoption — followed by an 8-week Leadership Practicum in which you lead an AI initiative inside your organization (or a provided case organization).", "The practicum covers governance setup, vendor evaluation, pilot execution, KPI review, change management and a board-ready readout."],
    level: "intermediate", weeks: 24,
    outcomes: ["Set organizational AI strategy and governance.", "Evaluate vendors and platforms for generative and agentic AI.", "Run a pilot and review it against business KPIs.", "Lead change and adoption across teams.", "Deliver an implementation report and executive presentation."],
    audience: ["Executives", "Functional heads", "Transformation leaders"], prerequisites: "Leadership responsibility for a team or function. No coding required.", codingRequirement: "No coding required.",
    pathway: { includes: ["#13.1", "#13.2"], note: "Course 3, the Leadership Practicum, is new in this program." },
    curriculum: [
      w("1", "Practicum: Choosing the Initiative", "Pick an initiative in your organization or the case organization.", ["strategy"], { course: "PRAC" }),
      w("2", "Practicum: Governance Setup", "Roles, policies and oversight for the initiative.", ["responsible"], { course: "PRAC" }),
      w("3", "Practicum: Vendor Evaluation", "Criteria, due diligence and build/buy/partner.", ["strategy"], { course: "PRAC" }),
      w("4", "Practicum: Pilot Execution I", "Launch the pilot with clear owners.", ["strategy"], { course: "PRAC" }),
      w("5", "Practicum: Pilot Execution II", "Run, observe and adjust.", ["observe"], { course: "PRAC" }),
      w("6", "Practicum: KPI Review", "Measure against business outcomes.", ["evals"], { course: "PRAC" }),
      w("7", "Practicum: Change Management", "Adoption, training and communication.", ["strategy"], { course: "PRAC" }),
      w("8", "Practicum: Board-Ready Readout", "Implementation report and executive presentation.", ["strategy"], { course: "PRAC", kind: "capstone" }),
    ],
    projects: [{ key: "capstone", kind: "capstone", week: "8", name: "Implementation Report and Executive Presentation", description: "A board-ready report and presentation on the initiative you led.", skills: ["governance", "change leadership", "executive communication"], requirements: ["Governance in place", "Vendor evaluation", "Pilot results against KPIs", "Change plan", "Executive presentation"] }],
    tools: [{ family: "Leadership", items: ["Documents and slides", "A whiteboard tool", "A chat-based LLM assistant"] }],
  },
  { price: 6400, start: 28, hours: null, schedule: "Weekly live sessions over 24 weeks", cert: "Extended Professional Certificate in Applied AI for Business Leaders", badge: "Applied AI for Business Leaders credential (Open Badges 3.0)" },
);

/* =====================================================================
 * Self-paced line #28–#38
 * ===================================================================== */

const STD_MODULE = (title: string, focus: string, lib: string[] = []) => mod(title, focus, lib);

const P28 = selfPaced(
  { code: "#28", slug: "rag-agentic-ai-engineer", title: "RAG & Agentic AI Engineer", catalogTrack: "Builder", codingRequired: true, valueStatement: "Eight courses that take you from LLM app basics to production retrieval and agent systems.", overview: ["A job-role professional certificate for engineers who build retrieval and agent applications.", "Completion waives the retrieval and agent modules of Program 2 once Program 2 is in the catalog."], level: "intermediate", outcomes: ["Build LLM applications with structured output and simple UIs.", "Engineer embeddings, vector stores and retrieval pipelines with evaluation.", "Implement advanced and agentic retrieval.", "Build tool-using and multi-agent systems with MCP.", "Ship a production-shaped RAG and agent application."], audience: ["Developers", "ML engineers"], prerequisites: "Python and basic web APIs.", codingRequirement: "Coding required — Python.", projects: [{ key: "capstone", kind: "capstone", week: "8.1", name: "Production-Shaped RAG and Agent App", description: "Evaluation, guardrails and deployment included.", skills: ["RAG", "agents", "deployment"] }], tools: [{ family: "Core", items: ["Python", "An LLM API", "A vector database", "A chain/orchestration framework", "MCP SDK", "Docker"] }] },
  { type: "professional_certificate", suggestedPace: "~3 months at 6 hrs/week", audit: true, inPlus: true, standardBlocks: 1, courses: [
    { code: "#28.1", title: "LLM Application Foundations", hours: 10, modules: [STD_MODULE("APIs and Models", "Calling models and managing context", ["llm"]), STD_MODULE("Prompting and Structured Output", "Prompts code can rely on", ["llm"])], finalProject: "A structured-output assistant" },
    { code: "#28.2", title: "Building LLM Apps With an Orchestration Framework", hours: 10, modules: [STD_MODULE("Chains and Templates", "Composable steps", ["rag"]), STD_MODULE("A Simple UI", "Delivering the app", ["appdel"])], finalProject: "An LLM app with a UI" },
    { code: "#28.3", title: "Embeddings and Vector Databases", hours: 10, modules: [STD_MODULE("Embeddings", "Meaning as vectors", ["vectors"]), STD_MODULE("Vector Stores", "Indexing and search", ["vectors"])], finalProject: "A semantic search service" },
    { code: "#28.4", title: "RAG Pipelines", hours: 12, modules: [STD_MODULE("Chunking and Retrieval", "Getting the right passages", ["rag"]), STD_MODULE("Reranking and Evaluation", "Measuring retrieval quality", ["evals"])], finalProject: "An evaluated RAG pipeline" },
    { code: "#28.5", title: "Advanced and Agentic RAG", hours: 12, modules: [STD_MODULE("Routing and Self-Correction", "Retrieval that adapts", ["agenticrag"]), STD_MODULE("GraphRAG Intro", "Knowledge graphs for retrieval", ["agenticrag"])], finalProject: "An agentic retrieval router" },
    { code: "#28.6", title: "Tool-Using Agents", hours: 10, modules: [STD_MODULE("Agent Loops", "Reasoning and acting", ["agents"]), STD_MODULE("Typed Tools", "Reliable tool calls", ["agents"])], finalProject: "A tool-using agent" },
    { code: "#28.7", title: "Multi-Agent Systems and MCP", hours: 12, modules: [STD_MODULE("Orchestration", "Supervisors and crews", ["multiagent"]), STD_MODULE("MCP Integration", "Servers, clients and scopes", ["mcp"])], finalProject: "A multi-agent system with MCP tools" },
    { code: "#28.8", title: "Capstone: Production-Shaped RAG + Agent App", hours: 16, modules: [STD_MODULE("Guardrails and Evaluation", "Safety and quality gates", ["guardrails", "evals"]), STD_MODULE("Deploy", "Containers and CI/CD", ["deploy"])], finalProject: "Production-shaped RAG and agent application", peerReviewed: true },
  ] },
  { price: 399, hoursPerWeek: [5, 7], weeks: 13 },
);

const P29 = selfPaced(
  { code: "#29", slug: "ai-agent-developer", title: "AI Agent Developer: Foundations to Applications", catalogTrack: "Builder", codingRequired: true, valueStatement: "Four provider-neutral courses to design, build, integrate and operate enterprise agents.", overview: ["A provider-neutral professional certificate: the core is framework- and vendor-independent, with one cloud agent service lab (chosen and verified, alternatives noted)."], level: "intermediate", outcomes: ["Design agents with autonomy, tools, memory and planning.", "Build agents with an agent SDK in a provider-neutral way.", "Integrate agents with enterprise APIs, identity and permissions.", "Deploy, monitor and evaluate agents in production.", "Govern an enterprise agent with clear oversight."], audience: ["Developers", "Solutions engineers"], prerequisites: "Python and APIs.", codingRequirement: "Coding required — Python.", projects: [{ key: "capstone", kind: "capstone", week: "4.1", name: "Enterprise Agent in Operation", description: "Deploy, monitor, evaluate and govern an agent in a Scholaris/Haven sandbox scenario.", skills: ["deployment", "governance", "monitoring"] }], tools: [{ family: "Core", items: ["Python", "An agent SDK", "One cloud agent service (verified; alternatives noted)"] }] },
  { type: "professional_certificate", suggestedPace: "~2 months at 7 hrs/week", audit: true, inPlus: true, standardBlocks: 1, courses: [
    { code: "#29.1", title: "Agent Fundamentals and Design", hours: 15, modules: [STD_MODULE("Autonomy and Tools", "What agents can do", ["agents"]), STD_MODULE("Memory and Planning", "Remembering and deciding", ["agents"])], finalProject: "An agent design document" },
    { code: "#29.2", title: "Building Agents With an Agent SDK", hours: 15, modules: [STD_MODULE("Provider-Neutral Core", "SDK concepts that transfer", ["agents"]), STD_MODULE("One Cloud Agent Service Lab", "A verified managed service", ["deploy"])], finalProject: "An SDK-built agent" },
    { code: "#29.3", title: "Multi-Agent Orchestration and Enterprise Integration", hours: 15, modules: [STD_MODULE("Orchestration", "Coordinating agents", ["multiagent"]), STD_MODULE("Identity, Permissions and Connectors", "Enterprise integration", ["mcp"])], finalProject: "An integrated multi-agent workflow" },
    { code: "#29.4", title: "Deploying and Operating Agents", hours: 15, modules: [STD_MODULE("Deploy and Monitor", "Operations", ["deploy", "observe"]), STD_MODULE("Evaluate and Govern", "Quality and oversight", ["evals", "responsible"])], finalProject: "Enterprise agent capstone", peerReviewed: true },
  ] },
  { price: 299, hoursPerWeek: [6, 8], weeks: 9 },
);

const P30_COURSES: SPCourse[] = [
  { code: "#30.1", title: "Agents in Python From First Principles", hours: 12, modules: [STD_MODULE("The Agent Loop", "A loop without a framework", ["agents"]), STD_MODULE("Tool Calling and Memory", "Tools and state by hand", ["agents"])], finalProject: "A framework-free agent" },
  { code: "#30.2", title: "Agent Architecture Patterns", hours: 12, modules: [STD_MODULE("Planner/Executor and Routers", "Splitting the work", ["agents"]), STD_MODULE("Reflection, Multi-Agent and Safety Boundaries", "Checks and limits", ["multiagent", "guardrails"])], finalProject: "A patterns comparison" },
  { code: "#30.3", title: "Agentic Workflows With a Framework", hours: 14, modules: [STD_MODULE("Framework Workflows", "Moving from scratch to a framework", ["graphs"]), STD_MODULE("Capstone Build", "Automate a multi-step knowledge-work task", ["evals"])], finalProject: "A Python agent automating a multi-step knowledge-work task", peerReviewed: true },
];

const P30 = selfPaced(
  { code: "#30", slug: "ai-agents-in-python", title: "AI Agents & Agentic Systems in Python", catalogTrack: "Builder", codingRequired: true, valueStatement: "Three courses to build agents in Python from first principles to framework workflows.", overview: ["Start with no framework at all — the loop, tools and memory by hand — then learn the architecture patterns and move to a framework. It's the core of #31."], level: "intermediate", outcomes: ["Implement an agent loop, tool calling and memory in plain Python.", "Apply planner/executor, router, reflection and multi-agent patterns.", "Set safety boundaries for agents.", "Build framework-based agentic workflows.", "Automate a multi-step knowledge-work task with an agent."], audience: ["Python developers"], prerequisites: "Intermediate Python.", codingRequirement: "Coding required — Python.", projects: [{ key: "capstone", kind: "capstone", week: "3.2", name: "Knowledge-Work Automation Agent", description: "A Python agent that automates a multi-step knowledge-work task.", skills: ["agents", "workflows"] }], tools: [{ family: "Core", items: ["Python", "An LLM API", "One agent framework"] }] },
  { type: "specialization", suggestedPace: "~6 weeks at 6 hrs/week", audit: true, inPlus: true, standardBlocks: 1, courses: P30_COURSES },
  { price: 199, hoursPerWeek: [5, 7], weeks: 6 },
);

const P31 = selfPaced(
  { code: "#31", slug: "ai-agent-developer-extended", title: "AI Agent Developer — Extended", catalogTrack: "Builder", codingRequired: true, valueStatement: "Six courses: the #30 core plus prompting, data-analysis agents and trustworthy generative AI.", overview: ["Contains #30's three courses plus three more: prompt engineering for agents, AI-assisted data analysis with a code-execution tool, and trustworthy generative AI."], level: "intermediate", outcomes: ["Build agents in Python from first principles.", "Engineer prompts for agents and assistants.", "Build a data-analysis agent that executes and validates code.", "Assess reliability, bias, privacy and disclosure in generative AI.", "Deliver a trustworthy agent with an evaluation report."], audience: ["Python developers", "Data analysts who code"], prerequisites: "Intermediate Python.", codingRequirement: "Coding required — Python.", projects: [{ key: "capstone", kind: "capstone", week: "6.2", name: "Trustworthy Agent With Evaluation Report", description: "An agent with verification steps and an evaluation report.", skills: ["evaluation", "trustworthy AI"] }], tools: [{ family: "Core", items: ["Python", "An LLM API", "A sandboxed code-execution tool"] }] },
  { type: "specialization", suggestedPace: "~3 months at 6 hrs/week", audit: true, inPlus: true, standardBlocks: 1, courses: [
    ...P30_COURSES,
    { code: "#31.4", title: "Prompt Engineering for Agents and Assistants", hours: 10, modules: [STD_MODULE("System Prompts and Roles", "Instructions that hold", ["llm"]), STD_MODULE("Testing Prompts", "Prompt test sets", ["evals"])], finalProject: "An evaluated prompt set for an assistant" },
    { code: "#31.5", title: "AI-Assisted Data Analysis", hours: 12, modules: [STD_MODULE("Agents That Run Code", "A code-execution tool in a sandbox", ["agents"]), STD_MODULE("Validating Results", "Checking an agent's analysis", ["evals"])], finalProject: "A validated data-analysis agent" },
    { code: "#31.6", title: "Trustworthy Generative AI", hours: 10, modules: [STD_MODULE("Reliability and Verification", "Checking outputs", ["evals"]), STD_MODULE("Bias, Privacy and Disclosure", "Responsible deployment", ["responsible"])], finalProject: "Trustworthy agent capstone", peerReviewed: true },
  ] },
  { price: 349, hoursPerWeek: [5, 7], weeks: 13 },
);

const P32 = selfPaced(
  {
    code: "#32", slug: "agentic-design-patterns", title: "Agentic Design Patterns", catalogTrack: "Builder", codingRequired: true, valueStatement: "Five modules on the patterns behind every agent — each with a framework-free Python lab.",
    overview: ["A prerequisite-free entry point. You learn what makes AI agentic and the four core patterns — reflection, tool use, planning and multi-agent collaboration — and finish with error analysis and evaluation-driven development.", "Every module has a short framework-free Python lab, autograded in the Scholaris Cloud Lab."],
    level: "beginner", outcomes: ["Explain levels of autonomy and when an agent is warranted.", "Implement reflection and self-critique loops.", "Validate and execute tool calls safely.", "Order plan steps with dependencies.", "Use error analysis to drive agent improvements."],
    audience: ["Developers new to agents", "Technical product people who code a little"], prerequisites: "Basic Python (functions, lists and dictionaries).", codingRequirement: "Light coding — short Python labs.",
    projects: [{ key: "final", kind: "project", week: "1.5", name: "Error-Analysis Report", description: "Run the provided agent evaluation results through your error analysis and recommend the next fix.", skills: ["error analysis", "evaluation"] }],
    tools: [{ family: "Core", items: ["Python 3.12 (Scholaris Cloud Lab)"] }],
  },
  { type: "short_course", suggestedPace: "~2 weeks at 5 hrs/week", audit: true, inPlus: true, standardBlocks: 0, courses: [
    { code: "#32", title: "Agentic Design Patterns", hours: 10, finalProject: "Error-analysis report", peerReviewed: false, modules: [
      { title: "What Makes AI Agentic", focus: "Autonomy levels, the agent loop and when not to build an agent.", lib: ["agents"], videos: ["From answers to actions", "Levels of autonomy", "The loop, step by step", "When a pipeline is better"], lab: LABS.agent_loop, quiz: [q("What turns a model call into an agent?", ["A loop that chooses the next action from results", "A bigger model", "A longer prompt", "Using JSON"], "A loop that chooses the next action from results", "Agents decide and act repeatedly using tool results."), tf("A step limit is unnecessary if the policy is well written.", "False", "Step limits stop runaway loops and cost regardless of policy quality."), q("When is a fixed pipeline usually better than an agent?", ["When the steps are known and stable", "When the task is open-ended", "When tools fail often", "Never"], "When the steps are known and stable")] },
      { title: "Reflection and Self-Critique", focus: "Draft, critique, revise — and knowing when to stop.", lib: ["agents"], videos: ["Why first drafts fail", "Critique as a function", "Stopping rules"], lab: LABS.reflection, quiz: [q("What should a critique step return when the draft is acceptable?", ["A signal to stop", "A longer draft", "A random note", "An error"], "A signal to stop"), tf("Reflection loops need a maximum number of rounds.", "True"), q("Reflection works best when the critique uses…", ["explicit criteria", "the same wording as the draft", "no criteria", "random sampling"], "explicit criteria")] },
      { title: "Tool Use", focus: "Typed tool calls, validation and turning failures into useful errors.", lib: ["agents"], videos: ["Tools as contracts", "Validating arguments", "Errors the model can use"], lab: LABS.tool_use, quiz: [q("Validating tool arguments before calling mainly prevents…", ["unsafe or failing calls", "faster models", "longer outputs", "caching"], "unsafe or failing calls"), tf("An unexpected argument should be silently ignored.", "False", "Reject it so the agent can correct its call."), q("A good tool error message is…", ["specific enough for the agent to fix the call", "a stack trace", "empty", "the API key"], "specific enough for the agent to fix the call")] },
      { title: "Planning", focus: "Breaking goals into ordered, dependency-aware steps.", lib: ["agents"], videos: ["Plans as graphs", "Dependencies and order", "Detecting impossible plans"], lab: LABS.planning, quiz: [q("A plan with a cycle in its dependencies…", ["can't be executed as written", "runs faster", "is always fine", "needs more tokens"], "can't be executed as written"), tf("A topological order puts each step after the steps it depends on.", "True"), q("Re-planning is needed when…", ["a step fails or new information arrives", "the plan succeeds", "never", "the model is small"], "a step fails or new information arrives")] },
      { title: "Multi-Agent Collaboration and Evaluation-Driven Development", focus: "Splitting work across agents and using error analysis to decide what to fix next.", lib: ["multiagent", "evals"], videos: ["Roles and handoffs", "When more agents help", "Error analysis", "Evaluation-driven development"], lab: LABS.error_analysis, quiz: [q("Error analysis groups failures so you can…", ["fix the most damaging category first", "hide failures", "skip testing", "add more agents"], "fix the most damaging category first"), tf("Adding more agents always improves quality.", "False"), q("Evaluation-driven development means…", ["changes are judged against a fixed test set", "testing only at launch", "trusting demos", "never changing prompts"], "changes are judged against a fixed test set")] },
    ] },
  ] },
  { price: 49, hoursPerWeek: [4, 6], weeks: 2 },
);

const P33 = selfPaced(
  { code: "#33", slug: "agentic-engineering-graph-mcp", title: "Agentic AI Engineering with Graph Orchestration & MCP", catalogTrack: "Builder", codingRequired: true, valueStatement: "Three courses on validated pipelines, stateful graph agents and MCP-powered systems.", overview: ["Completion waives #15 Weekends 3–6."], level: "advanced", outcomes: ["Build agentic pipelines with chains, tools and validated structured data.", "Engineer stateful graph agents with routing, persistence and human-in-the-loop.", "Debug and recover graph agents.", "Build and secure MCP servers and clients.", "Integrate a graph agent with multiple MCP servers."], audience: ["Developers with agent basics"], prerequisites: "#30, #32 or equivalent experience.", codingRequirement: "Coding required — Python.", projects: [{ key: "capstone", kind: "capstone", week: "3.2", name: "Graph Agent With Two Custom MCP Servers", description: "A stateful graph agent consuming two MCP servers you build.", skills: ["graphs", "MCP", "security"] }], tools: [{ family: "Core", items: ["Python", "A graph framework", "MCP SDK and inspector", "Pydantic"] }] },
  { type: "specialization", suggestedPace: "~6 weeks at 7 hrs/week", audit: true, inPlus: true, standardBlocks: 1, courses: [
    { code: "#33.1", title: "Agentic Pipelines With Validated Data", hours: 12, modules: [STD_MODULE("Chains and Tools", "Composable pipelines", ["rag", "agents"]), STD_MODULE("Validated Structured Data", "Schemas at every step", ["agents"])], finalProject: "A validated agentic pipeline" },
    { code: "#33.2", title: "Stateful Graph Agents", hours: 14, modules: [STD_MODULE("Routing and Persistence", "State and checkpoints", ["graphs"]), STD_MODULE("Human-in-the-Loop, Debugging and Recovery", "Approvals and crash recovery", ["graphs"])], finalProject: "A recoverable graph agent" },
    { code: "#33.3", title: "MCP-Powered Agentic Systems", hours: 14, modules: [STD_MODULE("Servers and Clients", "Building MCP servers", ["mcp"]), STD_MODULE("Interoperability, Security and Scale", "Scopes and deployment", ["mcp", "guardrails"])], finalProject: "Graph agent with two custom MCP servers", peerReviewed: true },
  ] },
  { price: 249, hoursPerWeek: [6, 8], weeks: 6 },
);

const P34 = selfPaced(
  { code: "#34", slug: "agentic-ai-for-leaders", title: "Agentic AI for Leaders: A Strategic Primer", catalogTrack: "Business & Leadership", codingRequired: false, track: "No-code", valueStatement: "A no-code primer on what agents can do, where they fit and how to lead their adoption.", overview: ["Five short modules for leaders. Credits toward Programs 13 and 20 (and Program 9 once it is in the catalog)."], level: "beginner", outcomes: ["Explain what agents can and can't do.", "Identify agent use cases and redesign processes around them.", "Set risk, governance and human-oversight requirements.", "Make build/buy/partner and cost decisions.", "Lead adoption across teams."], audience: ["Executives", "Managers"], prerequisites: "None.", codingRequirement: "No coding required.", projects: [{ key: "final", kind: "project", week: "1.5", name: "Agent Opportunity Brief With Governance Plan", description: "A one-page opportunity brief with a governance plan.", skills: ["opportunity framing", "governance"] }], tools: [{ family: "Core", items: ["A chat-based LLM assistant"] }] },
  { type: "short_course", suggestedPace: "~2 weeks at 3 hrs/week", audit: true, inPlus: true, standardBlocks: 0, courses: [
    { code: "#34", title: "Agentic AI for Leaders", hours: 8, finalProject: "Agent opportunity brief with a governance plan", peerReviewed: true, modules: [STD_MODULE("What Agents Can and Can't Do", "Capabilities and limits", ["agents"]), STD_MODULE("Use Cases and Process Redesign", "Finding the right work", ["strategy"]), STD_MODULE("Risk, Governance and Oversight", "Keeping people in charge", ["responsible"]), STD_MODULE("Build, Buy or Partner", "Decisions and cost", ["strategy"]), STD_MODULE("Leading Adoption", "Change and capability", ["strategy"])] },
  ] },
  { price: 79, hoursPerWeek: [3, 4], weeks: 2 },
);

const P35 = selfPaced(
  { code: "#35", slug: "stateful-agents-graph-workflows", title: "Building Stateful Agents with Graph Workflows", catalogTrack: "Builder", codingRequired: true, valueStatement: "A two-hour guided build: a routing graph with tool nodes, checkpoints and a human approval step.", overview: ["A quick-start project. The lab is reused in Programs 1 and 15."], level: "intermediate", outcomes: ["Represent an agent as a routing graph.", "Run tool nodes and record checkpoints.", "Insert a human approval gate.", "Handle rejection paths.", "Explain when graphs beat free-form loops."], audience: ["Developers"], prerequisites: "Basic Python.", codingRequirement: "Coding required — short Python build.", projects: [{ key: "final", kind: "project", week: "1.1", name: "Routing Graph With Approval", description: "Autograded in the Cloud Lab.", skills: ["graphs", "human-in-the-loop"] }], tools: [{ family: "Core", items: ["Python 3.12 (Scholaris Cloud Lab)"] }] },
  { type: "guided_project", suggestedPace: "About 2 hours", audit: false, inPlus: true, standardBlocks: 0, courses: [
    { code: "#35", title: "Building Stateful Agents with Graph Workflows", hours: 2, finalProject: "Autograded routing graph", modules: [{ title: "Guided Build", focus: "Route, checkpoint and gate a refund-request workflow.", lib: ["graphs"], videos: ["The graph you'll build", "Checkpoints", "The approval gate"], lab: LABS.graph_workflow, quiz: [q("Why save a checkpoint after each node?", ["To resume or inspect after a failure", "To speed up the model", "To skip approval", "To shorten prompts"], "To resume or inspect after a failure"), tf("A rejected approval should stop the workflow before the reply is sent.", "True"), q("A router decides…", ["which node runs next from the current state", "the model temperature", "the API key", "the UI color"], "which node runs next from the current state")] }] },
  ] },
  { price: 19, hoursPerWeek: [2, 2], weeks: 1 },
);

const P36 = selfPaced(
  { code: "#36", slug: "multi-agent-teams-crews", title: "Multi-Agent Teams with Role-Based Crews", catalogTrack: "Builder", codingRequired: true, valueStatement: "A two-hour guided build: a researcher–analyst–writer crew in sequential and hierarchical modes, scored with a rubric.", overview: ["A quick-start project. The lab is reused in Programs 1, 14 and 15."], level: "intermediate", outcomes: ["Compose role-based agents.", "Run sequential and hierarchical crews.", "Validate a manager's plan.", "Score outputs with a rubric.", "Compare crew modes with evidence."], audience: ["Developers"], prerequisites: "Basic Python.", codingRequirement: "Coding required — short Python build.", projects: [{ key: "final", kind: "project", week: "1.1", name: "Crew Comparison", description: "Autograded in the Cloud Lab.", skills: ["crews", "rubric scoring"] }], tools: [{ family: "Core", items: ["Python 3.12 (Scholaris Cloud Lab)"] }] },
  { type: "guided_project", suggestedPace: "About 2 hours", audit: false, inPlus: true, standardBlocks: 0, courses: [
    { code: "#36", title: "Multi-Agent Teams with Role-Based Crews", hours: 2, finalProject: "Autograded crew comparison", modules: [{ title: "Guided Build", focus: "Build the crew, run both modes and compare with a rubric.", lib: ["multiagent"], videos: ["Roles", "Sequential versus hierarchical", "Rubric scoring"], lab: LABS.role_crew, quiz: [q("In a hierarchical crew, who chooses the order of work?", ["A manager", "The last agent", "Random", "The user only"], "A manager"), tf("A rubric makes crew outputs comparable.", "True"), q("A manager naming an unknown agent should…", ["raise an error", "be ignored", "crash silently", "create the agent"], "raise an error")] }] },
  ] },
  { price: 19, hoursPerWeek: [2, 2], weeks: 1 },
);

const P37 = selfPaced(
  { code: "#37", slug: "ai-ml-foundations-tf-pytorch", title: "AI & Machine Learning Foundations with TensorFlow and PyTorch", catalogTrack: "Builder", codingRequired: true, valueStatement: "Four courses from Python and data to evaluated models and your first neural networks — in both frameworks.", overview: ["The self-paced counterpart of #18 Weeks 1–5. Course 2 builds on the Academy's existing Applied ML course content."], level: "beginner", outcomes: ["Prepare data in Python for machine learning.", "Build data training pipelines with feature engineering and cross-validation.", "Evaluate models with appropriate metrics, error analysis and fairness checks.", "Train first neural networks in PyTorch and TensorFlow/Keras.", "Document a model with an evaluation report and model card."], audience: ["Beginners with basic Python", "Analysts"], prerequisites: "Basic Python (refresher included, aligned with Gaddis, Starting Out with Python, 6th ed.).", codingRequirement: "Coding required — Python.", projects: [{ key: "capstone", kind: "capstone", week: "4.2", name: "End-to-End Model With Evaluation Report and Model Card", description: "Train, evaluate and document a model.", skills: ["ML workflow", "evaluation", "model cards"] }], tools: [{ family: "Core", items: ["Python", "NumPy", "pandas", "scikit-learn", "PyTorch", "TensorFlow/Keras"] }], textbooks: [GADDIS, ...ML_BOOKS] },
  { type: "specialization", suggestedPace: "~2 months at 5 hrs/week", audit: true, inPlus: true, standardBlocks: 1, courses: [
    { code: "#37.1", title: "Python and Data for ML", hours: 10, modules: [STD_MODULE("Python Refresher", "Gaddis-aligned essentials", ["pyfound"]), STD_MODULE("NumPy, pandas and Plots", "Data for models", ["wrangle"])], finalProject: "A cleaned, explored dataset" },
    { code: "#37.2", title: "Supervised and Unsupervised Learning", hours: 12, courseId: "crs_academy_p37_2", modules: [STD_MODULE("Training Pipelines", "Feature engineering and cross-validation", ["mlfound"]), STD_MODULE("Unsupervised Learning", "Clustering and dimensionality reduction", ["mlfound"])], finalProject: "A model report" },
    { code: "#37.3", title: "Model Evaluation", hours: 10, modules: [STD_MODULE("Metrics and Curves", "Confusion matrices, ROC/PR and calibration", ["mlfound"]), STD_MODULE("Error Analysis and Fairness", "Where and for whom models fail", ["responsible"])], finalProject: "An evaluation report" },
    { code: "#37.4", title: "First Neural Networks in PyTorch and TensorFlow", hours: 12, modules: [STD_MODULE("Parallel Framework Labs", "The same network in both frameworks", ["dl"]), STD_MODULE("Capstone", "End-to-end model with a model card", ["evals"])], finalProject: "Model card capstone", peerReviewed: true },
  ] },
  { price: 199, hoursPerWeek: [4, 6], weeks: 9 },
);

const P38 = selfPaced(
  { code: "#38", slug: "neural-networks-dl-nlp-agents", title: "Neural Networks, Deep Learning & NLP for Agent Builders", catalogTrack: "Builder", codingRequired: true, valueStatement: "Four courses from backpropagation to fine-tuned language models powering agents.", overview: ["The self-paced counterpart of #18 Weeks 5–8 and the prerequisite path into #28–#33."], level: "intermediate", outcomes: ["Train deep networks with appropriate optimizers and regularization.", "Apply CNNs and transfer learning.", "Build NLP pipelines with embeddings, attention and transformers.", "Fine-tune a small language model.", "Plug a fine-tuned model into a retrieval agent as a tool."], audience: ["Developers with ML basics"], prerequisites: "#37 or equivalent.", codingRequirement: "Coding required — Python.", projects: [{ key: "capstone", kind: "capstone", week: "4.2", name: "Fine-Tuned NLP Model as an Agent Tool", description: "A fine-tuned model used as a tool by a retrieval agent.", skills: ["fine-tuning", "NLP", "agents"] }], tools: [{ family: "Core", items: ["PyTorch", "TensorFlow/Keras", "Hugging Face Transformers"] }], textbooks: ML_BOOKS },
  { type: "specialization", suggestedPace: "~2 months at 6 hrs/week", audit: true, inPlus: true, standardBlocks: 1, courses: [
    { code: "#38.1", title: "Deep Learning", hours: 12, modules: [STD_MODULE("Backpropagation and Optimizers", "How networks learn", ["dl"]), STD_MODULE("Regularization and Scale", "Training that generalizes", ["dl"])], finalProject: "A tuned deep network" },
    { code: "#38.2", title: "CNNs and Transfer Learning", hours: 10, modules: [STD_MODULE("Convolutions", "Vision basics", ["dl"]), STD_MODULE("Transfer Learning", "Reusing pretrained models", ["dl"])], finalProject: "A transfer-learning classifier" },
    { code: "#38.3", title: "NLP", hours: 12, modules: [STD_MODULE("Text and Embeddings", "From words to vectors", ["nlp"]), STD_MODULE("Attention and Transformers", "The architecture behind LLMs", ["nlp"])], finalProject: "A text classifier" },
    { code: "#38.4", title: "From Transformers to LLMs and Agents", hours: 12, modules: [STD_MODULE("Fine-Tuning a Small Model", "Parameter-efficient tuning", ["nlp", "observe"]), STD_MODULE("Models as Agent Tools", "Embeddings for retrieval and models as tools", ["agents", "vectors"])], finalProject: "Fine-tuned model as an agent tool", peerReviewed: true },
  ] },
  { price: 199, hoursPerWeek: [5, 7], weeks: 9 },
);

/** Transfer and waiver rules for the self-paced line (recorded in the consolidation table). */
P33.waives = [{ toCode: "#15", weeks: ["3", "4", "5", "6"], note: "Completion of #33 waives #15 Weekends 3–6." }];
P34.waives = [{ toCode: "#20", weeks: ["1"], note: "Completion of #34 waives #20 Week 1." }, { toCode: "#13.1", weeks: ["1"], note: "Completion of #34 waives #13 Course 1 Week 1." }];
P37.waives = [{ toCode: "#18", weeks: ["1", "2", "3", "4", "5"], note: "Completion of #37 waives #18 Weeks 1–5." }];
P38.waives = [{ toCode: "#18", weeks: ["5", "6", "7", "8"], note: "Completion of #38 waives #18 Weeks 5–8." }];

export const PROGRAMS_2: ProgramSpec[] = [P15, P16, P19, P21, P18, P17, P24, P22, P23, P20, P25, P32, P35, P36, P37, P38, P30, P31, P33, P28, P29, P34];

/** #15 weekend module checks (2 items each; the final knowledge check draws 10 from all of them). */
export const P15_CHECKS: Record<number, QuizItem[]> = {
  1: [q("Where should model API keys live?", ["In environment variables or a secret store", "In the repository", "In the front end", "In logs"], "In environment variables or a secret store"), q("Streaming a model response mainly improves…", ["perceived latency", "accuracy", "token cost", "security"], "perceived latency")],
  2: [q("Hybrid search combines…", ["keyword and vector similarity", "two LLMs", "SQL and CSV", "images and audio"], "keyword and vector similarity"), tf("Function calling lets the model request a tool with typed arguments.", "True")],
  3: [q("An output parser's job is to…", ["turn model text into validated structured data", "speed up retrieval", "store memory", "rotate keys"], "turn model text into validated structured data"), q("Plan-and-execute differs from reason-act because it…", ["plans steps up front, then executes them", "never uses tools", "has no loop", "only works offline"], "plans steps up front, then executes them")],
  4: [q("A checkpoint in a graph workflow lets you…", ["resume after a crash or interrupt", "skip validation", "hide state", "avoid tests"], "resume after a crash or interrupt"), tf("Human approval interrupts belong before irreversible actions.", "True")],
  5: [q("Calibrating an LLM-as-judge means…", ["comparing its scores with human labels", "raising its temperature", "removing examples", "letting it grade itself"], "comparing its scores with human labels"), q("In MCP, a server exposes…", ["tools, resources and prompts", "only a database", "a model's weights", "a UI"], "tools, resources and prompts")],
  6: [q("Chaining MCP servers increases the need to…", ["scope permissions for each server", "share one admin token", "disable logging", "skip validation"], "scope permissions for each server"), tf("Long-term memory should be consolidated rather than appended forever.", "True")],
  7: [q("Corrective RAG adds…", ["a check on retrieved passages with a fallback search", "more GPUs", "a longer prompt", "random sampling"], "a check on retrieved passages with a fallback search"), q("A hierarchical crew uses…", ["a manager that delegates", "one agent only", "no tools", "no plan"], "a manager that delegates")],
  8: [q("A canary release…", ["sends a small share of traffic to the new version first", "deletes the old version", "skips tests", "runs only locally"], "sends a small share of traffic to the new version first"), q("Fine-tuning is worth trying when…", ["prompting and retrieval can't reach the quality bar", "you want to avoid evaluation", "you have no data", "always first"], "prompting and retrieval can't reach the quality bar")],
  9: [q("Prompt injection defenses treat retrieved content as…", ["data, not instructions", "trusted commands", "system prompts", "secrets"], "data, not instructions"), q("In n8n, an error branch is used to…", ["handle failures and retries explicitly", "speed up nodes", "hide errors", "store passwords"], "handle failures and retries explicitly")],
  10: [tf("The capstone live demo includes the monitoring dashboard.", "True"), q("An architecture decision record documents…", ["a choice, its options and consequences", "test results only", "the budget", "a user story"], "a choice, its options and consequences")],
};

P17.blocks = [{ key: "GENAI", title: "GenAI Applications (new course)", weeks: "1–8" }];
P24.blocks = [{ key: "CAP", title: "Industry Capstone (12 weeks, mentor-supervised)", weeks: "1–12" }];
P25.blocks = [{ key: "PRAC", title: "Course 3: AI Leadership Practicum", weeks: "1–8" }];
for (const p of [P17, P24, P25]) for (const wk of p.curriculum) wk.block = wk.course;
