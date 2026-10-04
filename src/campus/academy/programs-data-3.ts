/**
 * Scholaris AI Academy — certificate programs #2–#11 (cohort line).
 *
 * All titles, outcomes, module names, projects and copy are original Scholaris writing.
 * Market reference programs were used only for gap analysis and are not named or quoted.
 * Fees are sandbox placeholders an admin sets before go-live; nothing here is a claim about
 * accreditation, academic credit, pay or placement. Every dataset is synthetic.
 *
 * Differentiation: #2 is the builder on-ramp (LLM apps, prompting, RAG, single agents) and
 * credits into Program 1 (production multi-agent). #3 is the broadest builder path (classical ML
 * → deep learning → GenAI → agents). #4 covers the software lifecycle. #5–#7 are no-code,
 * #8–#9 business and leadership, #10–#11 industry programs with regulation and risk at the center.
 */
import { type ProgramSpec } from "./programs-data";
import { GADDIS, ML_BOOKS, live, w } from "./programs-data-2";

const TOOLS_VERIFIED = "selected and version-pinned at cohort start";

/* ------------------------------------------------------------------ #2 */
const P2: ProgramSpec = live(
  {
    code: "#2",
    slug: "applied-generative-agentic-ai",
    title: "Certificate in Applied Generative & Agentic AI",
    productType: "cohort_program",
    track: "Builder (Python required)",
    catalogTrack: "Builder",
    codingRequired: true,
    formatKind: "cohort",
    valueStatement: "Sixteen weeks from your first model call to a grounded, tool-using agent you can measure and defend.",
    overview: [
      "The builder on-ramp to agentic AI. Block A covers LLM applications: how models behave, prompts that hold up, testing what the model says, and retrieval-augmented generation with citations. Block B turns that assistant into a single tool-using agent with memory, MCP connections, evaluation, tracing and guardrails.",
      "Every week ends with something you have built and measured in the Scholaris Cloud Lab, using synthetic sandbox scenarios such as Scholarion Demo University admissions navigation and Haven hospitality guest services.",
      "It is the step before Program 1, which goes on to production multi-agent systems. Completing this program waives Program 1 Weeks 1–6.",
    ],
    level: "intermediate",
    weeks: 16,
    outcomes: [
      "Build LLM applications that return validated structured output within a stated cost and latency budget.",
      "Design and test prompts against an evaluation set and track regressions between versions.",
      "Implement retrieval-augmented generation with chunking, hybrid search and reranking, and measure citation accuracy.",
      "Construct a single tool-using agent with typed tools, memory, MCP connections and explicit stopping rules.",
      "Evaluate, trace and secure an agent against prompt injection with least-privilege tools and a human approval step.",
    ],
    audience: ["Developers new to LLM applications", "Data analysts who code in Python", "Engineers preparing for Program 1", "Technical product people who want to build, not only specify"],
    prerequisites: "Working Python (functions, lists and dictionaries, packages) and comfort calling a web API. The Week 1 setup is aligned with Gaddis, Starting Out with Python, 6th ed. for anyone who needs a refresher.",
    codingRequirement: "Coding required — Python throughout.",
    blocks: [
      { key: "A", title: "Block A — LLM Applications and Retrieval", weeks: "1–8" },
      { key: "B", title: "Block B — Single Agents, Measured and Secured", weeks: "9–16" },
    ],
    curriculum: [
      w("1", "From Model Call to Product", "Tokens, context windows, sampling, cost and latency; a secure workbench and your first provider-neutral model call.", ["env", "llm"], { block: "A" }),
      w("2", "Prompts as Interfaces", "System prompts, instruction hierarchy, prompt patterns and structured output that code can parse.", ["llm"], { block: "A" }),
      w("3", "Testing What the Model Says", "Evaluation sets, rubrics, pass rates and prompt regression runs.", ["evals"], { block: "A" }),
      w("4", "Meaning as Vectors", "Embeddings, similarity, chunking strategies and vector stores.", ["vectors"], { block: "A" }),
      w("5", "Grounded Answers With RAG", "Retrieval pipelines, document loaders, prompt templates and answers that cite their sources.", ["rag"], { block: "A" }),
      w("6", "Retrieval That Holds Up", "Hybrid search, reranking, query rewriting and measuring retrieval quality.", ["vectors", "evals"], { block: "A" }),
      w("7", "Delivering an LLM App", "Typed APIs, streaming responses and a simple front end people can use.", ["appdel"], { block: "A" }),
      w("8", "Midterm Build Week: Domain Retrieval Assistant", "Midterm project delivery and a Block A knowledge check.", ["rag", "evals"], { block: "A", kind: "midterm" }),
      w("9", "When to Reach for an Agent", "The agent loop, autonomy levels, planning, stopping rules — and when a fixed pipeline is the better answer.", ["agents"], { block: "B" }),
      w("10", "Tools With Contracts", "Function calling, typed tool signatures, validation, retries and idempotent tools.", ["agents"], { block: "B" }),
      w("11", "Agents That Retrieve", "Routing, query planning, self-correction and citation grounding inside an agent.", ["agenticrag"], { block: "B" }),
      w("12", "Memory and MCP Connections", "Short- and long-term memory, context budgets, and consuming MCP servers with scoped permissions.", ["agents", "mcp"], { block: "B" }),
      w("13", "A First Look at Multi-Agent Frameworks", "Handoffs and shared state, previewed with a graph framework (version pinned at cohort start). Program 1 goes deeper.", ["graphs", "multiagent"], { block: "B" }),
      w("14", "Measuring and Tracing Agents", "Task success, trajectory checks, LLM-as-judge calibrated with human labels, tracing and cost per run.", ["evals", "observe"], { block: "B" }),
      w("15", "Security, Safety and Governance", "Prompt injection, least privilege, human-in-the-loop, guardrails, privacy (GDPR, CCPA, NDPA) and an EU AI Act overview.", ["guardrails", "responsible"], { block: "B" }),
      w("16", "Capstone Defense and Demo", "Capstone defense to a faculty panel with an evaluation report.", ["evals"], { block: "B", kind: "capstone" }),
    ],
    projects: [
      { key: "midterm", kind: "midterm", week: "8", name: "Domain Retrieval Assistant", description: "A cited question-answering assistant over the synthetic Scholarion Demo University admissions catalog, with a retrieval evaluation table.", skills: ["retrieval", "citations", "evaluation"], requirements: ["Chunking and retrieval choices justified", "Answers cite their sources", "Evaluation set with retrieval and answer metrics", "Known limitations stated"] },
      { key: "tools", kind: "project", week: "12", name: "Guest-Services Tool Agent", description: "Haven hospitality sandbox: an agent that checks availability, drafts replies and requests staff approval before any booking change.", skills: ["tool use", "memory", "human-in-the-loop"] },
      {
        key: "capstone", kind: "capstone", week: "16", name: "From Retrieval Assistant to Tool-Using Agent", description: "Evolve a RAG-powered domain assistant into a single tool-using agent for one sandbox scenario, and defend it with an evaluation report.", skills: ["RAG", "agent design", "evaluation", "security"],
        requirements: ["Baseline RAG assistant with measured citation accuracy", "Single agent with at least two typed tools and explicit stopping rules", "At least one tool reached through an MCP server with scoped permissions", "Evaluation report comparing the assistant and the agent on the same task set", "Prompt-injection tests and the guardrails added in response", "Human approval before any irreversible action", "Tracing and cost per run reported", "Limitations and a live defense"],
      },
    ],
    tools: [
      { family: "Development", items: ["Python", "VS Code", "Jupyter or Google Colab", "Git and GitHub", "Scholaris Cloud Lab"] },
      { family: "Models", items: ["At least two LLM providers through a provider-neutral client"] },
      { family: "Retrieval and agents", items: ["A vector database", "A graph orchestration framework (version pinned at cohort start)", "MCP SDK"] },
      { family: "Quality", items: [`An evaluation and tracing tool (${TOOLS_VERIFIED})`, "A guardrail or injection-detection library"] },
    ],
    textbooks: [GADDIS],
    dataCards: [
      { key: "admissions_catalog", name: "Synthetic admissions catalog (Scholarion Demo University)", purpose: "Block A retrieval labs and the midterm", rows: 320, fields: ["doc_id", "program", "section", "text", "effective_date"], source: "Generated by Scholaris from the demo catalog; fictional.", caveats: "Not real admissions policy." },
      { key: "guest_requests", name: "Synthetic guest requests (Haven hospitality sandbox)", purpose: "Block B tool agent and capstone option", rows: 3000, fields: ["request_id", "channel", "text", "category", "urgency"], source: "Generated by Scholaris; fictional guests and properties.", caveats: "Simplified request types." },
    ],
    waives: [{ toCode: "#1", weeks: ["1", "2", "3", "4", "5", "6"], note: "Completion of #2 waives Program #1 Weeks 1–6 (agent decision, LLM mechanics, prompts and output contracts, tools, retrieval and agentic RAG)." }],
  },
  {
    price: 2400, start: 35, hours: [7, 9], schedule: "Live session Tue 19:00 ET plus a guided lab Thu 19:00 ET", capacity: 40,
    badge: "Applied Generative & Agentic AI capstone badge (Open Badges 3.0)",
    faqs: [
      { q: "How is this different from Program 1?", a: "This program is the on-ramp: LLM apps, prompting, retrieval and a single tool-using agent. Program 1 continues to production multi-agent systems. Completing this program waives Program 1 Weeks 1–6." },
      { q: "What will I build?", a: "A cited retrieval assistant, a guest-services tool agent and a capstone agent defended with an evaluation report." },
    ],
  },
);

