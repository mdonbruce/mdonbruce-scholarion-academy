/**
 * Program #39 — Scholarion GenAI, Agentic AI & AI Agents Professional Program.
 *
 * Original Scholarion wording and design. Competitor programs were used only to compare scope and
 * are not named, quoted or copied. Tool names are plain text; Scholarion is not affiliated with or
 * endorsed by the vendors. No invented statistics, student counts, salaries or placement rates.
 *
 * Cohort dates: the brief asked for a start on 11 January 2027, which is a Monday. Classes run on
 * Saturdays and Sundays, so the cohort is scheduled for the first Saturday after that date
 * (Sat 16 January – Sun 14 March 2027 = 9 weekends, 18 sessions). This needs the owner's
 * confirmation (recorded in `decisions`). US daylight saving time begins on Sun 14 March 2027,
 * so the final session's times in other zones shift by an hour; every time below is computed.
 */
import type { ProgramSpec } from "./programs-data";
import { live, w } from "./programs-data-2";
import { zonedParts } from "../services/ecosystem/cron";

export const GENAI = {
  code: "#39",
  slug: "genai-agentic-ai-agents-professional",
  title: "Scholarion GenAI, Agentic AI & AI Agents Professional Program",
  requestedStart: "2027-01-11",
  firstSaturday: "2027-01-16",
  weekends: 9,
  localStart: "06:00",
  timeZone: "America/New_York",
  sessionMinutes: 180,
  listPrice: 1000,
  offerPrice: 600,
  currency: "USD",
  freeDay1: true,
  contact: { website: "https://scholarion.academy/", email: "Info@scholarion.academy", phone: "+1-754-281-2496" },
  whatsappLink: "https://scholarion.academy/wa-genai-2027",
  zones: [
    { label: "Texas (Central)", tz: "America/Chicago" },
    { label: "New York (Eastern)", tz: "America/New_York" },
    { label: "London (UK)", tz: "Europe/London" },
    { label: "Lagos (WAT)", tz: "Africa/Lagos" },
    { label: "India (IST)", tz: "Asia/Kolkata" },
    { label: "Sydney (Australia)", tz: "Australia/Sydney" },
    { label: "GMT / UTC", tz: "UTC" },
  ],
};

export const NOT_AFFILIATED = "Tool and product names belong to their owners. Scholarion has no affiliation with these vendors, and they have not sponsored or endorsed this program.";

/** 18 sessions: [weekend title, [Saturday], [Sunday]] — each with objectives, demo, lab and deliverable. */
type S = { topic: string; objectives: string[]; demo: string; lab: string; deliverable: string };
const s = (topic: string, objectives: string[], demo: string, lab: string, deliverable: string): S => ({ topic, objectives, demo, lab, deliverable });

