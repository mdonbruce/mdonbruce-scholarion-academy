import type { Item, LabSpec, Level, Module, PathwayEdge, Product, QuizQuestion, Track } from "../types";

/**
 * Seed catalog. Content is "by Scholarion Academy" — no partner names, ratings,
 * learner counts, salary figures or credit claims (Integration Spec §15).
 * Program numbers and stacking follow the approved "How the Programs Stack" map.
 */

const CREATED = "2026-09-01T12:00:00.000Z";
const EDU = "Scholarion Academy";

type ProductInput = Omit<Product, "createdAt" | "educator" | "partnerIds" | "language" | "subtitles" | "status" | "faq"> &
  Partial<Pick<Product, "createdAt" | "faq" | "status" | "subtitles">>;

const STANDARD_FAQ = [
  { q: "Is this program accredited or for college credit?", a: "No. Scholarion Academy credentials are non-credit professional training certificates." },
  { q: "Can I audit for free?", a: "Where a course is marked free to audit, you can watch videos and read materials at no cost. Graded work, labs, the AI Tutor and the certificate need a paid option or approved financial aid." },
  { q: "What happens to my progress if I cancel?", a: "You keep access until the end of the period you paid for. Your progress is saved and returns when you subscribe again." },
];

function product(p: ProductInput): Product {
  return {
    educator: EDU,
    partnerIds: [],
    language: "English",
    subtitles: p.subtitles ?? ["English", "Spanish"],
    status: p.status ?? "published",
    createdAt: p.createdAt ?? CREATED,
    faq: p.faq ?? STANDARD_FAQ,
    ...p,
  };
}

/* ------------------------------------------------------------------ */
/* Courses with full module content                                    */
/* ------------------------------------------------------------------ */

export const COURSE_PY = "prd_cop1047c";
export const COURSE_AI = "prd_cai4505c";
export const COURSE_DB = "prd_cgs1540c";
export const COURSE_AGENTIC = "prd_agentic_foundations";
export const CERT_PY = "prd_cert_python";

const courses: Product[] = [
  product({
    id: COURSE_PY,
    slug: "python-programming-cop1047c",
    code: "COP1047C",
    type: "course",
    title: "Python Programming",
    tagline: "Build. Practice. Solve Real Problems.",
    description:
      "This course introduces Python programming through real-world scenarios, hands-on labs and practical projects. You will build foundational programming skills and apply them to authentic problems, finishing with a healthcare data analysis capstone.",
    level: "Beginner",
    track: "Core",
    durationLabel: "10 modules · ~10 weeks",
    hours: 60,
    skills: ["Python", "Functions", "Recursion", "File I/O", "Data structures", "Object-oriented programming", "Debugging"],
    roles: ["Software Engineer", "Data Analyst", "AI Developer"],
    whatYoullLearn: [
      "Write, run and debug Python programs from scratch",
      "Break problems into reusable functions and modules",
      "Read and write files and handle errors safely",
      "Model real data with lists, dictionaries and classes",
    ],
    freeToAudit: true,
    plusEligible: true,
    format: "self_paced",
    courseIds: [COURSE_PY],
    credential: { kind: "certificate", title: "Certificate of Completion — Python Programming", criteria: ["Pass all graded quizzes, labs and projects", "Course grade of 70% or higher", "Submit the capstone"] },
  }),
  product({
    id: COURSE_AI,
    slug: "artificial-intelligence-cai4505c",
    code: "CAI-4505C",
    type: "course",
    title: "Artificial Intelligence",
    tagline: "Search, reasoning, learning and responsible AI.",
    description:
      "A rigorous introduction to artificial intelligence: intelligent agents, search, logic and inference, probabilistic reasoning, machine learning fundamentals and the ethics of deploying AI systems.",
    level: "Intermediate",
    track: "Core",
    durationLabel: "10 modules · ~10 weeks",
    hours: 70,
    skills: ["Artificial intelligence", "Search algorithms", "Propositional logic", "Probabilistic reasoning", "Machine learning", "AI ethics"],
    roles: ["AI Developer", "Machine Learning Engineer"],
    whatYoullLearn: ["Design rational agents for defined environments", "Apply uninformed and informed search", "Reason with propositional logic and Bayes nets", "Evaluate AI systems for fairness and safety"],
    freeToAudit: true,
    plusEligible: true,
    format: "self_paced",
    courseIds: [COURSE_AI],
    credential: { kind: "certificate", title: "Certificate of Completion — Artificial Intelligence", criteria: ["Pass all graded items", "Course grade of 70% or higher"] },
  }),
  product({
    id: COURSE_DB,
    slug: "database-concepts-design-cgs1540c",
    code: "CGS1540C",
    type: "course",
    title: "Database Concepts & Design",
    tagline: "Model data well, query it with confidence.",
    description: "Relational modeling, normalization, SQL and the design decisions behind reliable databases, practiced on realistic business datasets.",
    level: "Beginner",
    track: "Core",
    durationLabel: "10 modules · ~10 weeks",
    hours: 55,
    skills: ["SQL", "Relational databases", "ER modeling", "Normalization", "Database design"],
    roles: ["Data Analyst", "Software Engineer"],
    whatYoullLearn: ["Draw entity-relationship diagrams for real requirements", "Normalize schemas to third normal form", "Write SELECT, JOIN and aggregate queries", "Plan indexes and transactions"],
    freeToAudit: true,
    plusEligible: true,
    format: "self_paced",
    courseIds: [COURSE_DB],
    credential: { kind: "certificate", title: "Certificate of Completion — Database Concepts & Design", criteria: ["Pass all graded items", "Course grade of 70% or higher"] },
  }),
  product({
    id: COURSE_AGENTIC,
    slug: "agentic-ai-foundations",
    type: "course",
    title: "Agentic AI Foundations",
    tagline: "What AI agents are, how they plan, and how to use them safely.",
    description:
      "A short beginner course on agentic AI: how large language models (LLMs) become agents with tools, memory and planning, where they fail, and how to keep a human in control.",
    level: "Beginner",
    track: "Foundation",
    durationLabel: "4 modules · ~6 hours",
    hours: 6,
    skills: ["Agentic AI", "Large language models", "Tool use", "AI safety"],
    roles: ["AI Developer", "Product Manager", "Business Leader"],
    whatYoullLearn: ["Explain how an agent loop works", "Describe tools, memory and planning", "Spot common agent failure modes", "Design human-in-the-loop checkpoints"],
    freeToAudit: true,
    plusEligible: true,
    format: "self_paced",
    courseIds: [COURSE_AGENTIC],
    credential: { kind: "badge", title: "Agentic AI Foundations badge", criteria: ["Pass the four module quizzes"] },
    createdAt: "2026-09-20T12:00:00.000Z",
  }),
];

/* ------------------------------------------------------------------ */
/* Programs (stacking map) and other products                          */
/* ------------------------------------------------------------------ */