/* ------------------------------------------------------------------ #7 */
const P7: ProgramSpec = live(
  {
    code: "#7",
    slug: "ai-native-professional",
    title: "AI-Native Professional: Workflows & Agents for Everyday Productivity",
    productType: "cohort_program",
    track: "No-code",
    catalogTrack: "No-Code",
    codingRequired: false,
    formatKind: "cohort",
    valueStatement: "Six no-code weeks to rebuild your working week around AI assistants, automations and everyday agents — and measure the time saved.",
    overview: [
      "A short, practical program for professionals who want AI to take on the repetitive parts of their own work. You learn how assistants behave, write reusable prompt templates, build a knowledge assistant over your own (non-confidential) documents, automate recurring tasks and try everyday agents with safe limits.",
      "You keep a time log from Week 1, so the capstone reports measured time savings rather than impressions.",
      "Completing this program waives the opening weeks of Programs 5 and 6, so you can continue into either.",
    ],
    level: "beginner",
    weeks: 6,
    outcomes: [
      "Explain what AI assistants and agents can and cannot do, and decide what information must never be shared with them.",
      "Write reusable prompt templates for recurring tasks and compare their outputs against a checklist.",
      "Build a no-code knowledge assistant over approved documents that cites its sources.",
      "Automate a recurring multi-step task with a workflow tool that includes an AI step and a human check.",
      "Measure and report the time saved by a personal productivity agent stack against a baseline log.",
    ],
    audience: ["Professionals in any function", "Team leads who want to model good AI habits", "Administrators and coordinators", "Anyone starting the no-code path"],
    prerequisites: "None beyond everyday office software. No coding required.",
    codingRequirement: "No coding required.",
    curriculum: [
      w("1", "Working AI-Native", "How assistants work, where they fail, data-handling rules and starting a baseline time log.", ["llm", "responsible"]),
      w("2", "Prompts and Reusable Templates", "Prompt patterns, examples, checklists and a personal template library.", ["llm"]),
      w("3", "Assistants for Your Knowledge", "A no-code knowledge assistant over approved documents, with citations and spot-checks.", ["rag"]),
      w("4", "Automating Repetitive Work", "Triggers, steps and an AI step inside a no-code workflow, with a human check before sending.", ["automation"]),
      w("5", "Everyday Agents, Safely", "Agents that browse, draft and file on your behalf — permissions, approvals and what to keep manual.", ["agents", "guardrails"]),
      w("6", "Capstone: Personal Productivity Agent Stack", "Present your stack and the measured time savings.", ["evals"], { kind: "capstone" }),
    ],
    projects: [
      { key: "templates", kind: "project", week: "2", name: "Personal Prompt Template Library", description: "Five reusable templates for your recurring tasks, each with a quality checklist.", skills: ["prompting", "quality checks"] },
      {
        key: "capstone", kind: "capstone", week: "6", name: "Personal Productivity Agent Stack", description: "A combined assistant, automation and everyday-agent setup for your own work, with documented time-savings measurement.", skills: ["workflow automation", "knowledge assistants", "measurement"],
        requirements: ["Baseline time log from Week 1", "Knowledge assistant with cited answers", "At least one automated workflow with a human check", "Agent permissions and approval points documented", "Measured time savings compared with the baseline", "Data-handling rules followed and stated"],
      },
    ],
    tools: [
      { family: "Assistants", items: ["A chat-based LLM assistant", `A no-code knowledge-assistant builder (${TOOLS_VERIFIED})`] },
      { family: "Automation", items: ["A no-code workflow automation tool (verified at cohort start)"] },
      { family: "Measurement", items: ["A spreadsheet time log"] },
    ],
    dataCards: [{ key: "office_docs", name: "Synthetic office document pack", purpose: "Knowledge assistant and automation labs", rows: 150, fields: ["doc_id", "type", "title", "text"], source: "Written by Scholaris; fictional organization.", caveats: "Use it instead of confidential work documents." }],
    waives: [
      { toCode: "#5", weeks: ["1", "2"], note: "Completion of #7 waives Program #5 Weeks 1–2 (AI foundations and prompting for everyday work)." },
      { toCode: "#6", weeks: ["1", "2", "3"], note: "Completion of #7 waives Program #6 Weeks 1–3 (generative AI foundations, prompting patterns and personal assistants)." },
    ],
  },
  {
    price: 900, start: 21, hours: [4, 5], schedule: "Live session Wed 12:00 ET plus self-paced practice", capacity: 60,
    badge: "AI-Native Professional badge (Open Badges 3.0)",
    faqs: [{ q: "Does this count toward the longer no-code programs?", a: "Yes. It waives Program 5 Weeks 1–2 and Program 6 Weeks 1–3." }],
  },
);