export const WEEKENDS: { title: string; sat: S; sun: S; project?: string }[] = [
  {
    title: "Foundations: LLMs, Python and prompting",
    sat: s("How LLMs work — tokens, context, cost; a Python workbench for AI", ["Explain tokens, context windows and sampling", "Estimate cost and latency for a request", "Set up Python, VS Code and Jupyter with secrets kept out of code"], "Same prompt, different temperatures and context sizes, with token counts", "Call a local model through Ollama and a hosted model through a provider-neutral client", "Notebook comparing two models on 5 prompts with cost and latency"),
    sun: s("Prompt engineering and advanced reasoning techniques", ["Write system prompts with clear roles and constraints", "Apply step-by-step, few-shot and ReAct-style prompting", "Evaluate prompts against a small test set"], "A vague prompt refactored into a tested prompt", "Build a 10-case prompt test set and iterate until it passes", "Prompt card with version history and pass rate"),
  },
  {
    title: "Custom assistants, structured output and tools",
    sat: s("Custom assistants: custom GPTs, Gemini Gems and Claude Projects", ["Design an assistant around one real role", "Ground it in instructions and reference files", "Decide what it must never do"], "Same assistant built in two platforms", "Build a course-advisor assistant with guardrail instructions", "Assistant spec and a 10-question acceptance check (P1 starts)"),
    sun: s("Structured outputs and function/tool calling", ["Return JSON that code can validate", "Define typed tools and handle tool errors", "Explain when a model should call a tool"], "Tool calling with validation and retries", "Booking-lookup tool with schema validation", "Working tool-calling script with tests"),
    project: "P1",
  },
  {
    title: "Embeddings, vector databases and RAG",
    sat: s("Embeddings and vector databases (ChromaDB, FAISS, Pinecone)", ["Explain embeddings and similarity", "Index and query documents in a local vector store", "Compare local and hosted stores"], "Semantic search over a handbook", "Index synthetic policy documents in ChromaDB and FAISS", "Search notebook with recall@5 on 20 questions"),
    sun: s("RAG fundamentals", ["Assemble retrieve-then-generate", "Cite sources in answers", "Detect unsupported answers"], "RAG answer with and without retrieval", "Cited Q&A over company documents", "RAG app answering 20 questions with citations"),
  },
  {
    title: "Advanced RAG with LangChain and LlamaIndex",
    sat: s("Chunking, retrieval quality and re-ranking", ["Choose chunk sizes with evidence", "Add hybrid search and re-ranking", "Measure retrieval quality"], "Retrieval quality before and after re-ranking", "Tune chunking and re-ranking on an evaluation set", "Retrieval evaluation table"),
    sun: s("Citations and frameworks: LangChain and LlamaIndex", ["Build the same pipeline in two frameworks", "Return answers with verifiable citations", "Handle 'I don't know' correctly"], "Side-by-side framework walkthrough", "Enterprise RAG app with citations", "P2 Enterprise RAG app submission"),
    project: "P2",
  },
  {
    title: "AI agents: planning, tools and memory",
    sat: s("Agent loop, planning and memory", ["Explain plan–act–observe loops", "Add short- and long-term memory", "Set stopping rules and budgets"], "An agent that stops cleanly at its budget", "Single agent with two tools and memory", "Agent with a run log and budget report"),
    sun: s("Agent frameworks: CrewAI and LangGraph; autonomy with safe tool limits", ["Model a workflow as a graph", "Define roles in a crew", "Enforce tool permissions outside the model"], "Same task as a graph and as a crew", "Bounded agent where blocked actions fail automatically", "Graph or crew solution with a permissions manifest"),
  },
  {
    title: "Multi-agent systems and MCP",
    sat: s("Multi-agent workflows: research → write → review", ["Design hand-offs between agents", "Share state safely", "Review outputs with a critic agent"], "Three-agent pipeline on a research task", "Build the research–write–review system", "P3 multi-agent system submission"),
    sun: s("Model Context Protocol (MCP) and coding agents in the developer workflow", ["Build and connect an MCP server", "Scope what a tool may do", "Use a coding agent with review discipline"], "An MCP server exposing two tools", "Build an MCP server for a course dataset", "MCP server with tests and a README"),
    project: "P3",
  },
  {
    title: "Shipping AI apps",
    sat: s("FastAPI back ends for AI", ["Wrap a model or agent in a typed API", "Add authentication, validation and tests", "Keep API keys in secrets, never in code"], "From notebook to API in 30 minutes", "AI-powered API with auth and tests", "P4 AI-powered API submission"),
    sun: s("Streamlit front ends and deployment basics", ["Build a usable UI for an AI service", "Deploy a demo safely", "Monitor errors and cost"], "UI over the Saturday API", "Streamlit app with MCP tools", "P5 end-to-end solution submission"),
    project: "P4, P5",
  },
  {
    title: "Open and local models; fine-tuning",
    sat: s("Open and local models: Ollama, Hugging Face, Llama / Gemma / Mistral families", ["Run current open-weight models locally", "Compare quality, speed and memory", "Read model licenses before use"], "Local model swap behind the same app", "Benchmark three local models on your task", "Model comparison report"),
    sun: s("Fine-tuning a small model with Unsloth and Hugging Face (LoRA/QLoRA)", ["Prepare a small instruction dataset", "Fine-tune with LoRA on free or local compute", "Evaluate before and after"], "LoRA fine-tune walkthrough", "Fine-tune a small model on a narrow task", "Before/after evaluation"),
  },
  {
    title: "Evaluation, guardrails, observability — and demo day",
    sat: s("Evaluation, guardrails and observability (LangSmith, RAGAS, TruLens, NeMo Guardrails, Guardrails AI)", ["Evaluate RAG and agents with metrics", "Add input and output guardrails", "Trace and monitor runs"], "A guarded app catching an injection attempt", "Evaluate and guard your capstone", "Evaluation report and guardrail tests"),
    sun: s("Responsible AI, privacy and security; capstone demo day", ["Apply privacy and security basics", "Present a working system and its limits", "Respond to technical questions"], "Capstone demos", "Live demo and Q&A", "P6 capstone demo and report"),
    project: "P6",
  },
];