function program(
  no: string,
  title: string,
  level: Level,
  track: Track,
  weeks: number,
  bullets: string[],
  opts: Partial<ProductInput> = {},
): Product {
  const live = opts.format === "live";
  return product({
    id: `prd_p${no.replace(/[^0-9a-z]/gi, "").toLowerCase()}`,
    slug: `${no.replace(/[^0-9a-z]/gi, "").toLowerCase()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`,
    code: no,
    type: live ? "live_program" : "professional_certificate",
    title,
    tagline: bullets[0],
    description: `${title} is a ${weeks}-week ${level.toLowerCase()} program on the ${track} path of the Scholaris AI Academy stack. ${bullets.join(". ")}.`,
    level,
    track,
    durationLabel: live ? `${weeks} ${opts.livePlan?.schedule.includes("weekend") ? "weekends" : "weeks"} · live` : `${weeks} weeks`,
    hours: opts.hours ?? weeks * 6,
    skills: opts.skills ?? [],
    roles: opts.roles ?? [],
    whatYoullLearn: bullets,
    freeToAudit: false,
    plusEligible: !live,
    format: live ? "live" : "self_paced",
    courseIds: [],
    credential: { kind: "certificate", title: `Professional Certificate — ${title}`, criteria: ["Complete every course and the capstone", live ? "Attend at least 80% of live session minutes" : "Program grade of 70% or higher"] },
    ...opts,
  });
}

const programs: Product[] = [
  product({
    id: CERT_PY,
    slug: "python-programming-certificate",
    code: "PY-CERT",
    type: "professional_certificate",
    title: "Python Programming Certificate Program",
    tagline: "From first program to a portfolio-ready capstone.",
    description: "A job-role program built on COP1047C Python Programming, finishing with an applied healthcare data analysis capstone you can show employers.",
    level: "Beginner",
    track: "Core",
    durationLabel: "~10 weeks",
    hours: 60,
    skills: ["Python", "Problem solving", "Data handling", "Testing"],
    roles: ["Software Engineer", "Data Analyst"],
    whatYoullLearn: ["Program confidently in Python", "Build and test modular code", "Work with real files and data", "Ship a capstone project"],
    freeToAudit: false,
    plusEligible: true,
    format: "self_paced",
    courseIds: [COURSE_PY],
    credential: { kind: "certificate", title: "Certificate of Completion — Python Programming Certificate Program", criteria: ["Complete COP1047C with 70% or higher", "Submit the capstone"] },
  }),
  program("#21", "Certificate in Data Science with Python", "Foundational", "Foundation", 8, ["Pandas, statistics and data visualization", "Intro to machine learning and data analysis workflows"], { skills: ["Pandas", "Statistics", "Data visualization", "Machine learning"], roles: ["Data Analyst", "Data Scientist"] }),
  program("#18", "Certificate in Artificial Intelligence with Python", "Foundational", "Foundation", 8, ["Search, machine learning, deep learning, NLP and computer vision", "Builds on #21"], { skills: ["Deep learning", "NLP", "Computer vision", "Search"], roles: ["AI Developer"] }),
  program("#19", "Certificate in LLM Prompt Engineering", "Foundational", "Foundation", 5, ["Prompt patterns, evaluation and safety", "LLM applications"], { skills: ["Prompt engineering", "Large language models", "LLM evaluation"], roles: ["AI Developer", "Product Manager"] }),
  program("#16", "Certificate in Agentic AI for Developers", "Intermediate", "Builder", 5, ["LLM apps, RAG, tool agents and MCP", "On-ramp to #15"], { hours: 30, durationLabel: "5 weekends (30 hrs)", skills: ["Agentic AI", "RAG", "Tool use", "MCP", "Large language models"], roles: ["AI Developer", "Software Engineer"] }),
  program("#26", "Agentic AI Systems Design (7-Week Live Intensive)", "Advanced", "Builder", 7, ["Agents, retrieval and multi-agent systems", "Advanced system design and deployment"], {
    format: "live",
    hours: 42,
    skills: ["Agentic AI", "Multi-agent systems", "System design", "Retrieval"],
    roles: ["AI Engineer", "Solutions Architect"],
    livePlan: { weeks: 7, sessionHours: 2, segmentMinutes: 40, schedule: "Saturdays, 2:00–4:00 PM ET (three 40-minute segments)" },
  }),
  program("#22", "Advanced Certificate in Data Engineering with Generative AI", "Advanced", "Builder", 12, ["Pipelines, warehouses and lakehouse", "RAG data platforms"], { skills: ["Data engineering", "Data pipelines", "Lakehouse", "RAG"], roles: ["Data Engineer"] }),
  program("#17", "Generative AI Professional Pathway", "Intermediate", "Advanced", 24, ["Includes #21, #18, #19, GenAI Apps and #16", "Multi-course pathway"], { type: "bundle", durationLabel: "~24 weeks", skills: ["Generative AI", "Agentic AI", "Python"], roles: ["AI Developer"] }),
  program("#15", "Advanced Certificate in Agentic AI Engineering — Weekend Intensive", "Advanced", "Advanced", 10, ["10 weekends, 60 live hours", "Production and MLOps depth", "Flagship agent engineering program"], {
    format: "live",
    hours: 60,
    skills: ["Agentic AI", "MLOps", "Observability", "Production AI"],
    roles: ["AI Engineer"],
    livePlan: { weeks: 10, sessionHours: 6, segmentMinutes: 40, schedule: "10 weekends, Saturday and Sunday blocks (40-minute segments)" },
  }),
  program("#24", "Extended Professional Program in Generative & Agentic AI", "Advanced", "Advanced", 32, ["Combines #21, #18, #19 and #15 content", "Industry capstone"], { type: "bundle", durationLabel: "~32 weeks", skills: ["Generative AI", "Agentic AI", "MLOps"], roles: ["AI Engineer"] }),
  program("#20", "Certificate in Generative AI for Business Transformation", "Intermediate", "Advanced", 6, ["No code, business use cases", "Credit toward #13"], { skills: ["Generative AI", "AI strategy", "Business transformation"], roles: ["Business Leader", "Product Manager"] }),
  program("#23", "Advanced Certificate in AI Product Management", "Advanced", "Advanced", 10, ["Product discovery, PRDs and metrics", "Launch and lifecycle"], { skills: ["AI product management", "Product discovery", "Metrics"], roles: ["Product Manager"] }),
  program("#25", "Extended Professional Certificate in Applied AI for Business Leaders", "Advanced", "Leadership", 24, ["Built on #13 (Courses 1–2) plus a Leadership Practicum", "Strategic implementation project"], { skills: ["AI leadership", "AI governance", "Change management"], roles: ["Business Leader"] }),
  program("GC-AAGE", "Graduate Certificate in Agentic AI Engineering (legacy)", "Advanced", "Advanced", 16, ["Legacy program, replaced by #15 and #24"], { status: "legacy", skills: ["Agentic AI"], roles: ["AI Engineer"] }),
];