/* ------------------------------------------------------------------ #6 */
const P6: ProgramSpec = live(
  {
    code: "#6",
    slug: "no-code-genai-agent-workflows",
    title: "Certificate in No-Code Generative AI & Agent Workflows",
    productType: "cohort_program",
    track: "No-code",
    catalogTrack: "No-Code",
    codingRequired: false,
    formatKind: "cohort",
    valueStatement: "Twelve no-code weeks to build knowledge assistants and automated workflows that a department can rely on.",
    overview: [
      "A generative-AI-only program for people who build without code. You move from prompting to knowledge assistants, no-code retrieval with citations, testing, workflow automation and no-code agents with connectors — then govern and roll them out.",
      "There is no predictive machine learning here; Program 5 adds that. Completing Program 7 first waives Weeks 1–3.",
    ],
    level: "beginner",
    weeks: 12,
    outcomes: [
      "Apply prompting patterns and templates to department tasks and document them for reuse.",
      "Build a no-code knowledge assistant that retrieves from approved sources and cites them.",
      "Test assistants with a question set and record accuracy, refusals and failure cases.",
      "Design automated workflows that combine AI steps, connectors and human review.",
      "Plan the rollout of an assistant and workflow with privacy controls, a usage policy and value measures.",
    ],
    audience: ["Operations and administrative staff", "Team leads and coordinators", "HR, finance and communications professionals", "Graduates of Program 7"],
    prerequisites: "None beyond everyday office software. Program 7 is a useful first step but not required.",
    codingRequirement: "No coding required.",
    curriculum: [
      w("1", "Generative AI Foundations", "How models generate text, what they are good at, hallucinations and data-handling rules.", ["llm"]),
      w("2", "Prompting Patterns for Work", "Roles, examples, constraints, structured output and reusable templates.", ["llm"]),
      w("3", "Personal and Team Assistants", "Configured assistants with instructions and examples for recurring team tasks.", ["llm"]),
      w("4", "Building a Knowledge Assistant", "Choosing sources, preparing documents and configuring a no-code assistant.", ["rag"]),
      w("5", "No-Code Retrieval That Cites Its Sources", "How retrieval works under the hood, chunking choices and citation checks.", ["rag", "vectors"]),
      w("6", "Testing Assistants", "Question sets, scoring, refusals and tracking changes over time.", ["evals"]),
      w("7", "Workflow Automation Basics", "Triggers, steps, branching, error handling and schedules in a no-code tool.", ["automation"]),
      w("8", "AI Steps Inside Workflows", "Classifying, summarizing and drafting inside workflows, with a review step.", ["automation"]),
      w("9", "No-Code Agents and Connectors", "Agents that use connectors and tools; an overview of MCP and why scoped access matters.", ["agents", "mcp"]),
      w("10", "Security, Privacy and Responsible Use", "Prompt injection through documents and email, least privilege, privacy rules (GDPR, CCPA, NDPA) and an EU AI Act overview.", ["guardrails", "responsible"]),
      w("11", "Adoption and Measuring Value", "Usage policy, training, change and the measures that show value.", ["strategy"]),
      w("12", "Capstone: Department Assistant and Workflow", "Present the assistant, the workflow and the rollout plan.", ["evals"], { kind: "capstone" }),
    ],
    projects: [
      { key: "assistant", kind: "project", week: "6", name: "Tested Knowledge Assistant", description: "A no-code assistant over a synthetic policy pack, with a question set and results.", skills: ["knowledge assistants", "testing"] },
      {
        key: "capstone", kind: "capstone", week: "12", name: "Department Knowledge Assistant and Automated Workflow", description: "A no-code knowledge assistant plus an automated workflow for one department process (for example HavenConnect support triage or Scholarion Demo University admissions inquiries), with a rollout plan.", skills: ["knowledge assistants", "workflow automation", "governance"],
        requirements: ["Process map before and after", "Knowledge assistant with cited answers and a tested question set", "Automated workflow with an AI step and human review", "Privacy and access controls documented", "Usage policy and training plan", "Value measures and a pilot plan"],
      },
    ],
    tools: [
      { family: "Assistants", items: ["A chat-based LLM assistant", `A no-code knowledge-assistant builder (${TOOLS_VERIFIED})`] },
      { family: "Automation and agents", items: ["A no-code workflow automation tool", "A no-code agent builder with connectors (verified at cohort start)"] },
      { family: "Collaboration", items: ["Documents and slides", "A whiteboard tool"] },
    ],
    dataCards: [
      { key: "policy_pack", name: "Synthetic department policy pack", purpose: "Knowledge assistant labs", rows: 220, fields: ["doc_id", "department", "title", "text"], source: "Written by Scholaris; fictional organization.", caveats: "Not real policy." },
      { key: "support_tickets", name: "Synthetic support tickets (HavenConnect sandbox)", purpose: "Workflow automation and capstone option", rows: 2000, fields: ["ticket_id", "channel", "text", "category", "priority"], source: "Generated by Scholaris.", caveats: "No real customer data." },
    ],
  },
  {
    price: 1600, start: 42, hours: [4, 6], schedule: "Live session Thu 12:00 ET plus self-paced build time", capacity: 50,
    badge: "No-Code Generative AI & Agent Workflows badge (Open Badges 3.0)",
    faqs: [{ q: "How is this different from Program 5?", a: "This program is generative AI only. Program 5 adds no-code predictive models and agents that act on predictions." }],
  },
);

/* ------------------------------------------------------------------ #5 */
const P5: ProgramSpec = live(
  {
    code: "#5",
    slug: "no-code-ai-ml-agents",
    title: "Certificate in No-Code AI, Machine Learning & Agents",
    productType: "cohort_program",
    track: "No-code",
    catalogTrack: "No-Code",
    codingRequired: false,
    formatKind: "cohort",
    valueStatement: "Fourteen no-code weeks to build predictive models and the agents that act on them — with a person approving what matters.",
    overview: [
      "The broadest no-code program. You prepare data, train classification and forecasting models with AutoML tools, read their results critically, and check them for fairness. Then you build knowledge assistants, automated workflows and no-code agents that act on predictions with a human approval step.",
      "Completing Program 7 first waives Weeks 1–2.",
    ],
    level: "beginner",
    weeks: 14,
    outcomes: [
      "Prepare tabular data for machine learning and identify quality issues and leakage risks.",
      "Train and compare no-code classification and forecasting models using appropriate metrics.",
      "Interpret model results, explanations and fairness checks, and state each model's limits.",
      "Build no-code workflows and agents that act on model predictions with a human approval step.",
      "Evaluate the value and risk of a predictive agent and present a rollout plan.",
    ],
    audience: ["Analysts who work in spreadsheets and BI tools", "Operations, sales and service managers", "Business professionals moving into AI roles", "Graduates of Program 7"],
    prerequisites: "Comfort with spreadsheets (sorting, filtering, simple formulas). No coding or statistics background required.",
    codingRequirement: "No coding required.",
    curriculum: [
      w("1", "AI, Machine Learning and Agents Without Code", "What predictive and generative AI each do, where agents fit, and data-handling rules.", ["llm", "responsible"]),
      w("2", "Prompting for Everyday Work", "Prompt patterns, templates and checking outputs.", ["llm"]),
      w("3", "Data You Can Trust", "Cleaning, joining and profiling tabular data without code; spotting leakage.", ["wrangle"]),
      w("4", "Predicting Categories: No-Code Classification", "Training classifiers with an AutoML tool; train, validate and test splits.", ["mlfound"]),
      w("5", "Predicting Numbers and Time: No-Code Forecasting", "Regression and time-series forecasting with AutoML; seasonality and horizons.", ["mlfound"]),
      w("6", "Reading Model Results", "Confusion matrices, precision and recall, error measures and choosing a threshold.", ["mlfound", "evals"]),
      w("7", "Fairness and Explainability Checks", "Feature importance, subgroup performance and documenting limits.", ["responsible"]),
      w("8", "Knowledge Assistants Without Code", "A no-code assistant over approved documents, with citations.", ["rag"]),
      w("9", "Automating Workflows", "Triggers, steps, connectors and error handling in a no-code tool.", ["automation"]),
      w("10", "No-Code Agents and Tools", "Agents that use connectors; an overview of MCP and scoped access.", ["agents", "mcp"]),
      w("11", "Agents That Act on Predictions", "Feeding model scores into a workflow or agent, with thresholds and approval routing.", ["automation", "agents"]),
      w("12", "Human Approval, Guardrails and Privacy", "Approval design, prompt injection, least privilege, privacy (GDPR, CCPA, NDPA) and an EU AI Act overview.", ["guardrails", "responsible"]),
      w("13", "Measuring Value and Rolling Out", "Pilot design, value measures, monitoring and change.", ["strategy", "evals"]),
      w("14", "Capstone: Predictive Agent With Human Approval", "Present the model, the agent and the rollout plan.", ["evals"], { kind: "capstone" }),
    ],
    projects: [
      { key: "model", kind: "project", week: "7", name: "No-Code Predictive Model Report", description: "A classification or forecasting model on a synthetic dataset, with metrics, a fairness check and stated limits.", skills: ["AutoML", "model evaluation", "fairness"] },
      {
        key: "capstone", kind: "capstone", week: "14", name: "Predictive Model With an Approval-Gated Agent", description: "A no-code predictive model (for example MediGrid order-delay forecasting, non-clinical) plus an agent that acts on its predictions only after a human approves.", skills: ["AutoML", "agents", "human-in-the-loop"],
        requirements: ["Model trained and compared with a simple baseline", "Metrics chosen and explained", "Fairness and limits documented", "Agent or workflow acting on predictions", "Human approval step before any action", "Value measures and a rollout plan"],
      },
    ],
    tools: [
      { family: "Machine learning", items: [`A no-code AutoML tool (${TOOLS_VERIFIED})`, "A spreadsheet or BI tool"] },
      { family: "Assistants and agents", items: ["A chat-based LLM assistant", "A no-code agent builder with connectors (verified at cohort start)"] },
      { family: "Automation", items: ["A no-code workflow automation tool"] },
    ],
    dataCards: [
      { key: "order_delays", name: "Synthetic order-fulfillment events (MediGrid sandbox, non-clinical)", purpose: "Forecasting labs and capstone option", rows: 20000, fields: ["order_id", "warehouse", "carrier", "placed_at", "delivered_at", "delay_days"], source: "Generated by Scholaris.", caveats: "No patient or clinical data; logistics fields only." },
      { key: "churn", name: "Synthetic service-subscription customers", purpose: "Classification labs", rows: 8000, fields: ["customer_id", "tenure_months", "plan", "tickets", "churned"], source: "Generated by Scholaris; fictional customers.", caveats: "Simplified relationships for teaching." },
    ],
  },
  {
    price: 1900, start: 49, hours: [4, 6], schedule: "Live session Mon 12:00 ET plus self-paced build time", capacity: 50,
    badge: "No-Code AI, Machine Learning & Agents badge (Open Badges 3.0)",
    faqs: [{ q: "Do I need statistics?", a: "No. The model-reading weeks teach the measures you need in plain language." }],
  },
);