export const PROJECTS = [
  { key: "p1", week: "2", name: "P1 Custom assistant for a real role", description: "A custom assistant for one real job role with grounded instructions, refusal rules and an acceptance test.", skills: ["prompting", "assistant design", "evaluation"] },
  { key: "p2", week: "4", name: "P2 Enterprise RAG app with citations", description: "Question answering over synthetic company documents with citations and a retrieval evaluation.", skills: ["RAG", "vector databases", "citations"] },
  { key: "p3", week: "6", name: "P3 Multi-agent system (research → write → review)", description: "Three cooperating agents with shared state, a critic step and bounded tools.", skills: ["agents", "multi-agent", "orchestration"] },
  { key: "p4", week: "7", name: "P4 AI-powered API (FastAPI) with auth and tests", description: "A typed API around a model or agent with authentication, validation and automated tests.", skills: ["FastAPI", "testing", "security"] },
  { key: "p5", week: "7", name: "P5 End-to-end solution with Streamlit and MCP tools", description: "A Streamlit front end over your API, with MCP tools and basic monitoring.", skills: ["Streamlit", "MCP", "deployment"] },
  { key: "capstone", week: "9", name: "P6 Capstone: a real business use case", description: "Pick education, healthcare administration, hospitality, finance or IT support. Evaluate with RAGAS or LangSmith, protect with guardrails and demo it live on the final weekend.", skills: ["system design", "evaluation", "guardrails"], requirements: ["Problem statement and users", "Architecture with justified tool choices", "Retrieval and/or agents with bounded tools", "Evaluation with a baseline (RAGAS or LangSmith)", "Guardrails and an injection test", "Privacy and security notes", "Cost per run", "Live demo and Q&A", "Limitations and next steps"] },
];

export const TOOL_GROUPS: { family: string; items: { name: string; key: string | null }[] }[] = [
  { family: "Chat & assistants", items: [{ name: "ChatGPT", key: "chatgpt" }, { name: "Claude", key: "claude" }, { name: "Gemini", key: "gemini" }, { name: "Mistral AI", key: "mistral-le-chat" }] },
  { family: "Developer tools", items: [{ name: "Python", key: null }, { name: "VS Code", key: "visual-studio-code" }, { name: "Jupyter", key: "project-jupyter" }, { name: "Claude Code", key: "claude-code" }] },
  { family: "Models", items: [{ name: "Llama", key: "meta-llama" }, { name: "Gemma", key: "google-gemma" }, { name: "Mistral (open-weight)", key: "mistral-open-weight-models" }, { name: "Hugging Face Hub", key: "hugging-face-hub" }] },
  { family: "Frameworks", items: [{ name: "LangChain", key: "langchain" }, { name: "LlamaIndex", key: "llamaindex" }, { name: "LangGraph", key: "langgraph" }, { name: "CrewAI", key: "crewai" }, { name: "MCP (Model Context Protocol)", key: "model-context-protocol" }] },
  { family: "Vector databases", items: [{ name: "ChromaDB", key: "chroma" }, { name: "FAISS", key: "faiss" }, { name: "Pinecone", key: "pinecone" }] },
  { family: "Apps & APIs", items: [{ name: "FastAPI", key: "fastapi" }, { name: "Streamlit", key: "streamlit" }] },
  { family: "Local & fine-tuning", items: [{ name: "Ollama", key: "ollama" }, { name: "Unsloth", key: "unsloth" }] },
  { family: "Evaluation & safety", items: [{ name: "LangSmith", key: "langsmith" }, { name: "RAGAS", key: "ragas" }, { name: "TruLens", key: "trulens" }, { name: "NeMo Guardrails", key: "nvidia-nemo-guardrails" }, { name: "Guardrails AI", key: "guardrails-ai" }] },
  { family: "Presentation", items: [{ name: "Gamma", key: "gamma" }] },
];