const guided: Product[] = [
  product({
    id: "prd_gp_rag",
    slug: "guided-project-rag-chatbot",
    type: "guided_project",
    title: "Build a Retrieval Chatbot over Course Notes",
    tagline: "A 2-hour hands-on build in the Cloud Lab.",
    description: "Split notes into chunks, rank them by keyword overlap and answer questions with citations — the core idea behind retrieval-augmented generation (RAG), built step by step in Python.",
    level: "Intermediate",
    track: "Builder",
    durationLabel: "2 hours",
    hours: 2,
    skills: ["RAG", "Python", "Retrieval"],
    roles: ["AI Developer"],
    whatYoullLearn: ["Chunk documents", "Rank passages for a query", "Return answers with citations"],
    freeToAudit: false,
    plusEligible: true,
    format: "self_paced",
    courseIds: ["prd_gp_rag"],
    credential: { kind: "badge", title: "Guided Project: Retrieval Chatbot", criteria: ["Pass the lab autograder"] },
    createdAt: "2026-09-25T12:00:00.000Z",
  }),
  product({
    id: "prd_gp_patient",
    slug: "guided-project-patient-records-cli",
    type: "guided_project",
    title: "Python Patient Records CLI",
    tagline: "Build a menu-driven records tool in 90 minutes.",
    description: "Use functions, dictionaries and input validation to build a small command-line patient records system.",
    level: "Beginner",
    track: "Core",
    durationLabel: "1.5 hours",
    hours: 1.5,
    skills: ["Python", "Functions", "Dictionaries"],
    roles: ["Software Engineer"],
    whatYoullLearn: ["Structure a CLI program", "Validate input", "Store records in dictionaries"],
    freeToAudit: false,
    plusEligible: true,
    format: "self_paced",
    courseIds: ["prd_gp_patient"],
    credential: { kind: "badge", title: "Guided Project: Patient Records CLI", criteria: ["Pass the lab autograder"] },
  }),
];

const degree: Product = product({
  id: "prd_degree_placeholder",
  slug: "degrees",
  type: "degree",
  title: "Degrees (planned)",
  tagline: "Hidden until an accredited degree-granting partner signs an agreement.",
  description: "Placeholder kept in code so the route and data model exist. Never rendered.",
  level: "Advanced",
  durationLabel: "—",
  hours: 0,
  skills: [],
  roles: [],
  whatYoullLearn: [],
  freeToAudit: false,
  plusEligible: false,
  format: "self_paced",
  courseIds: [],
  status: "hidden",
  credential: { kind: "certificate", title: "—", criteria: [] },
});

export const PRODUCTS: Product[] = [...courses, ...programs, ...guided, degree];

const P = (code: string) => `prd_p${code.replace(/[^0-9a-z]/gi, "").toLowerCase()}`;
export const PATHWAY: PathwayEdge[] = [
  { from: P("#21"), to: P("#18"), type: "stacks_into" },
  { from: P("#18"), to: P("#19"), type: "stacks_into" },
  { from: P("#16"), to: P("#26"), type: "stacks_into" },
  { from: P("#26"), to: P("#22"), type: "stacks_into" },
  { from: P("#16"), to: P("#15"), type: "credit_toward", note: "Credit: Modules 1–6" },
  { from: P("#26"), to: P("#15"), type: "waives", note: "Waives weekends 3–5" },
  { from: P("#17"), to: P("#15"), type: "stacks_into" },
  { from: P("#15"), to: P("GC-AAGE"), type: "stacks_into", note: "Legacy program" },
  { from: P("#20"), to: P("#25"), type: "stacks_into" },
  { from: P("#23"), to: P("#25"), type: "stacks_into" },
  { from: P("#17"), to: P("#21"), type: "includes" },
  { from: P("#17"), to: P("#18"), type: "includes" },
  { from: P("#17"), to: P("#19"), type: "includes" },
  { from: P("#17"), to: P("#16"), type: "includes" },
  { from: P("#24"), to: P("#21"), type: "includes" },
  { from: P("#24"), to: P("#18"), type: "includes" },
  { from: P("#24"), to: P("#19"), type: "includes" },
  { from: P("#24"), to: P("#15"), type: "includes" },
  { from: COURSE_AGENTIC, to: P("#16"), type: "prerequisite", note: "Recommended first step" },
  { from: COURSE_PY, to: P("#21"), type: "stacks_into" },
  { from: CERT_PY, to: P("#21"), type: "stacks_into" },
];

/* ------------------------------------------------------------------ */
/* Modules and items                                                   */
/* ------------------------------------------------------------------ */

interface ModuleDef {
  title: string;
  overview: string;
  topics: string[];
  scenario?: string;
  quiz?: Omit<QuizQuestion, "id">[];
  lab?: { title: string; instructions: string[]; starter: string; tests: { name: string; code: string; points: number }[] };
  project?: { title: string; scenario: string; deliverables: string[] };
}