/* ------------------------------------------------------------------ #8 */
const P8: ProgramSpec = live(
  {
    code: "#8",
    slug: "ai-agents-business-operations",
    title: "Certificate in AI Agents for Business Operations",
    productType: "cohort_program",
    track: "Business & Leadership (practitioner, low-code)",
    catalogTrack: "Business & Leadership",
    codingRequired: false,
    formatKind: "cohort",
    valueStatement: "Twelve low-code weeks to put an AI agent into a real business process — with escalation, governance and a return-on-investment case.",
    overview: [
      "For practitioners who implement change in operations: customer service, procurement, finance operations, HR services and admissions. You map a process, decide where an agent helps, build it with low-code agent and workflow tools, connect it to systems, design escalation to people, then test, govern and make the business case.",
      "Light configuration only — no programming. Sandbox scenarios include HavenConnect support triage and Haven hospitality guest services.",
    ],
    level: "intermediate",
    weeks: 12,
    outcomes: [
      "Analyze a business process and identify the steps where an agent adds value and where people must decide.",
      "Configure a low-code agent grounded in company knowledge and connected to business systems with scoped access.",
      "Design human-in-the-loop escalation, handoffs and exception handling for an operational agent.",
      "Evaluate an operational agent with test scenarios, monitoring measures and a security and privacy review.",
      "Justify an agent deployment with an ROI case, governance plan and change plan.",
    ],
    audience: ["Operations and process-improvement professionals", "Customer service and procurement managers", "Business analysts", "Automation and shared-services teams"],
    prerequisites: "Experience in a business function. Comfort with spreadsheets and business software; no programming required.",
    codingRequirement: "No coding required — low-code configuration only.",
    curriculum: [
      w("1", "Where Agents Fit in Operations", "Assistants, automations and agents compared; autonomy levels and operational risk.", ["agents", "strategy"]),
      w("2", "Mapping Processes for Agents", "Process mapping, decision points, volumes, exceptions and baseline measures.", ["strategy"]),
      w("3", "Instructions for Business Agents", "Instructions, examples, tone, structured output and refusal rules.", ["llm"]),
      w("4", "Grounding Agents in Company Knowledge", "Retrieval over policies and knowledge bases, with citations and freshness.", ["rag"]),
      w("5", "Low-Code Agent and Workflow Builders", "Building an agent and its workflow in low-code tools (verified at cohort start).", ["automation"]),
      w("6", "Connecting Systems: APIs, Connectors and MCP", "Connectors to ticketing, CRM and ERP sandboxes; MCP in practice; least privilege.", ["mcp"]),
      w("7", "Escalation and Human-in-the-Loop Design", "Approval gates, confidence thresholds, exception queues and service levels.", ["graphs"]),
      w("8", "Multi-Agent Handoffs in Operations", "Specialist agents, handoffs and shared case state.", ["multiagent"]),
      w("9", "Testing and Monitoring Operational Agents", "Scenario tests, quality scoring, dashboards and drift in requests.", ["evals", "observe"]),
      w("10", "Security, Privacy and Governance", "Prompt injection through inbound messages, data minimization, GDPR/CCPA/NDPA, audit logs and an EU AI Act overview.", ["guardrails", "responsible"]),
      w("11", "ROI, Change and Rollout", "Cost model, benefits, adoption, training and a phased rollout.", ["strategy"]),
      w("12", "Capstone: Business-Process Agent", "Present the agent, its ROI case and its governance plan.", ["evals"], { kind: "capstone" }),
    ],
    projects: [
      { key: "process", kind: "project", week: "2", name: "Process Map and Agent Opportunity Brief", description: "A current-state map with decision points, exceptions and baseline measures.", skills: ["process mapping", "opportunity framing"] },
      {
        key: "capstone", kind: "capstone", week: "12", name: "Business-Process Agent With ROI and Governance", description: "A low-code agent for one process — for example customer-service triage (HavenConnect sandbox) or procurement request intake — with an ROI case and a governance plan.", skills: ["agent configuration", "escalation design", "ROI", "governance"],
        requirements: ["Current and future process maps", "Agent grounded in approved knowledge with citations", "System connections with least-privilege access", "Escalation and human approval design", "Scenario test results and monitoring measures", "ROI case with stated assumptions", "Governance plan covering privacy, security and audit"],
      },
    ],
    tools: [
      { family: "Agents and automation", items: [`A low-code agent builder (${TOOLS_VERIFIED})`, "A workflow automation tool", "MCP-compatible connectors"] },
      { family: "Sandbox systems", items: ["Ticketing, CRM and procurement sandboxes"] },
      { family: "Analysis", items: ["A spreadsheet or BI tool", "A whiteboard tool"] },
    ],
    dataCards: [
      { key: "tickets", name: "Synthetic support tickets (HavenConnect sandbox)", purpose: "Triage labs and capstone option", rows: 2500, fields: ["ticket_id", "channel", "text", "category", "priority", "resolution"], source: "Generated by Scholaris.", caveats: "No real customer data." },
      { key: "procurement", name: "Synthetic procurement requests", purpose: "Procurement intake capstone option", rows: 1500, fields: ["request_id", "department", "item", "amount", "vendor", "policy_flags"], source: "Generated by Scholaris; fictional vendors.", caveats: "Simplified approval policy." },
    ],
  },
  {
    price: 1900, start: 56, hours: [4, 6], schedule: "Live session Tue 12:00 ET plus build time", capacity: 45,
    badge: "AI Agents for Business Operations badge (Open Badges 3.0)",
    faqs: [{ q: "How is this different from Program 9?", a: "This program is for practitioners who configure and run agents in a process. Program 9 is for leaders who set strategy, the operating model and governance." }],
  },
);