/* ---------------- schedule (computed, DST-aware) ---------------- */

/** UTC instant for a wall-clock date/time in a zone (two-pass offset correction handles DST). */
export function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const want = Date.UTC(y, mo - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const z = zonedParts(t, tz);
    const got = Date.UTC(z.year, z.month - 1, z.day, z.hour, z.minute);
    t += want - got;
  }
  return t;
}

export function localLabel(ms: number, tz: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(ms));
}

export function genaiSessions() {
  const out: { n: number; weekend: number; day: "Sat" | "Sun"; date: string; startUtc: string; endUtc: string; session: S; weekendTitle: string; zones: { label: string; time: string }[] }[] = [];
  const first = Date.parse(`${GENAI.firstSaturday}T12:00:00Z`);
  WEEKENDS.forEach((wk, i) => {
    (["sat", "sun"] as const).forEach((k, j) => {
      const date = new Date(first + (i * 7 + j) * 86_400_000).toISOString().slice(0, 10);
      const start = zonedToUtc(date, GENAI.localStart, GENAI.timeZone);
      out.push({ n: out.length + 1, weekend: i + 1, day: j === 0 ? "Sat" : "Sun", date, startUtc: new Date(start).toISOString(), endUtc: new Date(start + GENAI.sessionMinutes * 60_000).toISOString(), session: wk[k], weekendTitle: wk.title, zones: GENAI.zones.map((z) => ({ label: z.label, time: localLabel(start, z.tz) })) });
    });
  });
  return out;
}

export const daysUntil = (iso: string, now: number) => Math.max(1, Math.ceil((Date.parse(`${iso}T12:00:00Z`) - now) / 86_400_000));

/* ---------------- program spec ---------------- */