const PY_MODULES: ModuleDef[] = [
  {
    title: "Introduction to Computers and Programming",
    overview: "How computers store data and run programs, and how to write and run your first Python program.",
    topics: ["Hardware and software", "How a program runs", "Installing Python", "Your first program"],
    quiz: [
      { prompt: "What does the Python interpreter do?", options: [{ id: "a", text: "Translates and runs Python statements" }, { id: "b", text: "Stores files on disk" }, { id: "c", text: "Draws the screen" }, { id: "d", text: "Connects to the internet" }], answer: "a", explanation: "The interpreter reads Python statements and executes them." },
      { prompt: "Which of these is an example of software?", options: [{ id: "a", text: "CPU" }, { id: "b", text: "RAM" }, { id: "c", text: "An operating system" }, { id: "d", text: "A keyboard" }], answer: "c", explanation: "Operating systems are programs: software." },
      { prompt: "What is printed by print('Hi' + '!')?", options: [{ id: "a", text: "Hi !" }, { id: "b", text: "Hi!" }, { id: "c", text: "'Hi!'" }, { id: "d", text: "An error" }], answer: "b", explanation: "+ joins the two strings with no space." },
    ],
    lab: {
      title: "Mini Lab 1: Hello, Scholarion",
      instructions: ["Create a function greet(name) that returns the text Hello, <name>!", "Do not print inside the function — return the string", "Test it with your own name"],
      starter: "# TODO: Create a function that returns a greeting\ndef greet(name):\n    # your code here\n    pass\n\nprint(greet(\"Amara\"))\n",
      tests: [
        { name: "greet returns the greeting", code: "assert greet('Amara') == 'Hello, Amara!'", points: 10 },
        { name: "greet works for any name", code: "assert greet('Tunde') == 'Hello, Tunde!'", points: 10 },
      ],
    },
  },
  {
    title: "Input, Processing and Output",
    overview: "Variables, data types, arithmetic and formatted output — the input–process–output pattern.",
    topics: ["Variables and assignment", "Numeric types", "Arithmetic operators", "f-strings"],
    quiz: [
      { prompt: "What is the result of 7 // 2?", options: [{ id: "a", text: "3.5" }, { id: "b", text: "3" }, { id: "c", text: "4" }, { id: "d", text: "1" }], answer: "b", explanation: "// is floor division." },
      { prompt: "Which type does input() return?", options: [{ id: "a", text: "int" }, { id: "b", text: "float" }, { id: "c", text: "str" }, { id: "d", text: "bool" }], answer: "c", explanation: "input() always returns a string." },
      { prompt: "What does f'{3.14159:.2f}' produce?", options: [{ id: "a", text: "3.14" }, { id: "b", text: "3.1" }, { id: "c", text: "3.14159" }, { id: "d", text: "3" }], answer: "a", explanation: ".2f formats to two decimal places." },
    ],
    lab: {
      title: "Mini Lab 1: Room Area Calculator",
      instructions: ["Write area(width, height) returning width × height", "Write format_area(value) returning the area with two decimals and ' sq ft'"],
      starter: "def area(width, height):\n    # TODO\n    pass\n\ndef format_area(value):\n    # TODO: return e.g. '12.50 sq ft'\n    pass\n",
      tests: [
        { name: "area multiplies", code: "assert area(3, 4) == 12", points: 10 },
        { name: "format_area formats", code: "assert format_area(12.5) == '12.50 sq ft'", points: 10 },
      ],
    },
  },
  {
    title: "Decision Structures and Boolean Logic",
    overview: "if, elif and else, comparison and logical operators, and nested decisions.",
    topics: ["if / elif / else", "Comparison operators", "Logical operators", "Nested decisions"],
    quiz: [
      { prompt: "Which operator means 'and' in Python?", options: [{ id: "a", text: "&&" }, { id: "b", text: "and" }, { id: "c", text: "&" }, { id: "d", text: "AND" }], answer: "b", explanation: "Python uses the keyword and." },
      { prompt: "What is not (3 > 2)?", options: [{ id: "a", text: "True" }, { id: "b", text: "False" }, { id: "c", text: "None" }, { id: "d", text: "Error" }], answer: "b", explanation: "3 > 2 is True, so not True is False." },
      { prompt: "Which branch runs when no earlier condition is True?", options: [{ id: "a", text: "elif" }, { id: "b", text: "else" }, { id: "c", text: "if" }, { id: "d", text: "pass" }], answer: "b", explanation: "else catches everything not matched." },
    ],
    lab: {
      title: "Mini Lab 1: Letter Grades",
      instructions: ["Write letter_grade(score): 90+ A, 80+ B, 70+ C, 60+ D, otherwise F"],
      starter: "def letter_grade(score):\n    # TODO\n    pass\n",
      tests: [
        { name: "A and B boundaries", code: "assert letter_grade(90) == 'A' and letter_grade(89) == 'B'", points: 10 },
        { name: "F below 60", code: "assert letter_grade(59) == 'F' and letter_grade(70) == 'C'", points: 10 },
      ],
    },
    project: { title: "Mini Project: Clinic Triage Rules", scenario: "A clinic front desk needs a small program that suggests a triage level from a patient's temperature and pain score.", deliverables: ["A function triage(temp_f, pain) that returns 'urgent', 'soon' or 'routine'", "At least five test cases you wrote yourself", "A short explanation of your rules (PDF or text)"] },
  },
  {
    title: "Repetition Structures",
    overview: "while and for loops, ranges, accumulators and input validation loops.",
    topics: ["while loops", "for loops and range()", "Accumulators", "Validation loops"],
    quiz: [
      { prompt: "How many times does for i in range(2, 6) run?", options: [{ id: "a", text: "6" }, { id: "b", text: "4" }, { id: "c", text: "5" }, { id: "d", text: "3" }], answer: "b", explanation: "range(2, 6) gives 2, 3, 4, 5." },
      { prompt: "What does break do inside a loop?", options: [{ id: "a", text: "Skips to the next iteration" }, { id: "b", text: "Exits the loop" }, { id: "c", text: "Restarts the loop" }, { id: "d", text: "Ends the program" }], answer: "b", explanation: "break exits the nearest loop." },
      { prompt: "An accumulator variable is usually initialised to…", options: [{ id: "a", text: "0 (for sums)" }, { id: "b", text: "None" }, { id: "c", text: "The loop counter" }, { id: "d", text: "input()" }], answer: "a", explanation: "Sums start at 0 before the loop." },
    ],
    lab: {
      title: "Mini Lab 1: Running Totals",
      instructions: ["Write sum_to(n) that returns 1 + 2 + … + n using a loop", "Return 0 when n is less than 1"],
      starter: "def sum_to(n):\n    total = 0\n    # TODO: loop and accumulate\n    return total\n",
      tests: [
        { name: "sum_to(10) is 55", code: "assert sum_to(10) == 55", points: 10 },
        { name: "sum_to(0) is 0", code: "assert sum_to(0) == 0", points: 10 },
      ],
    },
  },
  {
    title: "Functions, Modular Programming and Recursion",
    overview:
      "This module teaches you how to create and use functions to write modular, reusable code. You will also learn recursion and see how it applies to real-world problem solving.",
    topics: ["Defining and calling functions", "Parameters and return values", "Modular programming and code reuse", "Recursion and recursive problem solving", "Real-world applications in healthcare and business"],
    scenario:
      "You've joined a small healthcare tech team that needs a Python program to process patient data. To make the system maintainable, you'll use functions and modular code, and apply recursion to handle nested data structures such as patient records stored in folders.",
    quiz: [
      { prompt: "Which of the following best describes the purpose of a function in Python?", options: [{ id: "a", text: "To store data permanently" }, { id: "b", text: "To perform a reusable set of instructions" }, { id: "c", text: "To create a loop automatically" }, { id: "d", text: "To handle errors in a program" }], answer: "b", explanation: "A function packages instructions you can call again and again." },
      { prompt: "What does a function return if it has no return statement?", options: [{ id: "a", text: "0" }, { id: "b", text: "An empty string" }, { id: "c", text: "None" }, { id: "d", text: "An error" }], answer: "c", explanation: "Python functions return None by default." },
      { prompt: "In def add(a, b):, what are a and b?", options: [{ id: "a", text: "Arguments" }, { id: "b", text: "Parameters" }, { id: "c", text: "Return values" }, { id: "d", text: "Globals" }], answer: "b", explanation: "Names in the definition are parameters; values passed in a call are arguments." },
      { prompt: "Every correct recursive function needs…", options: [{ id: "a", text: "A loop" }, { id: "b", text: "A base case" }, { id: "c", text: "A global variable" }, { id: "d", text: "Two parameters" }], answer: "b", explanation: "The base case stops the recursion." },
      { prompt: "What is factorial(0) by convention?", options: [{ id: "a", text: "0" }, { id: "b", text: "1" }, { id: "c", text: "Undefined" }, { id: "d", text: "-1" }], answer: "b", explanation: "0! is defined as 1 — a common base case." },
      { prompt: "A variable created inside a function is…", options: [{ id: "a", text: "Global" }, { id: "b", text: "Local to that function" }, { id: "c", text: "Shared by every function" }, { id: "d", text: "Constant" }], answer: "b", explanation: "It exists only while the function runs." },
      { prompt: "Why split a program into modules?", options: [{ id: "a", text: "It runs faster" }, { id: "b", text: "To reuse and maintain code more easily" }, { id: "c", text: "Python requires it" }, { id: "d", text: "To avoid functions" }], answer: "b", explanation: "Modules group related functions for reuse and maintenance." },
      { prompt: "What happens if a recursive function never reaches its base case?", options: [{ id: "a", text: "It returns None" }, { id: "b", text: "It raises RecursionError" }, { id: "c", text: "It loops forever silently" }, { id: "d", text: "It returns 0" }], answer: "b", explanation: "Python stops deep recursion with RecursionError." },
    ],
    lab: {
      title: "Mini Lab 2: Working with Functions",
      instructions: ["Create a function to calculate patient age", "Create a function to format patient names as 'Last, First'", "Test your functions with sample data", "Submit your completed code"],
      starter:
        "# TODO: Create a function to calculate age\ndef calculate_age(birth_year, current_year):\n    # your code here\n    pass\n\n# TODO: Create a function to format name\ndef format_name(first, last):\n    # your code here\n    pass\n\n# Test your functions\nprint(calculate_age(2000, 2026))\nprint(format_name(\"Amara\", \"Chukwu\"))\n",
      tests: [
        { name: "calculate_age subtracts years", code: "assert calculate_age(2000, 2026) == 26", points: 5 },
        { name: "calculate_age handles same year", code: "assert calculate_age(2026, 2026) == 0", points: 5 },
        { name: "format_name returns 'Last, First'", code: "assert format_name('Amara', 'Chukwu') == 'Chukwu, Amara'", points: 5 },
        { name: "format_name trims and capitalises", code: "assert format_name(' tunde ', 'bello') == 'Bello, Tunde'", points: 5 },
      ],
    },
    project: {
      title: "Mini Project: Patient Records System",
      scenario: "You are part of a healthcare IT team building a simple patient records system. Use functions to manage patient data, including adding new records, calculating ages, formatting names and searching for a patient.",
      deliverables: ["Create a Python program with at least 4 functions", "Use a list or dictionary to store patient records", "Include a search function", "Include input validation", "Submit your .py file and a short report (PDF)"],
    },
  },
  {
    title: "Files and Exceptions",
    overview: "Reading and writing text files, processing records and handling errors with try/except.",
    topics: ["Opening and closing files", "Reading records", "Writing output files", "try / except / finally"],
    quiz: [
      { prompt: "Which mode opens a file for appending?", options: [{ id: "a", text: "'r'" }, { id: "b", text: "'w'" }, { id: "c", text: "'a'" }, { id: "d", text: "'x'" }], answer: "c", explanation: "'a' appends to the end." },
      { prompt: "Which exception does int('abc') raise?", options: [{ id: "a", text: "TypeError" }, { id: "b", text: "ValueError" }, { id: "c", text: "KeyError" }, { id: "d", text: "IOError" }], answer: "b", explanation: "The string isn't a valid integer value." },
      { prompt: "What does a with statement guarantee for files?", options: [{ id: "a", text: "Faster reads" }, { id: "b", text: "The file is closed afterwards" }, { id: "c", text: "Encryption" }, { id: "d", text: "No exceptions" }], answer: "b", explanation: "The context manager closes the file." },
    ],
    lab: {
      title: "Mini Lab 1: Safe Conversions",
      instructions: ["Write safe_int(text, default=0) that returns int(text) or default when conversion fails"],
      starter: "def safe_int(text, default=0):\n    # TODO: use try/except\n    pass\n",
      tests: [
        { name: "converts numbers", code: "assert safe_int('42') == 42", points: 10 },
        { name: "falls back on bad input", code: "assert safe_int('abc') == 0 and safe_int('x', -1) == -1", points: 10 },
      ],
    },
  },
  {
    title: "Lists and Tuples",
    overview: "Sequences, slicing, list methods and processing collections of records.",
    topics: ["Creating lists", "Slicing", "List methods", "Tuples"],
    quiz: [
      { prompt: "What is [1, 2, 3, 4][1:3]?", options: [{ id: "a", text: "[1, 2]" }, { id: "b", text: "[2, 3]" }, { id: "c", text: "[2, 3, 4]" }, { id: "d", text: "[1, 2, 3]" }], answer: "b", explanation: "The end index is exclusive." },
      { prompt: "Tuples are…", options: [{ id: "a", text: "Mutable" }, { id: "b", text: "Immutable" }, { id: "c", text: "Dictionaries" }, { id: "d", text: "Always empty" }], answer: "b", explanation: "Tuples can't be changed after creation." },
      { prompt: "Which method adds one item to the end of a list?", options: [{ id: "a", text: "add()" }, { id: "b", text: "append()" }, { id: "c", text: "insert_end()" }, { id: "d", text: "push()" }], answer: "b", explanation: "append() adds one item." },
    ],
    lab: {
      title: "Mini Lab 1: Average Wait Time",
      instructions: ["Write average(values) returning the mean rounded to 1 decimal, or 0 for an empty list"],
      starter: "def average(values):\n    # TODO\n    pass\n",
      tests: [
        { name: "mean of values", code: "assert average([10, 20, 25]) == 18.3", points: 10 },
        { name: "empty list", code: "assert average([]) == 0", points: 10 },
      ],
    },
  },
  {
    title: "More About Strings",
    overview: "String methods, searching, slicing and cleaning messy text data.",
    topics: ["String methods", "Searching and replacing", "Splitting and joining", "Cleaning text"],
    quiz: [
      { prompt: "What does 'a,b,c'.split(',') return?", options: [{ id: "a", text: "'abc'" }, { id: "b", text: "['a', 'b', 'c']" }, { id: "c", text: "('a','b','c')" }, { id: "d", text: "3" }], answer: "b", explanation: "split returns a list." },
      { prompt: "Strings in Python are…", options: [{ id: "a", text: "Mutable" }, { id: "b", text: "Immutable" }, { id: "c", text: "Lists" }, { id: "d", text: "Numbers" }], answer: "b", explanation: "String methods return new strings." },
      { prompt: "Which method removes surrounding whitespace?", options: [{ id: "a", text: "trim()" }, { id: "b", text: "strip()" }, { id: "c", text: "clean()" }, { id: "d", text: "cut()" }], answer: "b", explanation: "strip() removes leading and trailing whitespace." },
    ],
    lab: {
      title: "Mini Lab 1: Initials",
      instructions: ["Write initials(full_name) returning upper-case initials, e.g. 'amara n chukwu' → 'ANC'"],
      starter: "def initials(full_name):\n    # TODO\n    pass\n",
      tests: [
        { name: "three names", code: "assert initials('amara n chukwu') == 'ANC'", points: 10 },
        { name: "extra spaces", code: "assert initials('  tunde   bello ') == 'TB'", points: 10 },
      ],
    },
    project: { title: "Mini Project: Clean the Intake Log", scenario: "An intake log has inconsistent capitalisation, stray spaces and mixed date formats.", deliverables: ["Functions that clean names and normalise dates", "A cleaned output file", "A short report of the rules you applied"] },
  },
  {
    title: "Dictionaries and Sets",
    overview: "Key–value data, counting with dictionaries and set operations.",
    topics: ["Creating dictionaries", "Iterating keys and values", "Counting patterns", "Sets"],
    quiz: [
      { prompt: "What does d.get('x', 0) return when 'x' is missing?", options: [{ id: "a", text: "None" }, { id: "b", text: "0" }, { id: "c", text: "KeyError" }, { id: "d", text: "'x'" }], answer: "b", explanation: "get returns the default." },
      { prompt: "Sets automatically…", options: [{ id: "a", text: "Sort items" }, { id: "b", text: "Remove duplicates" }, { id: "c", text: "Keep insertion counts" }, { id: "d", text: "Allow indexing" }], answer: "b", explanation: "A set holds unique items." },
      { prompt: "Dictionary keys must be…", options: [{ id: "a", text: "Strings" }, { id: "b", text: "Hashable (immutable)" }, { id: "c", text: "Numbers" }, { id: "d", text: "Lists" }], answer: "b", explanation: "Keys must be hashable." },
    ],
    lab: {
      title: "Mini Lab 1: Word Counts",
      instructions: ["Write word_counts(text) returning a dict of lower-case word → count"],
      starter: "def word_counts(text):\n    counts = {}\n    # TODO\n    return counts\n",
      tests: [
        { name: "counts words", code: "assert word_counts('Flu flu cold') == {'flu': 2, 'cold': 1}", points: 10 },
        { name: "empty text", code: "assert word_counts('') == {}", points: 10 },
      ],
    },
  },
  {
    title: "Classes and Object-Oriented Programming",
    overview: "Classes, objects, attributes, methods and the capstone project.",
    topics: ["Classes and objects", "__init__ and attributes", "Methods", "Encapsulation"],
    quiz: [
      { prompt: "What is self in a method?", options: [{ id: "a", text: "The class" }, { id: "b", text: "The current object" }, { id: "c", text: "A keyword for globals" }, { id: "d", text: "The module" }], answer: "b", explanation: "self refers to the instance." },
      { prompt: "Which method initialises a new object?", options: [{ id: "a", text: "__new__ only" }, { id: "b", text: "__init__" }, { id: "c", text: "init()" }, { id: "d", text: "create()" }], answer: "b", explanation: "__init__ sets up attributes." },
      { prompt: "An object is…", options: [{ id: "a", text: "A blueprint" }, { id: "b", text: "An instance of a class" }, { id: "c", text: "A module" }, { id: "d", text: "A function" }], answer: "b", explanation: "The class is the blueprint." },
    ],
    lab: {
      title: "Mini Lab 1: Patient Class",
      instructions: ["Create class Patient(first, last, birth_year)", "Add full_name() returning 'First Last'", "Add age(current_year)"],
      starter: "class Patient:\n    def __init__(self, first, last, birth_year):\n        # TODO\n        pass\n",
      tests: [
        { name: "full_name", code: "assert Patient('Amara', 'Chukwu', 2000).full_name() == 'Amara Chukwu'", points: 10 },
        { name: "age", code: "assert Patient('Amara', 'Chukwu', 2000).age(2026) == 26", points: 10 },
      ],
    },
  },
];