/* ------------------------------------------------------------------ #9 */
const P9: ProgramSpec = live(
  {
    code: "#9",
    slug: "genai-agent-strategy-leaders",
    title: "Certificate in Generative AI & AI Agent Strategy for Leaders",
    productType: "cohort_program",
    track: "Business & Leadership (no coding required)",
    catalogTrack: "Business & Leadership",
    codingRequired: false,
    formatKind: "cohort",
    valueStatement: "Twelve weeks to set an AI and agent strategy your organization can fund, govern and adopt.",
    overview: [
      "For leaders who decide where generative AI and agents go, how they are paid for and how they are governed. You build a working understanding of capabilities, limits and costs, then prioritize use cases, choose sourcing options, shape the operating model, set risk and governance, and plan change.",
      "You finish with an AI strategy and agent adoption roadmap presented in a board-style session. No coding is involved.",
    ],
    level: "intermediate",
    weeks: 12,
    outcomes: [
      "Explain generative AI and agent capabilities, limits and cost drivers to boards and teams.",
      "Prioritize AI and agent use cases using value, feasibility and risk criteria.",
      "Evaluate build, buy and compose options and construct a business case with ROI assumptions.",
      "Design an AI operating model, governance structure and risk register aligned with current frameworks.",
      "Present an agent adoption roadmap with change management and adoption measures to a board-style panel.",
    ],
    audience: ["Executives and functional heads", "Directors and senior managers", "Transformation and strategy leads", "Founders and consultants"],
    prerequisites: "Leadership responsibility for a team, function or initiative. No coding or technical background required.",
    codingRequirement: "No coding required.",
    curriculum: [
      w("1", "The Leader's View of Generative and Agentic AI", "What changed, where value is appearing, and the questions leaders should ask.", ["llm", "strategy"]),
      w("2", "Capabilities, Limits and Costs", "Hallucinations, context, cost per task and red flags in vendor claims.", ["llm"]),
      w("3", "From Assistants to Agents", "Autonomy levels, tools, multi-agent systems and interoperability standards such as MCP.", ["agents"]),
      w("4", "Finding and Prioritizing Use Cases", "Opportunity mapping and value–feasibility–risk scoring.", ["strategy"]),
      w("5", "Build, Buy or Compose", "Sourcing options, platform selection and vendor due diligence.", ["strategy"]),
      w("6", "Business Cases and ROI", "Cost models, benefit logic, sensitivity and measuring outcomes.", ["strategy"]),
      w("7", "Operating Models for AI", "Centers of excellence, platform teams and federated models; roles and decision rights.", ["strategy"]),
      w("8", "Risk, Security and Agent Permissions", "Prompt injection, least privilege, third-party risk and incident response.", ["guardrails"]),
      w("9", "Governance, Regulation and Oversight", "Human oversight, bias, privacy (GDPR, CCPA, HIPAA, NDPA), the EU AI Act, risk frameworks and model risk management.", ["responsible"]),
      w("10", "Guiding Change and Workforce Readiness", "Change models, skills, communication and psychological safety.", ["strategy"]),
      w("11", "Measuring Adoption and Value", "Adoption measures, value tracking and portfolio reviews.", ["evals", "strategy"]),
      w("12", "Capstone: Board-Style Strategy Presentation", "Present your strategy, roadmap, risk register and operating model.", ["strategy"], { kind: "capstone" }),
    ],
    projects: [
      { key: "usecases", kind: "project", week: "4", name: "Prioritized Use-Case Portfolio", description: "A scored portfolio of AI and agent use cases for your organization or a provided case organization.", skills: ["prioritization", "opportunity mapping"] },
      {
        key: "capstone", kind: "capstone", week: "12", name: "AI Strategy and Agent Adoption Roadmap", description: "An AI strategy and agent adoption roadmap with a risk register and operating model, presented to a board-style panel.", skills: ["strategy", "governance", "operating model", "executive communication"],
        requirements: ["Strategy tied to organizational goals", "Prioritized use cases with value, feasibility and risk scores", "Business case with ROI assumptions", "Operating model with roles and decision rights", "Risk register with owners and mitigations", "Roadmap with milestones and adoption measures", "Board-style presentation delivered"],
      },
    ],
    tools: [
      { family: "Exploration", items: ["A chat-based LLM assistant", "A no-code agent demo environment (verified at cohort start)"] },
      { family: "Collaboration", items: ["Documents and slides", "A whiteboard tool"] },
    ],
    dataCards: [{ key: "case_org", name: "Fictional case organization pack", purpose: "Use-case portfolio and capstone", rows: 14, fields: ["function", "processes", "pain_points", "data_assets", "risk_constraints", "budget_range"], source: "Written by Scholaris; fictional organization.", caveats: "Learners may substitute their own organization without sharing confidential data." }],
  },
  {
    price: 2200, start: 63, hours: [4, 5], schedule: "Live session Thu 12:00 ET (90 minutes) plus reading and capstone work", capacity: 60,
    badge: "Generative AI & Agent Strategy for Leaders badge (Open Badges 3.0)",
    faqs: [{ q: "How does this relate to Program 13?", a: "Program 13 is a longer two-course leadership bundle. This program is a single 12-week strategy certificate; advisors can help you choose." }],
  },
);