export function genaiProgramSpec(now: number): ProgramSpec {
  const start = daysUntil(GENAI.firstSaturday, now);
  const spec = live(
    {
      code: GENAI.code,
      slug: GENAI.slug,
      title: GENAI.title,
      productType: "live_intensive",
      track: "Builder",
      catalogTrack: "Builder",
      codingRequired: true,
      formatKind: "live_weekend",
      valueStatement: "Nine weekends of live, hands-on building: prompts, assistants, RAG, agents, MCP, AI apps, local models, fine-tuning and evaluation.",
      overview: [
        "Generative AI, agentic AI and AI agents are changing how work gets done in many industries, and organizations need people who can build and run these systems in practice. This program teaches you to do exactly that, by building a real AI application every weekend.",
        "Each Saturday and Sunday is a three-hour live session with Dr. Martins Donbruce Idahosa: a short explanation, a live demonstration, then a guided hands-on lab in the Scholarion Agentic Cloud Labs. You finish with six portfolio projects and a capstone you demo live.",
        "No prior AI experience is needed. Every lab can be completed at no cost using local models, free tiers and open-source tools; paid APIs are optional.",
      ],
      level: "beginner",
      weeks: GENAI.weekends,
      outcomes: [
        "Design, test and evaluate prompts, and build custom assistants grounded in your own instructions and files.",
        "Build retrieval-augmented generation (RAG) applications over private documents with citations.",
        "Build single- and multi-agent systems with planning, memory and safe tool limits, connected to tools through MCP.",
        "Ship AI applications as APIs (FastAPI) and web apps (Streamlit).",
        "Run open models locally and fine-tune a small open model.",
        "Evaluate, guard and monitor AI systems in use.",
      ],
      audience: ["Students and recent graduates", "IT professionals and developers", "Career changers", "Anyone curious about building with AI — no AI experience required"],
      prerequisites: "Basic computer skills. Python is taught from Weekend 1; prior Python helps but isn't required.",
      codingRequirement: "Hands-on coding in Python, guided from the first session.",
      curriculum: WEEKENDS.map((wk, i) => w(String(i + 1), `Weekend ${i + 1}: ${wk.title}`, `Sat: ${wk.sat.topic}. Sun: ${wk.sun.topic}.`, [], { kind: i === 8 ? "capstone" : undefined })),
      projects: PROJECTS.map((p) => ({ ...p, kind: p.key === "capstone" ? "capstone" : "project" })) as ProgramSpec["projects"],
      tools: [...TOOL_GROUPS.map((g) => ({ family: g.family, items: g.items.map((x) => x.name) })), { family: "Note", items: [NOT_AFFILIATED] }],
      format: "live",
      formatText: `9 weekends · Saturdays and Sundays, 6:00–9:00 AM US Eastern (3-hour live sessions)`,
      decisions: [
        { topic: "Cohort start", decision: "The brief said 11 January 2027, which is a Monday. The cohort is scheduled Sat 16 Jan – Sun 14 Mar 2027 (9 weekends). Confirm, or choose Sat 9 Jan – Sun 7 Mar 2027.", status: "needs_owner_approval" },
        { topic: "Offer price end date", decision: "USD 600 offer (list USD 1,000) is labelled with the early-bird end date shown on this page; set the real end date before publishing.", status: "needs_owner_approval" },
        { topic: "Live class platform", decision: "Free Zoom and Webex plans are limited to 40-minute meetings (verified 2026-10-04), so 3-hour classes need a paid meeting plan or a self-hosted platform.", status: "needs_owner_approval" },
        { topic: "Day 1 free class", decision: "Day 1 (Sat 16 Jan) is a free trial class; meeting ID and passcode are added by the instructor, never published in advance by the generator.", status: "recorded" },
      ],
    },
    {
      price: GENAI.listPrice,
      start,
      hours: [6, 8],
      schedule: "Saturdays and Sundays, 6:00–9:00 AM US Eastern",
      capacity: 60,
      cert: GENAI.title,
      badge: "GenAI, Agentic AI & AI Agents Professional badge (Open Badges 3.0)",
      faqs: [
        { q: "Do I need AI experience?", a: "No. The program starts with how LLMs work and Python for AI, and every lab is guided." },
        { q: "Do I have to pay for AI tools?", a: "No. Every lab can be completed with local models (Ollama), free tiers and open-source tools. Paid APIs are optional." },
        { q: "What if I miss a live session?", a: "Recordings are posted within 24 hours, and weekly office hours help you catch up." },
        { q: "How do I earn the certificate?", a: "Attend at least 80% of live sessions (or watch the recordings and submit the labs) and pass all six projects. The certificate is a verifiable credential." },
        { q: "What times are classes in my time zone?", a: "The schedule table on this page shows every session in US Eastern and several other time zones, including the daylight-saving change in March." },
      ],
    },
  );
  spec.fees = { ...spec.fees, price: GENAI.listPrice, earlyBirdPrice: GENAI.offerPrice };
  spec.learningExperience = ["Live instructor-led sessions every Saturday and Sunday", "Recordings within 24 hours", "Weekly office hours", "Community channel and support desk", "Career guidance; graduates who opt in can be featured in Scholarion Employer Connect", "Certificate of completion issued as a verifiable credential"];
  spec.credential = { ...spec.credential, description: "Issued as a verifiable credential (Open Badges 3.0) when attendance is at least 80% and all six projects pass their rubrics." };
  return spec;
}