const AI_MODULES: { title: string; topics: string[] }[] = [
  { title: "Introduction to AI and Intelligent Agents", topics: ["What is AI", "Agents and environments", "Rationality", "PEAS"] },
  { title: "Problem Solving by Search", topics: ["State spaces", "Breadth-first search", "Depth-first search", "Uniform-cost search"] },
  { title: "Informed Search and Heuristics", topics: ["Greedy best-first", "A* search", "Admissible heuristics", "Local search"] },
  { title: "Adversarial Search and Games", topics: ["Minimax", "Alpha-beta pruning", "Evaluation functions", "Monte Carlo tree search"] },
  { title: "Constraint Satisfaction Problems", topics: ["Variables and domains", "Backtracking", "Arc consistency", "Scheduling problems"] },
  { title: "Logical Agents and AI Ethical Considerations", topics: ["Propositional logic", "Inference and entailment", "Knowledge-based agents", "Ethics of automated reasoning"] },
  { title: "Probabilistic Reasoning", topics: ["Probability review", "Bayes' rule", "Bayesian networks", "Inference by enumeration"] },
  { title: "Machine Learning Fundamentals", topics: ["Supervised learning", "Decision trees", "Overfitting", "Evaluation metrics"] },
  { title: "Neural Networks and Deep Learning", topics: ["Perceptrons", "Backpropagation", "Training loops", "Generalisation"] },
  { title: "Responsible and Agentic AI", topics: ["Fairness", "Transparency", "LLM agents", "Human oversight"] },
];