/* ------------------------------------------------------------------ #3 */
const P3: ProgramSpec = live(
  {
    code: "#3",
    slug: "applied-ai-ml-genai-agents",
    title: "Professional Certificate in Applied AI: Machine Learning, Generative AI & Agents",
    productType: "cohort_program",
    track: "Builder (Python required)",
    catalogTrack: "Builder",
    codingRequired: true,
    formatKind: "cohort",
    valueStatement: "Twenty weeks from classical machine learning and deep learning to generative AI features and agentic workflows — on one dataset you come to know well.",
    overview: [
      "The broadest builder program, for learners without a machine-learning foundation. Block A covers the ML workflow, model evaluation, ensembles, unsupervised learning and deep learning; every deep learning lab ships in PyTorch and TensorFlow/Keras versions. Block B moves to large language models, retrieval, adaptation, agents, multi-agent workflows with MCP, evaluation, governance and deployment.",
      "The capstone joins the two halves: a predictive model, a generative AI feature and an agentic workflow built on the same synthetic dataset, documented with a model card.",
    ],
    level: "intermediate",
    weeks: 20,
    outcomes: [
      "Build and evaluate supervised and unsupervised models with scikit-learn pipelines and appropriate metrics.",
      "Train deep learning models for tabular, vision and text data in PyTorch or TensorFlow/Keras.",
      "Develop generative AI features with prompting, structured output and retrieval, and choose between retrieval and fine-tuning.",
      "Design tool-using and multi-agent workflows with MCP connections and human approval steps.",
      "Evaluate, document, secure and deploy AI systems with model cards, guardrails and monitoring.",
    ],
    audience: ["Developers and analysts with basic Python", "Career changers committed to AI engineering", "Data professionals adding ML and GenAI", "Engineers who skipped machine-learning fundamentals"],
    prerequisites: "Basic Python (a Gaddis-aligned refresher is in Week 1) and high-school algebra. No prior machine-learning experience needed.",
    codingRequirement: "Coding required — Python throughout.",
    blocks: [
      { key: "A", title: "Block A — Machine Learning and Deep Learning", weeks: "1–10" },
      { key: "B", title: "Block B — Generative AI and Agents", weeks: "11–20" },
    ],
    curriculum: [
      w("1", "Python and Data for AI", "A Gaddis-aligned Python refresher, notebooks, environments and NumPy basics.", ["pyfound", "env"], { block: "A" }),
      w("2", "Exploring and Preparing Data", "pandas, visualization, missing values, encoding and feature engineering.", ["wrangle"], { block: "A" }),
      w("3", "Supervised Learning: Regression and Classification", "Linear and logistic models, decision trees and scikit-learn pipelines.", ["mlfound"], { block: "A" }),
      w("4", "Evaluating Models Honestly", "Cross-validation, metrics, ROC and PR curves, calibration and the bias–variance trade-off.", ["mlfound"], { block: "A" }),
      w("5", "Ensembles and Unsupervised Learning", "Random forests, gradient boosting, clustering and dimensionality reduction.", ["mlfound"], { block: "A" }),
      w("6", "Neural Networks in Two Frameworks", "Perceptrons to multilayer networks: training loops, optimizers and regularization.", ["dl"], { block: "A", dual: true }),
      w("7", "Vision With CNNs and Transfer Learning", "Convolutional networks and fine-tuning pretrained vision models.", ["dl"], { block: "A", dual: true }),
      w("8", "Sequences, Text and Transformers", "Text preprocessing, embeddings, attention and a small transformer classifier.", ["nlp"], { block: "A", dual: true }),
      w("9", "Responsible ML and Model Cards", "Subgroup performance, explainability, privacy and writing a model card.", ["responsible"], { block: "A" }),
      w("10", "Midterm Build Week: Predictive Model With a Model Card", "Midterm project delivery and the Block A knowledge check.", ["mlfound"], { block: "A", kind: "midterm" }),
      w("11", "Inside Large Language Models", "Tokens, context windows, sampling, cost and latency; provider-neutral clients.", ["llm"], { block: "B" }),
      w("12", "Prompting and Structured Output", "Prompt patterns, output schemas, function calling and prompt test sets.", ["llm", "evals"], { block: "B" }),
      w("13", "Embeddings and Retrieval", "Vector stores, chunking, hybrid search, reranking and cited answers.", ["vectors", "rag"], { block: "B" }),
      w("14", "Retrieval or Fine-Tuning? Choosing an Adaptation", "When parameter-efficient fine-tuning beats retrieval or prompting, measured on the same task.", ["nlp", "observe"], { block: "B", dual: true }),
      w("15", "Agents and Tools", "The agent loop, typed tools, planning, memory and stopping rules.", ["agents"], { block: "B" }),
      w("16", "Multi-Agent Workflows and MCP", "Supervisors, handoffs, graph workflows (framework version pinned at cohort start) and MCP servers with scoped permissions.", ["multiagent", "graphs", "mcp"], { block: "B" }),
      w("17", "Evaluating GenAI and Agents", "Evaluation sets, LLM-as-judge calibrated with human labels, trajectory checks and tracing.", ["evals"], { block: "B" }),
      w("18", "Security, Privacy and Governance", "Prompt injection, least privilege, human-in-the-loop, bias, GDPR/CCPA/NDPA, an EU AI Act overview and model risk management.", ["guardrails", "responsible"], { block: "B" }),
      w("19", "Deploying and Monitoring AI Features", "Typed APIs, containers, CI/CD, drift and cost monitoring.", ["appdel", "deploy", "observe"], { block: "B" }),
      w("20", "Capstone Defense and Demo", "Capstone defense to a faculty panel.", ["evals"], { block: "B", kind: "capstone" }),
    ],
    projects: [
      { key: "midterm", kind: "midterm", week: "10", name: "Predictive Model With a Model Card", description: "A tabular model compared with a baseline and a neural network, with error analysis and a model card.", skills: ["ML workflow", "deep learning", "model documentation"], requirements: ["Baseline and improved models", "Appropriate metrics with cross-validation", "Subgroup error analysis", "Model card"] },
      { key: "rag", kind: "project", week: "13", name: "Cited Retrieval Feature", description: "A retrieval feature over the synthetic dataset's documents with an answer-quality table.", skills: ["retrieval", "evaluation"] },
      {
        key: "capstone", kind: "capstone", week: "20", name: "Model to GenAI Feature to Agentic Workflow", description: "On one synthetic dataset (for example MediGrid order fulfillment, non-clinical, or Haven hospitality bookings): a predictive model, a generative AI feature that explains or acts on it, and an agentic workflow with a human approval step — documented with a model card.", skills: ["machine learning", "generative AI", "agents", "model cards"],
        requirements: ["Predictive model with metrics and a baseline", "Generative AI feature with prompt or retrieval evaluation", "Agentic workflow with typed tools and a human approval step", "Model card covering data, performance, limits and intended use", "Security and privacy review", "Deployed demo with monitoring notes", "Live defense"],
      },
    ],
    tools: [
      { family: "Core", items: ["Python", "Jupyter or Google Colab", "NumPy", "pandas", "scikit-learn", "Scholaris Cloud Lab"] },
      { family: "Deep learning", items: ["PyTorch", "TensorFlow/Keras", "A model hub with parameter-efficient fine-tuning"] },
      { family: "GenAI and agents", items: ["LLM APIs through a provider-neutral client", "A vector database", "A graph orchestration framework (version pinned at cohort start)", "MCP SDK"] },
      { family: "Operations", items: [`An evaluation and tracing tool (${TOOLS_VERIFIED})`, "Docker", "GitHub Actions"] },
    ],
    textbooks: [GADDIS, ...ML_BOOKS],
    dataCards: [
      { key: "orders", name: "Synthetic order-fulfillment dataset (MediGrid sandbox, non-clinical)", purpose: "Block A models and capstone option", rows: 25000, fields: ["order_id", "warehouse", "carrier", "items", "placed_at", "delay_days", "notes"], source: "Generated by Scholaris.", caveats: "No patient or clinical data; logistics fields only." },
      { key: "bookings", name: "Synthetic hotel bookings and guest messages (Haven hospitality sandbox)", purpose: "Block B GenAI labs and capstone option", rows: 12000, fields: ["booking_id", "room_type", "nights", "channel", "cancelled", "message"], source: "Generated by Scholaris; fictional guests.", caveats: "Simplified demand patterns." },
    ],
  },
  {
    price: 3500, start: 70, hours: [8, 10], schedule: "Two live sessions a week (Mon and Wed 19:00 ET) plus labs", capacity: 40,
    badge: "Applied AI: ML, Generative AI & Agents capstone badge (Open Badges 3.0)",
    faqs: [
      { q: "Do I need machine-learning experience?", a: "No. Block A starts from the ML workflow. You do need basic Python." },
      { q: "Which deep learning framework is used?", a: "Both. Each deep learning lab ships in PyTorch and TensorFlow/Keras versions; you pick one." },
    ],
  },
);

