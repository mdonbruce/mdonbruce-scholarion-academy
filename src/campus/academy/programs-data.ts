/**
 * Scholaris AI Academy program designs: #1 (upgraded), #12, #13, #14 and #26.
 *
 * All titles, outcomes, project names and copy here are original Scholaris writing.
 * Market reference programs were used only for gap analysis and are not named or quoted.
 * Fees are sandbox placeholders that admins set before go-live; nothing here is a claim
 * about accreditation, credit, pay or placement. Datasets are synthetic.
 */

export interface WeekSpec {
  /** "0" for an optional refresher week; ranges like "5–6" are allowed. */
  week: string;
  title: string;
  focus: string;
  block?: string;
  optional?: boolean;
  kind?: "midterm" | "capstone" | "exam";
  /** Program #26: the two guided labs for the week. */
  labs?: [string, string];
  /** Weekend programs: Saturday and Sunday live sessions. */
  sessions?: [string, string];
  /** Shared module library keys this week is built on. */
  lib?: string[];
  /** Deep-learning week: labs ship in PyTorch and TensorFlow/Keras versions. */
  dual?: boolean;
  /** Pathways: the course this week belongs to (code of an included program, or a new course key). */
  course?: string;
}
export interface LabSpec {
  title: string;
  instructions: string;
  starterCode: string;
  tests: { name: string; code: string; points: number }[];
}
export interface QuizItem {
  kind: "multiple_choice" | "true_false";
  prompt: string;
  choices?: string[];
  answer: string;
  explanation?: string;
}
export interface SPModule {
  title: string;
  focus: string;
  lib?: string[];
  videos?: string[];
  lab?: LabSpec;
  quiz?: QuizItem[];
}
export interface SPCourse {
  code: string;
  title: string;
  hours: number;
  modules: SPModule[];
  finalProject: string;
  peerReviewed?: boolean;
  /** Reuse an existing course shell for this course (legacy content folded into the new catalog). */
  courseId?: string;
}
export interface ProjectSpec {
  key: string;
  name: string;
  description: string;
  skills: string[];
  kind: "project" | "midterm" | "capstone";
  week: string;
  /** Requirements a reviewer checks (become rubric criteria). */
  requirements?: string[];
}
export interface ResearchPaper {
  authors: string;
  year: number;
  title: string;
  venue: string;
  week: number;
}
export interface DataCard {
  key: string;
  name: string;
  purpose: string;
  rows: number;
  fields: string[];
  source: string;
  caveats: string;
}
export interface ProgramSpec {
  code: string;
  slug: string;
  title: string;
  productType: "professional_certificate" | "cohort_program" | "bundle" | "live_intensive" | "short_course" | "pathway" | "specialization" | "guided_project";
  track: string;
  valueStatement: string;
  overview: string[];
  level: "beginner" | "intermediate" | "advanced";
  weeks: number;
  hoursPerWeek: [number, number] | null;
  format: "online" | "live";
  formatText: string;
  outcomes: string[];
  audience: string[];
  prerequisites: string;
  codingRequirement: string;
  blocks: { key: string; title: string; weeks: string }[];
  curriculum: WeekSpec[];
  electives?: string[];
  projects: ProjectSpec[];
  tools: { family: string; items: string[] }[];
  learningExperience: string[];
  faculty: { name: string; role: string; bio: string | null }[];
  credential: { certificate: string; badge: string; description: string };
  careerServices: string[];
  fees: { price: number; earlyBirdPrice: number; installments: number; installmentFee: number; teamMinSeats: number; teamDiscountPct: number; referralCredit: number };
  cohort: { code: string; startInDays: number; applicationDeadlineInDays: number; earlyBirdInDays: number; capacity: number; timeZone: string; schedule: string };
  faqs: { q: string; a: string }[];
  creditStatement: string;
  fundingStatement: string;
  accessMonths: number;
  lateEnrollmentDays: number;
  grading: "graded" | "pass_no_pass";
  passRules?: string[];
  research?: ResearchPaper[];
  selfCheck?: { questions: { id: string; prompt: string; options: string[]; answer: string }[]; passMin: number; routeTo: string[] };
  decisions?: { topic: string; decision: string; status: "recorded" | "needs_owner_approval" }[];
  dataCards: DataCard[];
  /** Sub-courses sold separately (Program #13). */
  parts?: { code: string; title: string; summary: string; weeks: string; price: number }[];
  /** Module keys other programs can waive, by week. */
  waives?: { toCode: string; weeks: string[]; note: string }[];
  /** Catalog hub facets. */
  catalogTrack?: "Builder" | "No-Code" | "Business & Leadership" | "Industry" | "Data" | "Product";
  codingRequired?: boolean;
  formatKind?: "live_weekend" | "live_weekday" | "self_paced" | "cohort";
  /** Self-paced line (#28–#38). */
  selfPaced?: { type: "guided_project" | "short_course" | "specialization" | "professional_certificate"; suggestedPace: string; audit: boolean; inPlus: boolean; standardBlocks: number; courses: SPCourse[] };
  /** Assembled pathways (#17, #24, #25): included program codes, in order. */
  pathway?: { includes: string[]; missing?: string[]; note: string };
  /** Rolling batches (#15). */
  batches?: { code: string; label: string; startInDays: number; timeZone: string; satStart: string; sunStart: string; capacity: number }[];
  completion?: "weekend_intensive";
  gradedPerformance?: boolean;
  validity?: string;
  mutuallyExclusive?: string[];
  prerequisiteFor?: string[];
  feeds?: string[];
  textbooks?: string[];
  /** Adopt an existing course shell for a block (legacy demo content). */
  adoptCourse?: { courseId: string; weeks: Record<string, string> };
  /** Self-check routing bands (#15). */
  selfCheckBands?: { min: number; route: string[]; message: string }[];
}

export const AI_TA = "Scholaris AI Teaching Assistant — coaches with hints and explanations from your course material; it never completes graded work";
export const LEAD = { name: "Dr. Martins Donbruce Idahosa", role: "Lead Faculty & Director of AI Innovation", bio: null };
const TM = "Product and tool names are trademarks of their owners. Scholaris AI Academy is not affiliated with or endorsed by them.";
export const TRADEMARK_NOTICE = TM;

export const COMMON_FAQ = (s: { weeks: number; hours: string; refund: string; tech: string }) => [
  { q: "How much time does it take?", a: `${s.weeks} weeks at ${s.hours}. Live sessions are recorded with chapters and transcripts.` },
  { q: "Are there taxes on the fee?", a: "Any tax is calculated at checkout from your billing location and shown before you confirm. This staging site uses simulated tax and sandbox payments only." },
  { q: "What is the refund and withdrawal policy?", a: s.refund },
  { q: "What are the technical requirements?", a: s.tech },
  { q: "How is the certificate verified?", a: "Each certificate and badge has a verification ID. Anyone can check it on the Scholaris verification page, which shows the issuer, the achievement and whether it is current." },
];
export const REFUND = "Full refund within 14 days of the cohort start if you have completed less than 20% of the work. You can defer once to the next cohort if you ask at least 7 days before the start. Requests go through your account page.";
export const TECH = "A laptop or desktop with a current browser, a stable internet connection, and a webcam and microphone for live sessions. Labs run in the Scholaris Cloud Lab, so you don't need a powerful computer.";