const DB_MODULES: { title: string; topics: string[] }[] = [
  { title: "Database Fundamentals", topics: ["Data vs information", "DBMS roles", "File systems vs databases", "Database users"] },
  { title: "Data Models", topics: ["Entities and attributes", "Relationships", "Business rules", "Model evolution"] },
  { title: "The Relational Model", topics: ["Tables and keys", "Integrity rules", "Relational algebra", "Indexes"] },
  { title: "Entity-Relationship Modeling", topics: ["ER notation", "Cardinality", "Weak entities", "Associative entities"] },
  { title: "Normalization", topics: ["Functional dependencies", "1NF to 3NF", "BCNF", "Denormalization trade-offs"] },
  { title: "SQL Basics", topics: ["SELECT and WHERE", "ORDER BY", "INSERT, UPDATE, DELETE", "Data types"] },
  { title: "Joins and Aggregates", topics: ["INNER and OUTER joins", "GROUP BY", "HAVING", "Subqueries"] },
  { title: "Transactions and Concurrency", topics: ["ACID", "Isolation levels", "Locking", "Recovery"] },
  { title: "Database Design Project", topics: ["Requirements", "Logical design", "Physical design", "Testing"] },
  { title: "Data Security and Administration", topics: ["Access control", "Backups", "Privacy", "Performance tuning"] },
];