/* ------------------------------------------------------------------ #4 */
const P4: ProgramSpec = live(
  {
    code: "#4",
    slug: "ai-agents-software-engineering",
    title: "Certificate in AI Agents for Software Engineering",
    productType: "cohort_program",
    track: "Builder (software engineers)",
    catalogTrack: "Builder",
    codingRequired: true,
    formatKind: "cohort",
    valueStatement: "Fourteen weeks to bring AI coding assistants and agents into the software lifecycle — with tests, reviews and security gates you control.",
    overview: [
      "For working software engineers. Weeks 1–10 cover AI coding assistants, context engineering for codebases, agentic coding workflows, test generation, code review agents, MCP access to repositories, CI/CD agents, secure use in repositories and measuring engineering impact.",
      "Weeks 11–14 are an extended capstone: you build an agentic pipeline that takes an issue to a plan, code, tests and a review — stopped by security and quality gates and approved by a person before merge.",
    ],
    level: "advanced",
    weeks: 14,
    outcomes: [
      "Apply AI coding assistants to design, implementation and refactoring tasks with explicit context and review.",
      "Build agentic coding workflows that plan, edit and test changes in a sandboxed repository.",
      "Generate and evaluate tests with agents, and measure coverage and defect detection.",
      "Implement code review and CI/CD agents with least-privilege access, secrets protection and human approval before merge.",
      "Evaluate the quality, security and productivity impact of AI in an engineering team with defined measures.",
    ],
    audience: ["Software engineers", "Tech leads and engineering managers who still code", "DevOps and platform engineers", "QA and test automation engineers"],
    prerequisites: "Professional or substantial project experience in at least one programming language, Git, pull requests and automated tests. Labs use Python and TypeScript sample repositories.",
    codingRequirement: "Coding required — production-style repositories in Python or TypeScript.",
    blocks: [{ key: "A", title: "Extended block — AI Agents Across the Software Lifecycle (Weeks 11–14 capstone)", weeks: "1–14" }],
    curriculum: [
      w("1", "AI Across the Software Lifecycle", "Where assistants and agents help from planning to operations, and where they create risk.", ["llm", "env"]),
      w("2", "Working With AI Coding Assistants", "Prompting for code, iterative refinement, reading and verifying suggestions.", ["llm"]),
      w("3", "Context Engineering for Codebases", "Repository maps, retrieval over code and docs, and instruction files.", ["vectors", "rag"]),
      w("4", "Agentic Coding Workflows", "Plan–edit–test loops in a sandbox, step limits and checkpoints.", ["agents", "graphs"]),
      w("5", "Test Generation and Test-First Agents", "Agents that write tests first, mutation testing and measuring real coverage.", ["evals"]),
      w("6", "Code Review Agents", "Review agents with checklists, severity levels and calibrated comments.", ["agents", "evals"]),
      w("7", "Tools, MCP and Repository Access", "MCP servers for issues, repositories and docs; scoping what an agent may read and write.", ["mcp"]),
      w("8", "Agents in CI/CD", "Agents in pipelines: triaging failures, proposing fixes and release notes, behind gates.", ["deploy"]),
      w("9", "Secure Use of AI in Repositories", "Secrets, dependency and supply-chain risk, prompt injection through issues and code, licensing and least privilege.", ["guardrails"]),
      w("10", "Measuring Engineering Impact and Governance", "Quality, lead time and defect measures; team policy, human accountability and audit trails.", ["evals", "observe", "responsible"]),
      w("11", "Capstone Sprint 1: Issue to Plan", "Issue intake, planning agent and design review.", ["agents", "graphs"]),
      w("12", "Capstone Sprint 2: Code and Tests", "Coding and test-generation agents in the sandbox repository.", ["agents", "evals"]),
      w("13", "Capstone Sprint 3: Review and Quality Gates", "Review agent, security scans and gate thresholds.", ["guardrails", "evals"]),
      w("14", "Capstone Demo and Defense", "Live run of the pipeline on a new issue and a faculty defense.", ["deploy"], { kind: "capstone" }),
    ],
    projects: [
      { key: "tests", kind: "project", week: "5", name: "Test-Generation Agent", description: "An agent that writes tests for an under-tested module, scored by coverage and mutation results.", skills: ["test generation", "evaluation"] },
      { key: "review", kind: "project", week: "8", name: "Review and CI Triage Agent", description: "A review agent and a CI failure-triage step that comment on pull requests without merge rights.", skills: ["code review", "CI/CD", "least privilege"] },
      {
        key: "capstone", kind: "capstone", week: "14", name: "Issue-to-Review Agentic Coding Pipeline", description: "An agentic pipeline that turns an issue into a plan, code, tests and a review on a sandbox repository, stopped by security and quality gates and approved by a person before merge.", skills: ["agentic coding", "test generation", "code review", "secure CI/CD"],
        requirements: ["Planning, coding, testing and review stages with defined handoffs", "Sandboxed execution with least-privilege repository access", "Generated tests with coverage and mutation results", "Security gates: secrets scan, dependency check and injection tests", "Quality gate thresholds that block merge", "Human approval before merge", "Trace of every agent step and cost per run", "Live run on a new issue and a defense"],
      },
    ],
    tools: [
      { family: "Development", items: ["Git and GitHub", "VS Code", "Python and TypeScript sample repositories", "Docker"] },
      { family: "AI coding", items: ["AI coding assistants and agents (selected at cohort start)", "MCP SDK and MCP servers for repositories and issues"] },
      { family: "Quality and security", items: ["A test runner and a mutation-testing tool", "A secrets scanner", "A dependency scanner", `A tracing tool for agent runs (${TOOLS_VERIFIED})`] },
      { family: "CI/CD", items: ["GitHub Actions or an equivalent CI service"] },
    ],
    dataCards: [{ key: "repos", name: "Synthetic sample repositories and issue backlog", purpose: "Labs and capstone", rows: 400, fields: ["repo", "issue_id", "title", "body", "labels", "seeded_defects"], source: "Written by Scholaris; fictional products.", caveats: "Contains deliberately seeded defects and injection attempts for defensive testing." }],
  },
  {
    price: 2600, start: 77, hours: [7, 10], schedule: "Live session Tue 19:00 ET plus a lab clinic Thu 19:00 ET", capacity: 35,
    badge: "AI Agents for Software Engineering capstone badge (Open Badges 3.0)",
    faqs: [{ q: "Which language do I need?", a: "Any production language; labs ship sample repositories in Python and TypeScript, and the patterns transfer." }],
  },
);

/* ------------------------------------------------------------------ #10 */
const P10: ProgramSpec = live(
  {
    code: "#10",
    slug: "ai-agentic-ai-finance",
    title: "Certificate in AI & Agentic AI for Finance",
    productType: "cohort_program",
    track: "Industry — Finance (no coding required; optional guided notebooks)",
    catalogTrack: "Industry",
    codingRequired: false,
    formatKind: "cohort",
    valueStatement: "Ten weeks to apply AI and agents to finance operations — with model risk management, controls and audit trails at the center.",
    overview: [
      "For finance, risk, compliance and operations professionals. You apply AI and agents to reporting and reconciliation, transaction-monitoring and AML support, credit-risk support, and cited research assistance — always as support for people who keep the decision.",
      "Regulation and risk run through every week: model risk management, explainability, fair lending, privacy, audit trails and controls. All labs use synthetic data; optional guided notebooks are provided for those who want to look under the hood.",
      "Learners do not build agents that give personalized investment advice. Agents in this program prepare, check and document work for accountable staff; they do not make credit, investment or filing decisions.",
    ],
    level: "intermediate",
    weeks: 10,
    outcomes: [
      "Identify finance operations where AI and agents can support staff, and state the decisions that stay with people.",
      "Configure reporting, reconciliation and research agents that cite sources and log every step.",
      "Evaluate transaction-monitoring and credit-risk support models for accuracy, explainability and fairness.",
      "Apply model risk management to AI and agents: inventory, validation, monitoring and documentation.",
      "Design controls, audit trails and governance that meet privacy and sector regulatory expectations.",
    ],
    audience: ["Finance operations and accounting professionals", "Risk, compliance and AML analysts", "Internal audit staff", "Finance technology and transformation leads"],
    prerequisites: "Work experience in finance, risk, compliance or audit. Spreadsheet fluency; no coding required.",
    codingRequirement: "No coding required. Optional guided notebooks are provided.",
    curriculum: [
      w("1", "AI in Financial Operations: Scope and Boundaries", "Where AI and agents help in finance, the decisions that stay with people, and the regulatory landscape.", ["responsible", "strategy"]),
      w("2", "Prompting and Retrieval Over Financial Documents", "Structured extraction from statements and filings; cited answers over policies and procedures.", ["llm", "rag"]),
      w("3", "Reporting and Reconciliation Agents", "Agents that match ledgers, explain breaks and draft reports for review.", ["agents", "automation"]),
      w("4", "Transaction Monitoring and AML Support", "Alert prioritization, case summaries and reducing false positives — analysts keep the decision.", ["agents", "evals"]),
      w("5", "Credit-Risk Support and Fair Lending", "Credit-risk scoring support, explainability, adverse-action reasons and fairness testing.", ["mlfound", "responsible"]),
      w("6", "Research Assistants With Citations", "Agentic retrieval over public filings and internal research with source grading.", ["agenticrag"]),
      w("7", "Model Risk Management for AI and Agents", "Model inventory, validation, challenger testing, monitoring and documentation for generative AI and agents.", ["evals", "responsible"]),
      w("8", "Audit Trails, Controls and Security", "Step logs, segregation of duties, least privilege, prompt injection through documents and change control.", ["guardrails", "observe"]),
      w("9", "Regulation, Privacy and Governance in Finance", "Privacy (GDPR, CCPA, NDPA), an EU AI Act overview, consumer protection and supervisory expectations.", ["responsible"]),
      w("10", "Capstone: Finance Operations Agent", "Present the agent, its audit trail and the model-risk memo.", ["evals"], { kind: "capstone" }),
    ],
    projects: [
      { key: "recon", kind: "project", week: "3", name: "Reconciliation Break Explainer", description: "An agent that matches synthetic ledgers, explains breaks and drafts a review note.", skills: ["reconciliation", "agent configuration"] },
      {
        key: "capstone", kind: "capstone", week: "10", name: "Finance Operations Agent With Audit Trail", description: "A reconciliation or transaction-monitoring support agent on synthetic data, with a complete audit trail and a model-risk memo for the accountable reviewer.", skills: ["finance operations", "audit trails", "model risk management"],
        requirements: ["Clear scope: the agent supports staff and makes no final decision", "Synthetic data only, documented with a data card", "Complete audit trail of every agent step and source", "Accuracy and false-positive measures against a test set", "Explainability and fairness checks where scores are used", "Model-risk memo: purpose, validation, limits and monitoring", "Controls and least-privilege access documented"],
      },
    ],
    tools: [
      { family: "Assistants and agents", items: ["A chat-based LLM assistant", `A low-code agent builder (${TOOLS_VERIFIED})`] },
      { family: "Analysis", items: ["A spreadsheet or BI tool", "Optional guided notebooks in Google Colab"] },
      { family: "Governance", items: ["A model inventory template", "An audit-log viewer in the Scholaris sandbox"] },
    ],
    dataCards: [
      { key: "ledgers", name: "Synthetic general-ledger and bank-statement extracts", purpose: "Reconciliation labs and capstone option", rows: 30000, fields: ["entry_id", "account", "amount", "currency", "posted_at", "counterparty", "seeded_break"], source: "Generated by Scholaris; fictional entities.", caveats: "Seeded breaks for the exercise." },
      { key: "transactions", name: "Synthetic transactions with seeded suspicious patterns", purpose: "Transaction-monitoring labs and capstone option", rows: 50000, fields: ["txn_id", "customer_id", "amount", "channel", "country", "seeded_pattern"], source: "Generated by Scholaris; no real customers.", caveats: "Patterns are simplified and not a detection standard." },
    ],
  },
  {
    price: 1800, start: 84, hours: [4, 6], schedule: "Live session Wed 12:00 ET plus labs", capacity: 45,
    badge: "AI & Agentic AI for Finance badge (Open Badges 3.0)",
    faqs: [{ q: "Will I build an investment advice tool?", a: "No. Learners do not build agents that give personalized investment advice. The program covers operations support with people accountable for every decision." }],
  },
);