export const PROGRAMS: ProgramSpec[] = [
  /* ------------------------------------------------------------------ #1 */
  {
    code: "#1",
    slug: "agentic-ai-systems",
    title: "Professional Certificate in Agentic AI Systems",
    productType: "professional_certificate",
    track: "Builder (Python required)",
    valueStatement: "Design, build, evaluate and ship tool-using and multi-agent AI systems that people can trust.",
    overview: [
      "This 18-week program takes Python developers from a single tool-calling agent to production multi-agent systems. You work in two blocks: agent foundations, then production engineering — and every week ends with something you have built and measured.",
      "You learn when an agent is the right answer and when it is not, how to ground answers in retrieved evidence, how to coordinate several agents safely, and how to evaluate, observe and deploy them with cost controls and human review.",
      "The program ends with a capstone defense: a multi-agent assistant that prepares a recommendation package for a human decision-maker, with an audit trail and bias testing on synthetic data.",
    ],
    level: "advanced",
    weeks: 18,
    hoursPerWeek: [8, 10],
    format: "online",
    formatText: "Online · weekly mentored sessions · monthly live faculty masterclass",
    outcomes: [
      "Decide when an agentic design is warranted and specify its autonomy level, loop and stopping conditions.",
      "Build agents that call typed, idempotent tools and recover from tool and model errors.",
      "Ground agent answers with retrieval (embeddings, hybrid search, reranking) and measure citation accuracy.",
      "Design multi-agent architectures with clear roles, handoffs, shared state and human approval steps.",
      "Evaluate, trace, secure and deploy agent systems with regression suites, guardrails and cost limits.",
    ],
    audience: ["Software engineers moving into AI engineering", "Data scientists who want to ship agent products", "Technical leads responsible for AI features", "Engineers maintaining LLM integrations"],
    prerequisites: "Working Python (functions, classes, packages, virtual environments) and comfort with Git and APIs. An optional Week 0 refresher covers the tooling.",
    codingRequirement: "Coding required — Python throughout.",
    blocks: [
      { key: "A", title: "Block A — Agent Foundations", weeks: "0–9" },
      { key: "B", title: "Block B — Production Multi-Agent Systems", weeks: "10–18" },
    ],
    curriculum: [
      { week: "0", block: "A", optional: true, title: "Tooling Warm-Up: Python, Notebooks and Git", focus: "VS Code, Colab, Git, virtual environments and calling a web API from Python." },
      { week: "1", block: "A", title: "The Agent Decision: Loops, Autonomy and Restraint", focus: "What makes a system agentic, autonomy levels, the agent loop, and when a plain pipeline is better." },
      { week: "2", block: "A", title: "LLM Mechanics for Builders", focus: "Tokens, context windows, sampling, structured output, and the cost/latency trade-offs that shape design." },
      { week: "3", block: "A", title: "Instructions That Hold: Prompts and Output Contracts", focus: "System prompts, instruction hierarchy, and output schemas that downstream code can trust." },
      { week: "4", block: "A", title: "Tools You Can Rely On", focus: "Function calling, typed tool signatures, error handling, retries and idempotent tools." },
      { week: "5", block: "A", title: "Finding the Right Evidence", focus: "Embeddings, chunking strategies, vector stores, hybrid search and reranking." },
      { week: "6", block: "A", title: "Retrieval That Thinks: Agentic RAG", focus: "Routing, query planning, self-correction and citation grounding." },
      { week: "7", block: "A", title: "Reasoning Patterns in Practice", focus: "Reason-act loops, plan-and-execute, and reflection — with step limits and stopping rules." },
      { week: "8", block: "A", title: "Memory and Context Budgets", focus: "Short- and long-term memory, summarization and keeping context within budget." },
      { week: "9", block: "A", kind: "midterm", title: "Midterm Build Week and Block A Exam", focus: "Midterm project delivery and the Block A exam." },
      { week: "10", block: "B", title: "Small Models, Smart Routing", focus: "When small language models fit, local inference, and routing between small and large models." },
      { week: "11", block: "B", title: "Multi-Agent Architectures", focus: "Orchestrator–worker, hierarchical teams, critic/reviewer agents and handoffs." },
      { week: "12", block: "B", title: "Framework Studio: Graphs and Crews", focus: "Graph-based orchestration and role-based crews, using frameworks verified current at cohort start." },
      { week: "13", block: "B", title: "Tool and Context Protocols", focus: "Building and securing MCP servers and clients; scoping what each agent may call." },
      { week: "14", block: "B", title: "Agentic Coding Workflows", focus: "AI coding agents on real repositories: test-first tasks and human review gates." },
      { week: "15", block: "B", title: "Measuring Agents", focus: "Task success, trajectory evaluation, LLM-as-judge calibrated with human labels, regression suites." },
      { week: "16", block: "B", title: "Observability, Security and Guardrails", focus: "Tracing, prompt-injection defense, permissions, sandboxing and human-in-the-loop controls." },
      { week: "17", block: "B", title: "Shipping and Operating Agents", focus: "APIs, containers, cost controls, monitoring and rollback." },
      { week: "18", block: "B", kind: "capstone", title: "Capstone Defense and Demo Day", focus: "Capstone defense to a faculty panel and a public demo." },
    ],
    projects: [
      { key: "midterm", kind: "midterm", week: "9", name: "Dual-Source Market Insight Agent", description: "Combines structured financial tables and unstructured filings or news (synthetic or public-domain) into a cited insight report.", skills: ["tool use", "retrieval", "structured output", "citation grounding"] },
      { key: "research", kind: "project", week: "13", name: "Autonomous Research Analyst Agent", description: "Plans multi-step research, uses web and document tools, grades sources and writes a brief with citations and confidence levels.", skills: ["planning", "source grading", "multi-step tools", "evaluation"] },
      {
        key: "capstone", kind: "capstone", week: "18", name: "Loan Underwriting Assistant (multi-agent)", description: "Extraction, policy-rules, risk-summary and reviewer agents prepare a recommendation package for a human underwriter — the system never makes the credit decision.", skills: ["multi-agent design", "audit trails", "fairness testing", "human-in-the-loop"],
        requirements: ["Document extraction, policy-rules, risk-summary and reviewer agents with defined handoffs", "Complete audit trail of every agent step and source", "Fair-lending bias testing across protected attributes using synthetic applicants", "Adverse-action reason codes in the package", "Explicit human decision step; the agent never issues a final credit decision", "Evaluation results, limitations and a live defense"],
      },
    ],
    tools: [
      { family: "Development", items: ["Python 3.12", "VS Code", "Google Colab", "Git and GitHub", "Docker"] },
      { family: "Models", items: ["An OpenAI-compatible LLM API", "Claude and Claude Code", "A local small-language-model runtime"] },
      { family: "Agents and retrieval", items: ["A vector database", "A graph-based orchestration framework", "MCP SDK"] },
      { family: "Quality", items: ["An evaluation and tracing tool (selected and version-pinned at cohort start)"] },
    ],
    learningExperience: ["Weekly mentored sessions", "Monthly live faculty masterclass", "Peer groups of 6–8 learners", "Office hours", AI_TA, "Recordings with transcripts", "Program manager and academic learning support", "Discussion forums"],
    faculty: [LEAD],
    credential: { certificate: "Scholaris AI Academy Certificate of Completion — Professional Certificate in Agentic AI Systems", badge: "Agentic Systems Capstone skill badge (Open Badges 3.0)", description: "Issued when both blocks are complete and the capstone defense meets the rubric." },
    careerServices: ["Résumé and portfolio review", "Mock technical interviews", "Portfolio guidance for your projects", "Role mapping to AI engineering paths"],
    fees: { price: 2400, earlyBirdPrice: 2160, installments: 3, installmentFee: 0, teamMinSeats: 3, teamDiscountPct: 10, referralCredit: 100 },
    cohort: { code: "AAS-NOV", startInDays: 30, applicationDeadlineInDays: 23, earlyBirdInDays: 12, capacity: 40, timeZone: "America/New_York", schedule: "Mentored session Tue 19:00 ET · masterclass first Sat 11:00 ET" },
    faqs: [
      { q: "What prior experience do I need?", a: "Working Python and basic Git. If you're rusty, start with the optional Week 0 refresher." },
      { q: "What will I build?", a: "A midterm insight agent, a research analyst agent and a multi-agent capstone that supports — never replaces — a human decision." },
      ...COMMON_FAQ({ weeks: 18, hours: "8–10 hours a week", refund: REFUND, tech: TECH }),
    ],
    creditStatement: "Non-credit professional training. It does not carry academic credit.",
    fundingStatement: "Self-pay, employer sponsorship and team invoicing are accepted. As non-credit training it is not eligible for federal student aid or military education benefits.",
    accessMonths: 24,
    lateEnrollmentDays: 7,
    grading: "graded",
    dataCards: [
      { key: "market_insight", name: "Synthetic quarterly financials and filings", purpose: "Midterm insight agent", rows: 480, fields: ["company_id", "quarter", "revenue", "operating_margin", "filing_excerpt"], source: "Generated by Scholaris; no real companies.", caveats: "Patterns are simplified; not suitable for investment analysis." },
      { key: "applicants", name: "Synthetic loan applicants", purpose: "Capstone underwriting assistant and bias testing", rows: 5000, fields: ["applicant_id", "income", "debt_to_income", "credit_history_months", "protected_attribute_group", "documents"], source: "Generated by Scholaris; no real borrowers.", caveats: "Protected-attribute groups are synthetic labels for fairness testing only." },
    ],
  },

  /* ------------------------------------------------------------------ #12 */
  {
    code: "#12",
    slug: "ai-products-and-services",
    title: "Certificate in Designing & Building AI Products and Services",
    productType: "cohort_program",
    track: "Business & Product (no coding required)",
    valueStatement: "Turn an AI idea into a product proposal you can defend to stakeholders or investors.",
    overview: [
      "A 10-week program for people who shape products rather than write model code. You learn enough about machine learning, deep learning, generative AI and agents to judge what is feasible, what it costs and where it can fail.",
      "Each week moves your own product idea forward — from problem framing to a human–AI interaction design, an opportunity assessment and a business case. Optional notebooks are there if you want to look under the hood.",
      "You finish with a peer-reviewed product brief and a live pitch.",
    ],
    level: "intermediate",
    weeks: 10,
    hoursPerWeek: [5, 7],
    format: "online",
    formatText: "Online with live online sessions",
    outcomes: [
      "Classify machine-learning approaches and neural architectures and match each to a product problem.",
      "Apply an AI product design process from problem framing to validation, including data, cost and technical requirements.",
      "Evaluate generative AI and agent capabilities — retrieval, reasoning prompts, tool use, MCP — for product fit and risk.",
      "Design human–AI interaction and collective-intelligence models with the right level of automation and oversight.",
      "Build and pitch a business case covering cost–benefit, strategic fit, risk and an implementation roadmap.",
    ],
    audience: ["Product managers", "Entrepreneurs and founders", "Innovation leads", "Consultants", "Technical professionals moving into product roles"],
    prerequisites: "No coding or math background required. Experience working on products or services helps.",
    codingRequirement: "No coding required. Optional notebooks are provided for the curious.",
    blocks: [{ key: "A", title: "Course — AI Product Design", weeks: "1–10" }],
    curriculum: [
      { week: "1", title: "From Problem to AI Product", focus: "Problem framing, product stages, cost metrics and technical requirements." },
      { week: "2", title: "Machine Learning Without the Math Anxiety", focus: "Classifiers, train/validate/test, Bayesian and regression models, clustering; optional no-code lab." },
      { week: "3", title: "Deep Learning, Demystified", focus: "Neurons, gradient descent, MLPs, CNNs, RNNs and autoencoders, with cited public healthcare and imaging cases." },
      { week: "4", title: "Inside Generative Models", focus: "Tokens to embeddings to decoders; strengths and failure modes; consent-based voice and avatar use following Haven's digital-human governance model." },
      { week: "5", title: "Generative AI Inside Products", focus: "Prompting, benchmarks, retrieval and reasoning prompts; assignment: design a retrieval-based assistant (no-code build)." },
      { week: "6", title: "The Agent Landscape for Product Teams", focus: "Agents, tool use, MCP and interoperability standards, and agent product patterns." },
      { week: "7", title: "Designing the Human–AI Handshake", focus: "Automation levels, trust, transparency, error recovery and accessibility." },
      { week: "8", title: "People and Machines, Together", focus: "Designing teams and organizations that combine human and machine intelligence." },
      { week: "9", title: "Frontier Risks and Openings", focus: "Synthetic media, deepfake detection, provenance, and social and economic impact." },
      { week: "10", kind: "capstone", title: "Capstone: Proposal and Pitch", focus: "Problem, users, solution, data, model approach, UX, risks, metrics, business model and roadmap." },
    ],
    projects: [
      { key: "rag", kind: "project", week: "5", name: "Retrieval Assistant Blueprint", description: "Design a retrieval-based assistant for a real workflow and prototype it with a no-code tool.", skills: ["retrieval design", "prompting", "evaluation planning"] },
      { key: "storyboard", kind: "project", week: "7", name: "Human–AI Interaction Storyboard", description: "Storyboard how people and the AI share a task, including errors and handoffs.", skills: ["interaction design", "trust and transparency", "accessibility"] },
      { key: "opportunity", kind: "project", week: "8", name: "Opportunity Assessment", description: "Size the opportunity, map stakeholders and score feasibility and risk.", skills: ["opportunity sizing", "risk assessment"] },
      { key: "capstone", kind: "capstone", week: "10", name: "AI Product Proposal and Pitch", description: "A pitch deck and product brief, peer-reviewed and presented live.", skills: ["business case", "roadmapping", "pitching"], requirements: ["Problem and users are specific and evidenced", "Solution, data and model approach are feasible", "UX shows the human–AI interaction and oversight", "Risks, metrics and business model are realistic", "Roadmap with milestones", "Peer review addressed and live pitch delivered"] },
    ],
    tools: [
      { family: "Exploration", items: ["A chat-based LLM assistant", "A no-code retrieval-assistant builder (selected at cohort start)"] },
      { family: "Optional notebooks", items: ["Google Colab", "Python"] },
      { family: "Design and collaboration", items: ["A whiteboard tool", "Slides and documents"] },
    ],
    learningExperience: ["Weekly live online sessions", "Peer review of your proposal", AI_TA, "Recordings with transcripts", "Program support"],
    faculty: [LEAD],
    credential: { certificate: "Scholaris AI Academy Certificate of Completion — Designing & Building AI Products and Services", badge: "AI Product Design badge (Open Badges 3.0)", description: "Issued when the weekly work and the capstone pitch meet the rubric." },
    careerServices: ["Portfolio guidance for your proposal", "Pitch practice", "Role mapping to AI product roles"],
    fees: { price: 1800, earlyBirdPrice: 1620, installments: 3, installmentFee: 0, teamMinSeats: 3, teamDiscountPct: 10, referralCredit: 100 },
    cohort: { code: "APS-NOV", startInDays: 21, applicationDeadlineInDays: 16, earlyBirdInDays: 9, capacity: 60, timeZone: "America/New_York", schedule: "Live session Wed 12:00 ET" },
    faqs: [
      { q: "Do I need to code?", a: "No. Optional notebooks are available if you want to try things hands-on." },
      { q: "What will I build?", a: "A retrieval assistant blueprint, an interaction storyboard, an opportunity assessment and a product proposal you pitch live." },
      ...COMMON_FAQ({ weeks: 10, hours: "about 6 hours a week", refund: REFUND, tech: TECH }),
    ],
    creditStatement: "Non-credit professional training. It does not carry academic credit.",
    fundingStatement: "Self-pay, employer sponsorship and team invoicing are accepted. Not eligible for federal student aid or military education benefits.",
    accessMonths: 24,
    lateEnrollmentDays: 7,
    grading: "graded",
    dataCards: [{ key: "support_kb", name: "Synthetic customer-support knowledge base", purpose: "Retrieval assistant blueprint", rows: 300, fields: ["article_id", "title", "body", "product_area"], source: "Written by Scholaris for teaching.", caveats: "Fictional products and policies." }],
  },

  /* ------------------------------------------------------------------ #13 */
  {
    code: "#13",
    slug: "applied-ai-leadership",
    title: "Applied AI Leadership Bundle: Generative + Agentic AI for Organizational Transformation",
    productType: "bundle",
    track: "Business & Leadership (no coding required)",
    valueStatement: "Lead your organization from generative AI pilots to responsible agent adoption.",
    overview: [
      "Two 8-week courses taken in sequence — each can also be taken on its own. The first builds a leader's working understanding of generative AI and ends with an organizational AI strategy. The second moves to agents: platforms, integration, security, governance and an adoption plan.",
      "No coding, analytics or machine-learning background is needed. Live sessions with facilitators, practitioners and peers sit alongside two faculty sessions in each course.",
    ],
    level: "intermediate",
    weeks: 16,
    hoursPerWeek: null,
    format: "online",
    formatText: "Online · up to 8 live sessions per course plus 2 faculty sessions",
    outcomes: [
      "Explain how generative and agentic AI work, what they cost and where vendor claims deserve scrutiny.",
      "Apply prompting and reusable workflows safely, including what must never go into public tools.",
      "Assess organizational readiness and design an AI-use policy aligned with current risk frameworks.",
      "Evaluate agent platforms, integrations and security risks, and plan a pilot with outcome-based KPIs.",
      "Present an organizational AI strategy and a responsible agent adoption plan to stakeholders.",
    ],
    audience: ["Executives and functional heads", "Managers", "Product, innovation, CX, marketing and sales leaders", "Consultants and advisors"],
    prerequisites: "No coding, analytics or machine-learning background required.",
    codingRequirement: "No coding required.",
    blocks: [
      { key: "C1", title: "Course 1 — Generative AI for Digital Transformation", weeks: "1–8" },
      { key: "C2", title: "Course 2 — Agentic AI for Organizational Transformation", weeks: "9–16" },
    ],
    curriculum: [
      { week: "1", block: "C1", title: "Why This Wave Is Different", focus: "AI's evolution and business impact, the leadership lens, and your personal learning goals." },
      { week: "2", block: "C1", title: "Generative AI in Plain Language", focus: "Context, hallucinations, tokens and cost, multimodal models, and red flags in vendor claims." },
      { week: "3", block: "C1", title: "Prompting for Leaders", focus: "Core techniques, executive and team workflows, reusable templates, what never to paste into public tools, and a personal prompt library." },
      { week: "4", block: "C1", title: "AI Across the Business", focus: "Marketing/CX, operations, HR, finance, product and strategy, through cited public case studies." },
      { week: "5", block: "C1", title: "Responsible AI in Practice", focus: "Bias, privacy, explainability, regulation (EU AI Act, US frameworks, sector rules), NIST AI RMF, content integrity, and drafting an internal AI-use policy." },
      { week: "6", block: "C1", title: "Building an AI-Ready Organization", focus: "Readiness dimensions, failure patterns, upskilling, psychological safety, CAIO/CoE roles and change models." },
      { week: "7", block: "C1", title: "AI, Work and the Economy", focus: "Task exposure, augmentation versus replacement, competitive dynamics and evolving leadership capabilities." },
      { week: "8", block: "C1", kind: "capstone", title: "Capstone: Your Organizational AI Strategy", focus: "Opportunity map, effort–impact–risk prioritization, roadmap with owners and timelines, business case and stakeholder presentation." },
      { week: "9", block: "C2", title: "From Generating to Acting", focus: "Generative versus agentic AI, model types, where agents add value, and estimating AI system cost." },
      { week: "10", block: "C2", title: "Choosing Agent Platforms", focus: "Open-source versus proprietary selection; hands-on: build a landing page and prototype with AI tools." },
      { week: "11", block: "C2", title: "Wiring Agents Into the Enterprise", focus: "APIs, integrations, workflow analysis and an agent use-case proposal." },
      { week: "12", block: "C2", title: "Agent Security and Risk", focus: "NIST CSF functions applied to AI, agent-specific threats, disinformation and an incident response plan." },
      { week: "13", block: "C2", title: "Agents by Business Function", focus: "Architecture choices and trade-offs, and AI-enabled process outsourcing." },
      { week: "14", block: "C2", title: "From Pilot to Production", focus: "KPIs tied to business outcomes and measuring adoption." },
      { week: "15", block: "C2", title: "Governing and Testing Agents", focus: "GDPR/CCPA/HIPAA mapping, sandboxing, A/B and safety testing, risk–speed classification and a governance plan." },
      { week: "16", block: "C2", kind: "capstone", title: "Capstone: Responsible Agent Adoption Plan", focus: "Suitability, business/operational/security/ethical analysis, implementation, risk mitigation and value metrics." },
    ],
    projects: [
      { key: "policy", kind: "project", week: "5", name: "Internal AI-Use Policy Draft", description: "A practical policy your teams could adopt, mapped to a recognized risk framework.", skills: ["governance", "risk framing"] },
      { key: "strategy", kind: "capstone", week: "8", name: "Organizational AI Strategy", description: "Opportunity map, prioritization, owned roadmap, business case and stakeholder presentation.", skills: ["strategy", "prioritization", "business case"], requirements: ["Opportunity map grounded in the organization's work", "Effort–impact–risk prioritization", "Roadmap with owners and timelines", "Business case", "Stakeholder presentation delivered"] },
      { key: "usecase", kind: "project", week: "11", name: "Agent Use-Case Proposal", description: "A workflow analysis and proposal for one agent use case.", skills: ["workflow analysis", "integration planning"] },
      { key: "adoption", kind: "capstone", week: "16", name: "Responsible Agent Adoption Plan", description: "A plan covering suitability, risk, implementation and value metrics.", skills: ["agent governance", "security planning", "value measurement"], requirements: ["Suitability analysis", "Business, operational, security and ethical analysis", "Implementation plan", "Risk mitigation", "Value metrics"] },
    ],
    tools: [
      { family: "Exploration", items: ["A chat-based LLM assistant", "An AI landing-page and prototype builder (selected at cohort start)"] },
      { family: "Collaboration", items: ["Slides and documents", "A whiteboard tool"] },
    ],
    learningExperience: ["Up to 8 live sessions per course with facilitators, practitioners and peers", "2 faculty sessions per course", "Peer discussion", AI_TA, "Recordings with transcripts", "Program support"],
    faculty: [LEAD],
    credential: { certificate: "Scholaris AI Academy Certificate of Completion (one per course)", badge: "Applied AI Leadership bundle badge (Open Badges 3.0), issued when both courses are complete", description: "Each course issues its own certificate; completing both adds the bundle badge." },
    careerServices: ["Leadership portfolio guidance", "Role mapping for AI leadership responsibilities"],
    fees: { price: 2600, earlyBirdPrice: 2340, installments: 4, installmentFee: 0, teamMinSeats: 3, teamDiscountPct: 15, referralCredit: 100 },
    cohort: { code: "LDR-DEC", startInDays: 28, applicationDeadlineInDays: 21, earlyBirdInDays: 10, capacity: 80, timeZone: "America/New_York", schedule: "Live sessions Thu 12:00 ET" },
    parts: [
      { code: "#13.1", title: "Generative AI for Digital Transformation", summary: "Course 1 of the Applied AI Leadership bundle: an 8-week course ending in an organizational AI strategy.", weeks: "1–8", price: 1400 },
      { code: "#13.2", title: "Agentic AI for Organizational Transformation", summary: "Course 2 of the Applied AI Leadership bundle: an 8-week course ending in a responsible agent adoption plan.", weeks: "9–16", price: 1400 },
    ],
    faqs: [
      { q: "Can I take just one course?", a: "Yes. Each course can be taken alone and issues its own certificate. Taking both in sequence adds the bundle badge." },
      { q: "Bundle or single course?", a: "Choose the bundle if you lead AI adoption end to end; choose one course if you need either the generative AI strategy or the agent adoption plan." },
      { q: "Do I need a technical background?", a: "No coding, analytics or machine-learning background is required." },
      ...COMMON_FAQ({ weeks: 16, hours: "a weekly load confirmed before enrollment opens", refund: REFUND, tech: TECH }),
    ],
    creditStatement: "Non-credit professional training. It does not carry academic credit.",
    fundingStatement: "Self-pay, employer sponsorship and team invoicing are accepted. Not eligible for federal student aid or military education benefits.",
    accessMonths: 24,
    lateEnrollmentDays: 7,
    grading: "graded",
    decisions: [{ topic: "Relationship to Program #9", decision: "Program #13 becomes the extended leadership pathway; Course 2 credits toward #9's equivalent modules, and #9 stays available. Alternative: retire #9.", status: "needs_owner_approval" }],
    dataCards: [{ key: "org_case", name: "Fictional company profile pack", purpose: "Strategy and adoption capstones", rows: 12, fields: ["function", "processes", "pain_points", "data_assets", "risk_constraints"], source: "Written by Scholaris; fictional organizations.", caveats: "Learners may substitute their own organization without sharing confidential data." }],
  },

  /* ------------------------------------------------------------------ #14 */
  {
    code: "#14",
    slug: "applied-agentic-ai",
    title: "Certificate in Applied Agentic AI: Systems, Design & Impact",
    productType: "professional_certificate",
    track: "Builder-Applied (programming fundamentals; code + low-code)",
    valueStatement: "Build a portfolio of working agent systems — and the product case that gets them adopted.",
    overview: [
      "A 16-week, portfolio-heavy program that mixes code and low-code. You build multi-agent systems, MCP tool servers and automated workflows, then learn to measure them, design their user experience and argue their return.",
      "Compared with Program 1 this program goes broader on product readiness and less deep on engineering internals; compared with the on-ramp program it assumes programming fundamentals.",
    ],
    level: "intermediate",
    weeks: 16,
    hoursPerWeek: [7, 9],
    format: "online",
    formatText: "Online with live sessions",
    outcomes: [
      "Design single- and multi-agent systems using established agent patterns and architectures.",
      "Build MCP tool servers and connect agents to data and productivity tools with scoped permissions.",
      "Implement agentic retrieval over documents and databases and evaluate answer quality.",
      "Instrument agents with tracing and metrics and connect them to product KPIs and ROI.",
      "Design transparent agent experiences with disclosure, explanation and human-in-the-loop controls.",
      "Present a working prototype with a product strategy, governance plan and go-to-market case.",
    ],
    audience: ["Developers and analysts with programming fundamentals", "Solutions and automation engineers", "Technical product managers who code", "Professionals with 3+ years' experience moving into AI product work (preferred, not required)"],
    prerequisites: "Programming fundamentals. Three or more years of work experience is preferred, not required. An optional Week 0 refresher covers Python with AI coding assistants.",
    codingRequirement: "Coding required — programming fundamentals, mixing code and low-code.",
    blocks: [
      { key: "A", title: "Block A — Agents and Ecosystems", weeks: "0–7" },
      { key: "B", title: "Block B — Tools, Data, Measurement and Launch", weeks: "8–16" },
    ],
    curriculum: [
      { week: "0", block: "A", optional: true, title: "Python With an AI Pair Programmer", focus: "A refresher on Python using AI coding assistants responsibly." },
      { week: "1", block: "A", title: "The Shift to Agentic Systems", focus: "Orientation and the move from AI to generative AI to agents." },
      { week: "2", block: "A", title: "Agent Foundations and Patterns", focus: "Autonomy, design patterns and agent architecture." },
      { week: "3", block: "A", title: "The GenAI Stack and Agent Prompting", focus: "The generative AI technology stack and prompt engineering for agents." },
      { week: "4", block: "A", title: "Inside the Model: Internals and Planning", focus: "LLM internals and planning systems." },
      { week: "5–6", block: "A", title: "Multi-Agent Ecosystems I & II", focus: "Role-based crews, conversational multi-agent systems, graph orchestration and n8n-style workflow automation." },
      { week: "7", block: "A", kind: "midterm", title: "Midterm Project Studio", focus: "Midterm project build and review." },
      { week: "8–9", block: "B", title: "Model Context Protocol and Tooling", focus: "Building MCP servers (for example with FastMCP), connecting productivity and data tools, and securing tool access." },
      { week: "10", block: "B", title: "The Retrieval and Data Layer", focus: "Vector databases, SQL and NoSQL tools, and agentic retrieval routing." },
      { week: "11", block: "B", title: "Evaluation and Observability", focus: "Tracing tools, evaluation datasets and agent metrics." },
      { week: "12", block: "B", title: "Metrics, Go-to-Market and ROI", focus: "Measuring value and planning go-to-market for agent products." },
      { week: "13", block: "B", title: "Agentic UX and Transparency", focus: "Disclosure, explainability and human-in-the-loop interface design." },
      { week: "14", block: "B", title: "Developer Tools and Product Readiness", focus: "AI coding agents, rapid app builders, containers and CI." },
      { week: "15", block: "B", title: "Cloud Agent Deployment Lab", focus: "Deploying on one major cloud agent platform, chosen and verified at cohort start." },
      { week: "16", block: "B", kind: "capstone", title: "Capstone: Strategy Simulation and Prototype", focus: "Product strategy simulation plus a working multi-agent prototype and pitch." },
    ],
    electives: ["AI product studio workshops", "Building GenAI apps on a cloud platform", "Low-code agent builders", "Faculty masterclass series"],
    projects: [
      { key: "finreview", kind: "midterm", week: "7", name: "Financial Statement Review Agent", description: "Agentic retrieval over synthetic company reports that flags consistency, completeness and audit-readiness issues with citations for a human auditor.", skills: ["agentic RAG", "citations", "human review"] },
      { key: "router", kind: "project", week: "10", name: "Grounded Query Router", description: "Router and retriever agents send each question to document or web search and return source-backed answers.", skills: ["routing", "retrieval", "grounding"] },
      { key: "docrag", kind: "project", week: "10", name: "Document RAG Pipeline", description: "Chunking, embeddings, vector search and answer evaluation end to end.", skills: ["chunking", "embeddings", "evaluation"] },
      { key: "meeting", kind: "project", week: "6", name: "Meeting-to-Action Workflow", description: "A multi-agent automation that turns notes into tasks and messages, with an approval step.", skills: ["workflow automation", "approvals"] },
      { key: "mcp", kind: "project", week: "9", name: "MCP Tool Server", description: "Exposes a database and a ticketing tool to agents with scoped permissions.", skills: ["MCP", "permissions", "tool design"] },
      { key: "triage", kind: "project", week: "6", name: "Customer Support Triage Crew", description: "A HavenConnect-style sandbox scenario: classify, retrieve, draft and quality-check replies.", skills: ["multi-agent crews", "quality checks"] },
      { key: "obs", kind: "project", week: "11", name: "Agent Observability Dashboard", description: "Trace, score and compare versions of an agent.", skills: ["tracing", "metrics", "comparison"] },
      { key: "capstone", kind: "capstone", week: "16", name: "Strategy Simulation and Multi-Agent Prototype", description: "Market, users, architecture, metrics/ROI, risk and governance, go-to-market, a working prototype and a stakeholder pitch.", skills: ["product strategy", "multi-agent systems", "pitching"], requirements: ["Market and user analysis", "Architecture with at least two agents and scoped tools", "Metrics and ROI model", "Risk and governance plan", "Go-to-market plan", "Working prototype demo and pitch"] },
    ],
    tools: [
      { family: "Development", items: ["An IDE", "Jupyter notebooks", "AI coding agents", "A rapid app builder"] },
      { family: "LLM apps and orchestration", items: ["LLM APIs", "A graph orchestration framework", "A role-based crew framework", "A conversational multi-agent framework", "n8n-style workflow automation"] },
      { family: "Tool protocols", items: ["MCP and MCP SDKs (e.g., FastMCP)"] },
      { family: "Data", items: ["A vector database", "PostgreSQL", "MongoDB", "A model hub"] },
      { family: "Operations", items: ["A tracing and evaluation tool", "Docker", "GitHub"] },
      { family: "Collaboration (sandbox accounts)", items: ["Docs, email, chat and task tools", "Whiteboard and design tools"] },
    ],
    learningExperience: ["Weekly live sessions", "Short demos and guided practices", "Portfolio reviews", AI_TA, "Recordings with transcripts", "Program support"],
    faculty: [LEAD],
    credential: { certificate: "Scholaris AI Academy Certificate of Completion — Applied Agentic AI: Systems, Design & Impact", badge: "Applied Agentic AI Portfolio badge (Open Badges 3.0)", description: "Issued when required projects and the capstone meet the rubric. Electives are optional and don't count toward completion." },
    careerServices: ["Portfolio review", "Mock interviews", "Role mapping to AI product and solutions roles"],
    fees: { price: 2200, earlyBirdPrice: 1980, installments: 3, installmentFee: 0, teamMinSeats: 3, teamDiscountPct: 10, referralCredit: 100 },
    cohort: { code: "AAA-DEC", startInDays: 35, applicationDeadlineInDays: 28, earlyBirdInDays: 14, capacity: 50, timeZone: "America/New_York", schedule: "Live session Mon 19:00 ET" },
    faqs: [
      { q: "How is this different from Program 1?", a: "Program 1 goes deeper into engineering internals. This program is broader and portfolio-heavy, with more on MCP, workflow automation, UX, metrics and product readiness." },
      { q: "What will I build?", a: "Seven projects and a capstone prototype — from a financial statement review agent to an MCP tool server and an observability dashboard." },
      ...COMMON_FAQ({ weeks: 16, hours: "about 8 hours a week", refund: REFUND, tech: TECH }),
    ],
    creditStatement: "Non-credit professional training. It does not carry academic credit.",
    fundingStatement: "Self-pay, employer sponsorship and team invoicing are accepted. Not eligible for federal student aid or military education benefits.",
    accessMonths: 24,
    lateEnrollmentDays: 7,
    grading: "graded",
    dataCards: [
      { key: "fin_reports", name: "Synthetic company annual reports", purpose: "Financial statement review agent", rows: 60, fields: ["company_id", "year", "statements", "notes", "seeded_issues"], source: "Generated by Scholaris; fictional companies.", caveats: "Contains deliberately seeded inconsistencies for the exercise." },
      { key: "tickets", name: "Synthetic support tickets", purpose: "Triage crew and MCP tool server", rows: 2000, fields: ["ticket_id", "channel", "text", "category", "priority"], source: "Generated by Scholaris.", caveats: "No real customer data." },
    ],
  },

  /* ------------------------------------------------------------------ #26 */
  {
    code: "#26",
    slug: "agentic-systems-live-intensive",
    title: "Agentic AI Systems Design — Live Intensive",
    productType: "live_intensive",
    track: "Builder — Advanced",
    valueStatement: "Seven live weeks to engineer, evaluate and defend an end-to-end agentic system.",
    overview: [
      "A fast, live program for engineers who already write Python. Each week pairs a faculty session with two guided 90-minute labs, so ideas turn into measured code the same week.",
      "You go from a single agent with memory and tools to retrieval-augmented and multi-agent systems, then evaluate, red-team and observe them. The final week is a capstone clinic and presentations.",
    ],
    level: "advanced",
    weeks: 7,
    hoursPerWeek: [8, 11],
    format: "live",
    formatText: "Live online · Weeks 1–6: one faculty session and two guided 90-minute labs · Week 7: capstone labs and presentations",
    outcomes: [
      "Engineer single agents with memory, typed tools and explicit reasoning loops.",
      "Build and benchmark retrieval layers and show their effect on answer quality.",
      "Design multi-agent systems with defined roles, coordination protocols and failure handling.",
      "Integrate external APIs and tools safely with typed schemas, permissions and error handling.",
      "Evaluate, guard, log and trace agent systems so reliability can be measured and improved.",
      "Deliver and defend an end-to-end agentic system for a realistic problem.",
    ],
    audience: ["AI/ML engineers", "Software, full-stack and backend engineers", "Platform, infrastructure and MLOps-adjacent engineers", "Data scientists"],
    prerequisites: "Working Python, algorithms and data structures, and basic LLM and AI concepts. A short prerequisite self-check is required before enrollment.",
    codingRequirement: "Coding required — advanced Python.",
    blocks: [{ key: "A", title: "Live Intensive", weeks: "1–7" }],
    curriculum: [
      { week: "1", title: "Beyond the Chat Box", focus: "Model capabilities and limits, context, structured output, multi-provider APIs and what makes a system agentic.", labs: ["Provider-neutral client with structured output and cost/latency logging", "Pipeline versus tool-calling agent on the same task"] },
      { week: "2", title: "Anatomy of an Agent", focus: "Memory types, tool interfaces, reason-act loops, plan-and-execute and stopping conditions.", labs: ["Typed tools with retries and step limits", "Short- and long-term memory and its effect on multi-turn tasks"] },
      { week: "3", title: "Agents That Look Things Up", focus: "Embeddings, chunking, local and managed vector indexes, hybrid search, reranking and retrieval decisions.", labs: ["Two vector indexes benchmarked on one corpus", "An agent that decides when and what to retrieve, with cited answers"] },
      { week: "4", title: "Deliberate Reasoning and Agent Teams", focus: "Chain-of-thought, self-consistency, tree search, reflection, and debate, critic and orchestrator–worker patterns.", labs: ["Tree-search reasoning solver versus linear reasoning", "Critic/generator loop scored with a quality rubric"] },
      { week: "5", title: "Coordinating Many Agents", focus: "Role-based crews versus stateful graphs; handoffs, shared state and human-in-the-loop.", labs: ["Role-based crew for research-and-report", "The same task as a stateful graph with an approval gate; reliability and cost compared"] },
      { week: "6", title: "Trust, but Measure", focus: "Task and trajectory evaluation, LLM-as-judge calibrated to human labels, prompt-injection defense, validation, logging, tracing and cost monitoring.", labs: ["Evaluation suite and tracing for the Week 5 system", "Red-team with injection attacks, add guardrails, rerun and report the deltas"] },
      { week: "7", kind: "capstone", title: "Capstone Clinic and Presentations", focus: "Capstone build clinic, peer design review and final presentations." },
    ],
    projects: [
      { key: "memo", kind: "project", week: "4", name: "Research Design Memo", description: "A short memo connecting one research paper to your capstone design.", skills: ["research reading", "design reasoning"] },
      {
        key: "capstone", kind: "capstone", week: "7", name: "End-to-End Agentic System", description: "Choose one brief: admissions navigation assistant (Scholarion Demo University catalog), guest-services orchestrator (Haven hospitality sandbox), pharmacy-order status agent (MediGrid sandbox, non-clinical only), support triage crew (HavenConnect sandbox), research brief generator, or code-review assistant.", skills: ["system design", "evaluation", "guardrails", "presentation"],
        requirements: ["Architecture diagram", "At least 2 external tools/APIs with typed schemas", "Retrieval layer where relevant", "Multi-agent or graph coordination", "Evaluation suite with a baseline comparison", "Guardrails, tracing and a cost report", "Limitations section", "10-minute presentation"],
      },
    ],
    tools: [
      { family: "Environments", items: ["Python", "Jupyter", "Google Colab", "Scholaris Cloud Lab"] },
      { family: "Models", items: ["At least three providers through a provider-neutral client (e.g., OpenAI, Anthropic, Google, Mistral)"] },
      { family: "Frameworks", items: ["A chain/expression framework", "A stateful graph framework", "A role-based crew framework"] },
      { family: "Retrieval", items: ["FAISS", "Chroma", "One managed vector database"] },
      { family: "Evaluation and observability", items: ["A tracing/evaluation platform", "An LLM gateway and observability tool", "A maintained guardrail or prompt-injection detection library"] },
    ],
    learningExperience: ["Weekly faculty live session", "Two guided 90-minute labs each week (Weeks 1–6)", "Learning facilitators and weekly office hours", "Cohort discussion and peer groups", AI_TA, "Recordings with chapters and transcripts", "Program support desk"],
    faculty: [LEAD],
    credential: { certificate: "Scholaris AI Academy Certificate of Completion — non-credit professional training", badge: "Agentic Systems Design badge (Open Badges 3.0)", description: "Digital only, issued in your legal name and verifiable by ID, within 10 days after final grading." },
    careerServices: ["Portfolio guidance for your capstone", "Role mapping to AI engineering roles"],
    fees: { price: 2900, earlyBirdPrice: 2610, installments: 3, installmentFee: 0, teamMinSeats: 3, teamDiscountPct: 10, referralCredit: 150 },
    cohort: { code: "ASD-OCT", startInDays: 14, applicationDeadlineInDays: 10, earlyBirdInDays: 5, capacity: 30, timeZone: "America/New_York", schedule: "Live session Wed 12:00 ET · Lab A Thu 12:00 ET · Lab B Fri 12:00 ET" },
    faqs: [
      { q: "Is this a good fit for me?", a: "Yes if you write Python comfortably and want to build agent systems fast with live guidance. If the self-check routes you elsewhere, start with an on-ramp program first." },
      { q: "What are the prerequisites?", a: "Working Python, algorithms and data structures, and basic LLM concepts. Take the self-check on this page." },
      { q: "Can I join late?", a: "Yes, up to 7 days after the start. Week 1 lab deadlines extend automatically." },
      { q: "How long do I keep access?", a: "24 months from the start date, including recordings and transcripts." },
      { q: "What do I need to earn the certificate?", a: "Pass/no-pass: all 12 labs submitted with checkpoints met, every weekly quiz at 70% or above, a capstone that meets the rubric pass threshold, and your final presentation." },
      { q: "Who do I contact about accessibility support?", a: "Contact the program support desk before the start so we can arrange captions, extra time or other support." },
      ...COMMON_FAQ({ weeks: 7, hours: "8–11 hours a week", refund: REFUND, tech: TECH }),
    ],
    creditStatement: "Non-credit professional training. It does not carry academic credit. Completion transfers to other Scholaris programs: it waives Program 1's Weeks 1–8 or Program 15's Weekends 3–5.",
    fundingStatement: "Self-pay, employer sponsorship, team invoicing, tuition-assistance letters, wire transfer and debit are accepted. As non-credit training it is not eligible for federal student aid or military education benefits.",
    accessMonths: 24,
    lateEnrollmentDays: 7,
    grading: "pass_no_pass",
    passRules: ["All 12 labs submitted with checkpoints met", "Every weekly quiz completed at 70% or above", "Capstone meets the rubric pass threshold", "Final presentation delivered"],
    research: [
      { authors: "Wei, J., Wang, X., Schuurmans, D., et al.", year: 2022, title: "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models", venue: "NeurIPS 2022", week: 4 },
      { authors: "Kojima, T., Gu, S. S., Reid, M., Matsuo, Y., & Iwasawa, Y.", year: 2022, title: "Large Language Models are Zero-Shot Reasoners", venue: "NeurIPS 2022", week: 1 },
      { authors: "Yao, S., Zhao, J., Yu, D., et al.", year: 2023, title: "ReAct: Synergizing Reasoning and Acting in Language Models", venue: "ICLR 2023", week: 2 },
      { authors: "Yao, S., Yu, D., Zhao, J., et al.", year: 2023, title: "Tree of Thoughts: Deliberate Problem Solving with Large Language Models", venue: "NeurIPS 2023", week: 4 },
      { authors: "Shinn, N., Cassano, F., Gopinath, A., Narasimhan, K., & Yao, S.", year: 2023, title: "Reflexion: Language Agents with Verbal Reinforcement Learning", venue: "NeurIPS 2023", week: 6 },
      { authors: "Lewis, P., Perez, E., Piktus, A., et al.", year: 2020, title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", venue: "NeurIPS 2020", week: 3 },
      { authors: "Schick, T., Dwivedi-Yu, J., Dessì, R., et al.", year: 2023, title: "Toolformer: Language Models Can Teach Themselves to Use Tools", venue: "NeurIPS 2023", week: 2 },
      { authors: "Park, J. S., O'Brien, J. C., Cai, C. J., et al.", year: 2023, title: "Generative Agents: Interactive Simulacra of Human Behavior", venue: "UIST 2023", week: 5 },
      { authors: "Du, Y., Li, S., Torralba, A., Tenenbaum, J. B., & Mordatch, I.", year: 2024, title: "Improving Factuality and Reasoning in Language Models through Multiagent Debate", venue: "ICML 2024", week: 5 },
    ],
    selfCheck: {
      questions: [
        { id: "py1", prompt: "What does [x * 2 for x in range(3)] evaluate to?", options: ["[0, 2, 4]", "[2, 4, 6]", "[0, 1, 2]", "6"], answer: "[0, 2, 4]" },
        { id: "py2", prompt: "Which structure gives average O(1) lookup by key in Python?", options: ["list", "dict", "tuple", "str"], answer: "dict" },
        { id: "ds1", prompt: "Breadth-first search on a graph is usually implemented with a…", options: ["stack", "queue", "heap", "hash set only"], answer: "queue" },
        { id: "py3", prompt: "What is printed? def f(a, b=[]): b.append(a); return len(b) — print(f(1), f(2))", options: ["1 1", "1 2", "2 2", "Error"], answer: "1 2" },
        { id: "llm1", prompt: "An LLM's context window limits…", options: ["the number of tokens it can consider at once", "how many users can call it", "its training data size", "its output language"], answer: "the number of tokens it can consider at once" },
        { id: "llm2", prompt: "Structured output is most useful when…", options: ["code must parse the model's answer reliably", "you want longer answers", "you want to hide the prompt", "the model is offline"], answer: "code must parse the model's answer reliably" },
      ],
      passMin: 5,
      routeTo: ["#16", "#19"],
    },
    waives: [
      { toCode: "#1", weeks: ["1", "2", "3", "4", "5", "6", "7", "8"], note: "Completion of #26 waives Program #1 Weeks 1–8." },
      { toCode: "#15", weeks: ["3", "4", "5"], note: "Completion of #26 waives Program #15 Weekends 3–5." },
    ],
    dataCards: [
      { key: "agent_tasks", name: "Synthetic multi-turn task set", purpose: "Weeks 1–2 agent and memory labs", rows: 400, fields: ["task_id", "turns", "expected_tool_calls", "gold_answer"], source: "Written by Scholaris.", caveats: "Simplified tasks for measurement." },
      { key: "policy_corpus", name: "Synthetic program and policy documents", purpose: "Week 3 retrieval labs and the admissions capstone", rows: 250, fields: ["doc_id", "title", "section", "text"], source: "Generated from the Scholarion Demo University demo catalog; fictional.", caveats: "Not real policy." },
      { key: "injection_suite", name: "Prompt-injection red-team prompts", purpose: "Week 6 red-team lab", rows: 300, fields: ["case_id", "attack_type", "payload", "expected_behavior"], source: "Written by Scholaris for defensive testing.", caveats: "For sandboxed evaluation only." },
    ],
  },
];

/** Weekly quiz items for Program #26 (original). */
export const P26_QUIZ: Record<number, { kind: "multiple_choice" | "true_false"; prompt: string; choices?: string[]; answer: string }[]> = {
  1: [
    { kind: "multiple_choice", prompt: "Which property most distinguishes an agentic system from a single LLM call?", choices: ["It decides its next action in a loop using tool results", "It uses a larger model", "It has a longer prompt", "It returns JSON"], answer: "It decides its next action in a loop using tool results" },
    { kind: "true_false", prompt: "Structured output removes the need to validate model responses in code.", answer: "False" },
    { kind: "multiple_choice", prompt: "Logging cost and latency per call mainly helps you…", choices: ["compare designs on real trade-offs", "train the model", "hide errors", "increase context size"], answer: "compare designs on real trade-offs" },
  ],
  2: [
    { kind: "multiple_choice", prompt: "Why give an agent a maximum step count?", choices: ["To stop runaway loops and cost", "To make answers longer", "To increase temperature", "To skip tools"], answer: "To stop runaway loops and cost" },
    { kind: "true_false", prompt: "An idempotent tool can be retried safely without duplicating its effect.", answer: "True" },
    { kind: "multiple_choice", prompt: "Long-term memory is best suited for…", choices: ["facts that matter across sessions", "the current tool result", "the system prompt", "random sampling"], answer: "facts that matter across sessions" },
  ],
  3: [
    { kind: "multiple_choice", prompt: "Hybrid search combines…", choices: ["keyword and vector similarity", "two LLMs", "SQL and CSV", "images and audio"], answer: "keyword and vector similarity" },
    { kind: "true_false", prompt: "A reranker reorders retrieved passages by relevance to the query.", answer: "True" },
    { kind: "multiple_choice", prompt: "A grounded answer should…", choices: ["cite the passages it relies on", "avoid citations", "use only model memory", "be as short as possible"], answer: "cite the passages it relies on" },
  ],
  4: [
    { kind: "multiple_choice", prompt: "Self-consistency improves reasoning by…", choices: ["sampling several reasoning paths and choosing the most common answer", "using one greedy path", "removing examples", "shortening the prompt"], answer: "sampling several reasoning paths and choosing the most common answer" },
    { kind: "true_false", prompt: "In a critic/generator loop, the critic should score outputs against an explicit rubric.", answer: "True" },
    { kind: "multiple_choice", prompt: "Tree-search reasoning differs from linear reasoning because it…", choices: ["explores and evaluates alternative intermediate steps", "never backtracks", "uses no model calls", "only works on images"], answer: "explores and evaluates alternative intermediate steps" },
  ],
  5: [
    { kind: "multiple_choice", prompt: "A stateful graph is a good fit when you need…", choices: ["explicit control flow, checkpoints and approval gates", "a single prompt", "no shared state", "random agent order"], answer: "explicit control flow, checkpoints and approval gates" },
    { kind: "true_false", prompt: "Human-in-the-loop steps should come before irreversible actions.", answer: "True" },
    { kind: "multiple_choice", prompt: "A handoff between agents should include…", choices: ["the state and context the next agent needs", "the whole conversation every time", "no context", "the API key"], answer: "the state and context the next agent needs" },
  ],
  6: [
    { kind: "multiple_choice", prompt: "Calibrating an LLM-as-judge means…", choices: ["checking its scores against human labels", "raising its temperature", "using it without examples", "letting it grade itself"], answer: "checking its scores against human labels" },
    { kind: "true_false", prompt: "Prompt-injection defenses should treat retrieved and tool content as data, not instructions.", answer: "True" },
    { kind: "multiple_choice", prompt: "A trajectory evaluation looks at…", choices: ["the sequence of steps and tool calls, not only the final answer", "only the final answer", "token count only", "the UI"], answer: "the sequence of steps and tool calls, not only the final answer" },
  ],
};