const AGENTIC_MODULES: { title: string; topics: string[] }[] = [
  { title: "From Chatbots to Agents", topics: ["Large language models", "The agent loop", "Goals and actions", "Where agents help"] },
  { title: "Tools, Memory and Planning", topics: ["Tool calling", "Short and long-term memory", "Planning", "Retrieval"] },
  { title: "When Agents Fail", topics: ["Hallucination", "Prompt injection", "Runaway loops", "Evaluation"] },
  { title: "Keeping Humans in Control", topics: ["Approval checkpoints", "Logging", "Permissions", "Responsible deployment"] },
];

const PY_GRADES = { quiz: 3, lab: 3, project: 5, capstone: 20, participation: 5 };

function q(courseId: string, moduleNo: number, i: number, def: Omit<QuizQuestion, "id">): QuizQuestion {
  return { id: `${courseId}-m${moduleNo}-q${i + 1}`, ...def };
}

function topicQuiz(courseId: string, moduleNo: number, title: string, topics: string[], others: string[]): QuizQuestion[] {
  // Generated recall questions for courses whose item banks are still being authored.
  return topics.slice(0, 3).map((t, i) => {
    const distractors = others.filter((o) => !topics.includes(o)).slice(i * 3, i * 3 + 3);
    const opts = [t, ...distractors].map((text, j) => ({ id: String.fromCharCode(97 + j), text }));
    return {
      id: `${courseId}-m${moduleNo}-q${i + 1}`,
      prompt: `Which of these is a key topic of Module ${moduleNo}: ${title}?`,
      options: opts,
      answer: "a",
      explanation: `${t} is covered in Module ${moduleNo}.`,
    };
  });
}

function lessonTranscript(title: string, topics: string[]): string {
  return `In this lesson we cover ${title}. ${topics
    .map((t, i) => `Part ${i + 1} explains ${t.toLowerCase()} with a worked example and a short practice question.`)
    .join(" ")} By the end you should be able to apply each idea in the module's lab and quiz.`;
}

function buildCourse(courseId: string, code: string, defs: (ModuleDef | { title: string; topics: string[] })[], opts: { labs: boolean; capstone?: boolean }) {
  const modules: Module[] = [];
  const items: Item[] = [];
  const allTopics = defs.flatMap((d) => d.topics);

  defs.forEach((d, idx) => {
    const no = idx + 1;
    const full = d as ModuleDef;
    modules.push({
      courseId,
      no,
      title: d.title,
      week: no,
      estimate: "6–8 hours",
      overview: full.overview ?? `This module covers ${d.title.toLowerCase()}: ${d.topics.join(", ").toLowerCase()}.`,
      objectives: d.topics.map((t) => `Explain and apply ${t.toLowerCase()}`),
      keyTopics: d.topics,
      scenario: full.scenario,
    });
    let order = 0;
    const id = (s: string) => `itm_${code.toLowerCase().replace(/[^a-z0-9]/g, "")}_m${no}_${s}`;
    const base = { courseId, moduleNo: no, dueOffsetDays: no * 7 };
    items.push({
      ...base,
      id: id("overview"),
      order: order++,
      kind: "reading",
      title: "Overview",
      minutes: 5,
      graded: false,
      weight: 0,
      aiUsePolicy: "open",
      auditVisible: true,
      body: `${full.overview ?? modules[idx].overview}\n\nLearning objectives:\n${modules[idx].objectives.map((o) => `• ${o}`).join("\n")}${full.scenario ? `\n\nReal-world scenario: ${full.scenario}` : ""}`,
    });
    items.push({
      ...base,
      id: id("lesson"),
      order: order++,
      kind: "video",
      title: `Lesson: ${d.title}`,
      minutes: 18,
      graded: false,
      weight: 0,
      aiUsePolicy: "open",
      auditVisible: true,
      video: { src: null, durationSec: 18 * 60, captions: ["English", "Spanish"], transcript: lessonTranscript(d.title, d.topics) },
      body: lessonTranscript(d.title, d.topics),
    });
    items.push({
      ...base,
      id: id("reading"),
      order: order++,
      kind: "reading",
      title: "Reading & Resources",
      minutes: 25,
      graded: false,
      weight: 0,
      aiUsePolicy: "open",
      auditVisible: true,
      body: d.topics
        .map((t) => `${t}\n${t} is a core idea in ${d.title}. Read the worked example, then try it yourself in the practice cell before moving on.`)
        .join("\n\n"),
    });
    if (opts.labs && full.lab) {
      const lab: LabSpec = {
        templateId: `tpl_${code.toLowerCase()}_m${no}`,
        instructions: full.lab.instructions,
        starterFile: "starter.py",
        starterCode: full.lab.starter,
        tests: full.lab.tests,
        resourceClass: "cpu-small",
        timeLimitMinutes: 45,
      };
      items.push({ ...base, id: id("lab"), order: order++, kind: "lab", title: full.lab.title, minutes: 45, graded: true, weight: PY_GRADES.lab, aiUsePolicy: "hints_only", auditVisible: true, lab, body: full.lab.instructions.join(". ") });
    }
    const quizQs = full.quiz ? full.quiz.map((x, i) => q(courseId, no, i, x)) : topicQuiz(courseId, no, d.title, d.topics, allTopics);
    items.push({
      ...base,
      id: id("quiz"),
      order: order++,
      kind: "quiz",
      title: no === 5 && code === "COP1047C" ? "Scenario Quiz: Functions and Recursion" : `Module ${no} Quiz`,
      minutes: 30,
      graded: true,
      weight: opts.labs ? PY_GRADES.quiz : 6,
      aiUsePolicy: "closed",
      auditVisible: false,
      quiz: { timeLimitMinutes: 30, passPercent: 70, questions: quizQs },
    });
    if (full.project) {
      items.push({
        ...base,
        id: id("project"),
        order: order++,
        kind: "project",
        title: full.project.title,
        minutes: 120,
        graded: true,
        weight: PY_GRADES.project,
        aiUsePolicy: "hints_only",
        auditVisible: false,
        project: {
          scenario: full.project.scenario,
          deliverables: full.project.deliverables,
          rubric: [
            { criterion: "Correctness", points: 20 },
            { criterion: "Use of functions and structure", points: 15 },
            { criterion: "Validation and error handling", points: 10 },
            { criterion: "Report clarity", points: 5 },
          ],
        },
        body: full.project.scenario,
      });
    }
    items.push({ ...base, id: id("discussion"), order: order++, kind: "discussion", title: no === 6 && code === "CAI-4505C" ? "Module 6 Discussion: AI Ethical Considerations" : "Discussion", minutes: 20, graded: false, weight: 0, aiUsePolicy: "open", auditVisible: true, body: `Share one way ${d.topics[0].toLowerCase()} shows up in your work or daily life, and reply to two classmates.` });
    items.push({ ...base, id: id("summary"), order: order++, kind: "summary", title: "Module Summary", minutes: 5, graded: false, weight: 0, aiUsePolicy: "open", auditVisible: true, body: `Key takeaways: ${d.topics.join("; ")}.` });
  });

  if (opts.capstone) {
    const last = defs.length;
    items.push({
      courseId,
      moduleNo: last,
      order: 50,
      id: `itm_${code.toLowerCase().replace(/[^a-z0-9]/g, "")}_capstone`,
      kind: "capstone",
      title: "Capstone: Healthcare Data Analysis System",
      minutes: 600,
      graded: true,
      weight: PY_GRADES.capstone,
      aiUsePolicy: "closed",
      auditVisible: false,
      dueOffsetDays: 80,
      project: {
        scenario:
          "You are a data analyst for a healthcare organization. Build a Python application that imports patient data, cleans and analyzes it, and generates meaningful insights. This capstone demonstrates your ability to use Python for real-world data processing, functions and modular design.",
        deliverables: ["Import and clean a dataset (CSV)", "Use functions and modular programming", "Perform data analysis and generate summary statistics", "Create visualizations (optional)", "Write a final report and present your findings"],
        rubric: [
          { criterion: "Data import and cleaning", points: 25 },
          { criterion: "Modular design", points: 25 },
          { criterion: "Analysis and statistics", points: 30 },
          { criterion: "Report and presentation", points: 20 },
        ],
        milestones: [
          { title: "Project Proposal", due: "2026-10-15T23:59:00-04:00" },
          { title: "Data Preparation", due: "2026-10-22T23:59:00-04:00" },
          { title: "Analysis & Development", due: "2026-11-05T23:59:00-05:00" },
          { title: "Final Report & Presentation", due: "2026-11-19T23:59:00-05:00" },
        ],
      },
      body: "Capstone: import, clean and analyze a patient dataset with modular Python, then report findings.",
    });
    items.push({
      courseId,
      moduleNo: last,
      order: 51,
      id: `itm_${code.toLowerCase().replace(/[^a-z0-9]/g, "")}_participation`,
      kind: "discussion",
      title: "Participation",
      minutes: 0,
      graded: true,
      weight: PY_GRADES.participation,
      aiUsePolicy: "open",
      auditVisible: false,
      body: "Participation across module discussions, graded by course staff.",
    });
  }
  return { modules, items };
}