/* ------------------------------------------------------------------ #11 */
const P11: ProgramSpec = live(
  {
    code: "#11",
    slug: "ai-agentic-ai-healthcare-operations",
    title: "Certificate in AI & Agentic AI for Healthcare Operations",
    productType: "cohort_program",
    track: "Industry — Healthcare operations (no coding required; optional guided notebooks)",
    catalogTrack: "Industry",
    codingRequired: false,
    formatKind: "cohort",
    valueStatement: "Ten weeks to apply AI and agents to the operational side of healthcare — scheduling, revenue cycle, paperwork and supply — with privacy and governance built in.",
    overview: [
      "For healthcare administrators, revenue-cycle and operations staff, and the analysts and leaders who support them. You apply AI and agents to scheduling, revenue cycle and claims documentation, prior-authorization paperwork, documentation support, supply chain and population analytics for operations.",
      "Learners do not build diagnostic or treatment-decision agents. Clinical AI appears only as something to evaluate, regulate and govern: how evidence is reviewed, how oversight works and what an organization must check before adopting it.",
      "Privacy comes first: HIPAA, de-identification and minimum-necessary access are covered early, and every lab uses non-clinical synthetic data. Optional guided notebooks are provided.",
    ],
    level: "intermediate",
    weeks: 10,
    outcomes: [
      "Identify healthcare operations processes where AI and agents can support staff, and state what must stay with clinicians and administrators.",
      "Configure scheduling, claims-documentation and prior-authorization paperwork agents that cite sources and route exceptions to people.",
      "Apply HIPAA privacy and security safeguards, de-identification and least-privilege access to agent designs.",
      "Analyze operational data for population-level capacity and supply planning using synthetic datasets.",
      "Evaluate a clinical AI product's evidence, regulatory status and governance needs before adoption.",
    ],
    audience: ["Healthcare administrators and practice managers", "Revenue-cycle, coding and billing professionals", "Health system operations and supply-chain staff", "Healthcare analysts and transformation leads"],
    prerequisites: "Work experience in healthcare administration, operations, revenue cycle or analytics. No coding or clinical training required.",
    codingRequirement: "No coding required. Optional guided notebooks are provided.",
    curriculum: [
      w("1", "AI in Healthcare Operations: Scope and Boundaries", "Operational use cases, the line between operations support and clinical decisions, and the regulatory landscape.", ["responsible", "strategy"]),
      w("2", "Privacy First: HIPAA, De-Identification and Synthetic Data", "Privacy and security rules, minimum-necessary access, de-identification and working with synthetic data.", ["responsible", "guardrails"]),
      w("3", "Scheduling and Access Agents", "Agents that manage appointment requests, reminders, waitlists and rescheduling with staff approval.", ["agents", "automation"]),
      w("4", "Revenue Cycle and Claims Documentation Support", "Eligibility checks, claim-documentation completeness, denial categorization and appeal drafts for staff review.", ["agents", "rag"]),
      w("5", "Prior-Authorization Paperwork Support", "Assembling payer forms and supporting documents, tracking status and flagging gaps — staff submit.", ["automation", "rag"]),
      w("6", "Documentation Support and Administrative Assistants", "Summarizing administrative correspondence and policies, with review steps and accuracy checks.", ["llm", "evals"]),
      w("7", "Supply Chain and Order Fulfillment", "Demand signals, stock-outs and order-status agents in the MediGrid sandbox (non-clinical).", ["automation", "mlfound"]),
      w("8", "Population Analytics for Operations", "Capacity, no-show and utilization analytics on synthetic data; fairness across groups.", ["wrangle", "mlfound"]),
      w("9", "Evaluating and Governing Clinical AI", "How clinical AI evidence is reviewed, how regulators oversee AI-enabled medical-device software, bias, monitoring and an adoption checklist.", ["evals", "responsible"]),
      w("10", "Capstone: Healthcare Operations Agent", "Present the agent, its privacy controls and the governance review.", ["evals"], { kind: "capstone" }),
    ],
    projects: [
      { key: "denials", kind: "project", week: "4", name: "Claims-Denial Categorizer", description: "An agent that categorizes synthetic claim denials and drafts appeal checklists for staff review.", skills: ["revenue cycle", "agent configuration"] },
      {
        key: "capstone", kind: "capstone", week: "10", name: "Healthcare Operations Agent With Privacy Controls", description: "A scheduling or claims-documentation support agent on non-clinical synthetic data, with privacy controls and a governance review.", skills: ["healthcare operations", "privacy", "governance"],
        requirements: ["Operational scope only; no diagnostic or treatment decisions", "Non-clinical synthetic data documented with a data card", "Privacy controls: minimum-necessary access, de-identification and access logs", "Human review and exception routing", "Accuracy measures against a test set", "Governance review with owners, monitoring and an incident plan"],
      },
    ],
    tools: [
      { family: "Assistants and agents", items: ["A chat-based LLM assistant", `A low-code agent builder (${TOOLS_VERIFIED})`] },
      { family: "Analysis", items: ["A spreadsheet or BI tool", "Optional guided notebooks in Google Colab"] },
      { family: "Governance", items: ["A privacy impact assessment template", "An AI adoption checklist"] },
    ],
    dataCards: [
      { key: "appointments", name: "Synthetic appointment requests and schedules (non-clinical)", purpose: "Scheduling labs and capstone option", rows: 15000, fields: ["request_id", "clinic", "slot", "status", "no_show", "reschedule_reason"], source: "Generated by Scholaris; fictional clinics and people.", caveats: "Administrative fields only; no clinical information." },
      { key: "claims", name: "Synthetic claims and denial records", purpose: "Revenue-cycle labs and capstone option", rows: 20000, fields: ["claim_id", "payer", "service_category", "amount", "status", "denial_reason"], source: "Generated by Scholaris; fictional payers.", caveats: "Service categories are generic; no clinical detail." },
      { key: "orders", name: "Synthetic pharmacy order events (MediGrid, non-clinical)", purpose: "Supply-chain labs", rows: 20000, fields: ["order_id", "status", "warehouse", "eta"], source: "Generated by Scholaris.", caveats: "Non-clinical status only." },
    ],
  },
  {
    price: 1800, start: 90, hours: [4, 6], schedule: "Live session Thu 12:00 ET plus labs", capacity: 45,
    badge: "AI & Agentic AI for Healthcare Operations badge (Open Badges 3.0)",
    faqs: [{ q: "Will I build clinical decision tools?", a: "No. Learners do not build diagnostic or treatment-decision agents. Clinical AI is covered only as something to evaluate, regulate and govern." }],
  },
);

export const PROGRAMS_3: ProgramSpec[] = [P2, P7, P6, P5, P8, P9, P3, P4, P10, P11];