function normaliseWeights(items: Item[], courseId: string) {
  const graded = items.filter((i) => i.courseId === courseId && i.graded);
  const total = graded.reduce((s, i) => s + i.weight, 0);
  if (total === 0) return;
  for (const i of graded) i.weight = Math.round((i.weight / total) * 1000) / 10;
}

export function buildContent(): { modules: Module[]; items: Item[] } {
  const py = buildCourse(COURSE_PY, "COP1047C", PY_MODULES, { labs: true, capstone: true });
  const ai = buildCourse(COURSE_AI, "CAI-4505C", AI_MODULES, { labs: false });
  const db = buildCourse(COURSE_DB, "CGS1540C", DB_MODULES, { labs: false });
  const ag = buildCourse(COURSE_AGENTIC, "AGF", AGENTIC_MODULES, { labs: false });

  const gpRag: Item = {
    id: "itm_gp_rag_lab",
    courseId: "prd_gp_rag",
    moduleNo: 1,
    order: 0,
    kind: "lab",
    title: "Guided Project: Retrieval Chatbot",
    minutes: 120,
    graded: true,
    weight: 100,
    aiUsePolicy: "hints_only",
    auditVisible: false,
    body: "Chunk notes, score chunks by keyword overlap, and return the best chunk with its index as a citation.",
    lab: {
      templateId: "tpl_gp_rag",
      instructions: ["Write chunk(text, size) splitting text into lists of `size` words joined by spaces", "Write best_chunk(chunks, question) returning (index, chunk) with the most shared lower-case words", "Return (-1, '') when nothing matches"],
      starterFile: "rag.py",
      starterCode: "def chunk(text, size):\n    # TODO\n    pass\n\ndef best_chunk(chunks, question):\n    # TODO\n    pass\n",
      tests: [
        { name: "chunk splits by words", code: "assert chunk('a b c d e', 2) == ['a b', 'c d', 'e']", points: 10 },
        { name: "best_chunk ranks overlap", code: "assert best_chunk(['cats purr', 'dogs bark loudly'], 'why do dogs bark') == (1, 'dogs bark loudly')", points: 10 },
        { name: "no match", code: "assert best_chunk(['x y'], 'zzz') == (-1, '')", points: 5 },
      ],
      resourceClass: "cpu-small",
      timeLimitMinutes: 120,
    },
  };
  const gpPatient: Item = {
    id: "itm_gp_patient_lab",
    courseId: "prd_gp_patient",
    moduleNo: 1,
    order: 0,
    kind: "lab",
    title: "Guided Project: Patient Records CLI",
    minutes: 90,
    graded: true,
    weight: 100,
    aiUsePolicy: "hints_only",
    auditVisible: false,
    body: "Store patients in a dictionary keyed by id and search them by last name.",
    lab: {
      templateId: "tpl_gp_patient",
      instructions: ["Write add_patient(records, pid, first, last) storing {'first','last'} under pid", "Write find_by_last(records, last) returning sorted ids whose last name matches (case-insensitive)"],
      starterFile: "records.py",
      starterCode: "def add_patient(records, pid, first, last):\n    # TODO\n    pass\n\ndef find_by_last(records, last):\n    # TODO\n    pass\n",
      tests: [
        { name: "add and find", code: "r = {}\nadd_patient(r, 'p1', 'Amara', 'Chukwu')\nadd_patient(r, 'p2', 'Ngozi', 'chukwu')\nassert find_by_last(r, 'CHUKWU') == ['p1', 'p2']", points: 10 },
        { name: "no matches", code: "assert find_by_last({}, 'x') == []", points: 5 },
      ],
      resourceClass: "cpu-small",
      timeLimitMinutes: 90,
    },
  };

  const items = [...py.items, ...ai.items, ...db.items, ...ag.items, gpRag, gpPatient];
  // Module 5 mini project is peer reviewed: two reviews received, two given.
  const m5 = items.find((i) => i.id === "itm_cop1047c_m5_project");
  if (m5?.project) m5.project.peerReview = { required: 2 };
  for (const c of [COURSE_PY, COURSE_AI, COURSE_DB, COURSE_AGENTIC]) normaliseWeights(items, c);
  return { modules: [...py.modules, ...ai.modules, ...db.modules, ...ag.modules], items };
}
