import { CampusError } from "../../core";
import { relPath, vfsFromFiles, vfsStat, vfsToFiles, WORKSPACE_ROOT, type Vfs } from "./vfs";

/**
 * Versioned starter templates for simulated sandbox workspaces.
 *
 * Each template is plain data: the starter files, the simulated environment, the pinned
 * dependency list (documentation only — nothing is installed), task instructions, the lab
 * directories where the simulated shell may run, canned responses for simulated HTTP
 * endpoints, and structural validation checks run by `scholarion validate`.
 */

export type TemplateKind = "programming" | "agentic" | "data" | "devops" | "cloud_sim" | "lecture_lab";

export interface ValidationCheck {
  id: string;
  label: string;
  kind: "exists" | "contains" | "yaml_keys";
  path: string;
  /** Literal text (case-insensitive) for `contains`. Never shown to learners or in progress reports. */
  text?: string;
  keys?: string[];
}

export interface SimEndpoint {
  status: number;
  body: unknown;
}

export interface WorkspaceTemplate {
  id: string;
  version: number;
  kind: TemplateKind;
  title: string;
  description: string;
  files: Record<string, string>;
  envConfig: Record<string, string>;
  dependencies: string[];
  instructions: string[];
  /** Workspace-relative directories where the simulated shell may run ("." = whole workspace). */
  labDirs: string[];
  /** Keyed by "host/path". */
  simEndpoints: Record<string, SimEndpoint>;
  validations: ValidationCheck[];
}

const COMMON_ENDPOINTS: Record<string, SimEndpoint> = {
  "api.scholarion.local/v1/health": { status: 200, body: { status: "ok", sandbox: "simulated", service: "scholarion-sim-api" } },
  "api.scholarion.local/v1/time": { status: 200, body: { sandbox: "simulated", clock: "simulated", note: "Simulated endpoint; no real service was contacted." } },
};

const programming: WorkspaceTemplate = {
  id: "python-project",
  version: 3,
  kind: "programming",
  title: "Python project starter",
  description: "A small Python package with tests, a README and pinned requirements.",
  files: {
    "README.md": "# Grade Calculator\n\nImplement `average` and `letter_grade` in src/grades.py.\nRun `scholarion validate` to check the project structure.\n",
    "requirements.txt": "pytest==8.3.3\nrequests==2.32.3\n",
    "src/__init__.py": "",
    "src/grades.py": 'def average(scores):\n    """Return the mean of a list of scores."""\n    # TODO: implement\n    raise NotImplementedError\n\n\ndef letter_grade(score):\n    # TODO: implement (A >= 90, B >= 80, C >= 70, D >= 60, else F)\n    raise NotImplementedError\n',
    "tests/test_grades.py": "from src.grades import average, letter_grade\n\n\ndef test_average():\n    assert average([80, 90, 100]) == 90\n\n\ndef test_letter_grade():\n    assert letter_grade(91) == \"A\"\n",
  },
  envConfig: { PYTHON_VERSION: "3.12", APP_ENV: "lab" },
  dependencies: ["pytest==8.3.3", "requests==2.32.3"],
  instructions: ["Implement average() and letter_grade() in src/grades.py.", "Add at least one more test in tests/test_grades.py.", "Run `scholarion validate`."],
  labDirs: ["."],
  simEndpoints: { "api.scholarion.local/v1/grades": { status: 200, body: { sandbox: "simulated", scores: [88, 92, 79] } } },
  validations: [
    { id: "readme", label: "README.md exists", kind: "exists", path: "README.md" },
    { id: "reqs-pinned", label: "requirements.txt pins pytest", kind: "contains", path: "requirements.txt", text: "pytest==" },
    { id: "avg-impl", label: "average() no longer raises NotImplementedError", kind: "contains", path: "src/grades.py", text: "return sum(" },
    { id: "tests", label: "tests/test_grades.py exists", kind: "exists", path: "tests/test_grades.py" },
  ],
};

const agentic: WorkspaceTemplate = {
  id: "agent-builder",
  version: 2,
  kind: "agentic",
  title: "Agent spec starter",
  description: "Declarative agent spec, a tools configuration and a small knowledge file.",
  files: {
    "agent/spec.yaml": "name: course-helper\ngoal: Answer schedule questions from data/schedule.csv\nmax_steps: 8\ntools:\n  - FILE_READ\n  - HTTP_REQUEST\nstop_when: answer_found\n",
    "agent/tools.yaml": "tools:\n  - name: FILE_READ\n    scope: /workspace/data\n  - name: HTTP_REQUEST\n    endpoint: sim://api.scholarion.local/v1/schedule\n",
    "data/schedule.csv": "week,topic\n1,Agents and environments\n2,Tool use\n3,Evaluation\n",
    "README.md": "# Agent lab\n\nComplete agent/spec.yaml (add a guardrail) and run a plan from the Agent panel.\n",
  },
  envConfig: { AGENT_MODE: "simulated" },
  dependencies: [],
  instructions: ["Add a guardrail section to agent/spec.yaml.", "Run a bounded agent plan that reads data/schedule.csv.", "Run `scholarion validate`."],
  labDirs: ["."],
  simEndpoints: { "api.scholarion.local/v1/schedule": { status: 200, body: { sandbox: "simulated", weeks: [{ week: 1, topic: "Agents and environments" }] } } },
  validations: [
    { id: "spec", label: "agent/spec.yaml has name, goal, tools and guardrail", kind: "yaml_keys", path: "agent/spec.yaml", keys: ["name", "goal", "tools", "guardrail"] },
    { id: "tools", label: "agent/tools.yaml exists", kind: "exists", path: "agent/tools.yaml" },
  ],
};

const data: WorkspaceTemplate = {
  id: "data-analysis",
  version: 1,
  kind: "data",
  title: "Dataset analysis starter",
  description: "A CSV dataset and a notebook-style analysis.md.",
  files: {
    "data/enrollment.csv": "term,students,completed\nFall,120,104\nSpring,98,90\nSummer,45,41\n",
    "analysis.md": "# Enrollment analysis\n\n## Question\nWhich term has the highest completion rate?\n\n## Method\nTODO\n\n## Findings\nTODO\n",
  },
  envConfig: { DATASET: "data/enrollment.csv" },
  dependencies: ["pandas==2.2.3"],
  instructions: ["Fill in Method and Findings in analysis.md.", "Use grep/wc in the simulated terminal to inspect the CSV.", "Run `scholarion validate`."],
  labDirs: ["."],
  simEndpoints: { "data.scholarion.local/v1/enrollment": { status: 200, body: { sandbox: "simulated", rows: 3 } } },
  validations: [
    { id: "csv", label: "Dataset present", kind: "exists", path: "data/enrollment.csv" },
    { id: "findings", label: "analysis.md has a Conclusion section", kind: "contains", path: "analysis.md", text: "## Conclusion" },
  ],
};

const devops: WorkspaceTemplate = {
  id: "devops-pipeline",
  version: 2,
  kind: "devops",
  title: "DevOps pipeline starter",
  description: "Dockerfile, docker-compose.yml, a CI workflow and a Makefile (configuration only; nothing is built).",
  files: {
    Dockerfile: "FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install -r requirements.txt\nCOPY . .\nCMD [\"python\", \"app.py\"]\n",
    "docker-compose.yml": "services:\n  web:\n    build: .\n    ports:\n      - \"8000:8000\"\n",
    ".github/workflows/ci.yml": "name: ci\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Install\n        run: pip install -r requirements.txt\n",
    Makefile: "install:\n\tpip install -r requirements.txt\n",
    "requirements.txt": "flask==3.0.3\npytest==8.3.3\n",
    "app.py": "print('hello from the lab app')\n",
  },
  envConfig: { CI: "simulated" },
  dependencies: ["flask==3.0.3", "pytest==8.3.3"],
  instructions: ["Add a test step to .github/workflows/ci.yml.", "Add a `test` target to the Makefile.", "Add a healthcheck to docker-compose.yml.", "Run `scholarion validate`."],
  labDirs: ["."],
  simEndpoints: {},
  validations: [
    { id: "dockerfile", label: "Dockerfile exists", kind: "exists", path: "Dockerfile" },
    { id: "compose", label: "docker-compose.yml defines services and a healthcheck", kind: "yaml_keys", path: "docker-compose.yml", keys: ["services", "healthcheck"] },
    { id: "ci-test", label: "CI workflow has a test step", kind: "contains", path: ".github/workflows/ci.yml", text: "pytest" },
    { id: "make-test", label: "Makefile has a test target", kind: "contains", path: "Makefile", text: "test:" },
  ],
};

const cloud: WorkspaceTemplate = {
  id: "cloud-sim",
  version: 1,
  kind: "cloud_sim",
  title: "Simulated cloud resources",
  description: "YAML manifests for simulated buckets, queues and functions. Nothing is deployed anywhere.",
  files: {
    "infra/bucket.yaml": "kind: Bucket\nname: course-uploads\nversioning: false\n",
    "infra/queue.yaml": "kind: Queue\nname: grading-jobs\nvisibility_timeout: 30\n",
    "infra/function.yaml": "kind: Function\nname: thumbnailer\nruntime: python3.12\ntrigger: course-uploads\n",
    "README.md": "# Simulated cloud\n\nTurn on versioning, add a dead-letter queue and a memory size for the function.\nQuery sim://cloud.sim.scholarion.local/v1/resources to see the simulated inventory.\n",
  },
  envConfig: { CLOUD_REGION: "sim-east-1", CLOUD_MODE: "simulated" },
  dependencies: [],
  instructions: ["Set versioning: true on the bucket.", "Add dead_letter_queue to the queue manifest.", "Add memory_mb to the function manifest.", "Run `scholarion validate`."],
  labDirs: ["."],
  simEndpoints: {
    "cloud.sim.scholarion.local/v1/resources": { status: 200, body: { sandbox: "simulated", buckets: ["course-uploads"], queues: ["grading-jobs"], functions: ["thumbnailer"] } },
  },
  validations: [
    { id: "bucket", label: "Bucket manifest has kind, name and versioning", kind: "yaml_keys", path: "infra/bucket.yaml", keys: ["kind", "name", "versioning"] },
    { id: "dlq", label: "Queue has a dead-letter queue", kind: "yaml_keys", path: "infra/queue.yaml", keys: ["dead_letter_queue"] },
    { id: "fn-mem", label: "Function sets memory_mb", kind: "yaml_keys", path: "infra/function.yaml", keys: ["memory_mb"] },
  ],
};

const lecture: WorkspaceTemplate = {
  id: "lecture-lab",
  version: 1,
  kind: "lecture_lab",
  title: "Guided lecture lab",
  description: "Step-by-step guided exercises worked in the simulated terminal.",
  files: {
    "steps/01-explore.md": "# Step 1\nRun `ls -la` and `tree` to explore the workspace.\n",
    "steps/02-files.md": "# Step 2\nCreate notes/today.md with `echo \"my notes\" > notes/today.md` (make the folder first).\n",
    "steps/03-search.md": "# Step 3\nUse `grep -n Step steps/*.md` style searches with `cat steps/01-explore.md | grep Step`.\n",
    "lab/README.md": "Work in this folder.\n",
  },
  envConfig: { LAB_MODE: "guided" },
  dependencies: [],
  instructions: ["Follow steps/01 to steps/03 in order.", "Run `scholarion validate` when done."],
  labDirs: ["."],
  simEndpoints: {},
  validations: [{ id: "notes", label: "notes/today.md exists", kind: "exists", path: "notes/today.md" }],
};

export const TEMPLATES: Record<string, WorkspaceTemplate> = Object.fromEntries([programming, agentic, data, devops, cloud, lecture].map((t) => [t.id, t]));

export function getTemplate(templateId: string): WorkspaceTemplate {
  const t = Object.prototype.hasOwnProperty.call(TEMPLATES, templateId) ? TEMPLATES[templateId] : undefined;
  if (!t) throw new CampusError("not_found", `Unknown workspace template "${templateId}".`, 404);
  return t;
}

export function listTemplates() {
  return Object.values(TEMPLATES).map((t) => ({ id: t.id, version: t.version, kind: t.kind, title: t.title, description: t.description, dependencies: t.dependencies, instructions: t.instructions, files: Object.keys(t.files) }));
}

export function templateVfs(t: WorkspaceTemplate): Vfs {
  return vfsFromFiles(t.files);
}

/** Canned simulated HTTP response. */
export function simEndpoint(t: WorkspaceTemplate, host: string, path: string): SimEndpoint {
  const key = `${host}${path.replace(/\/+$/, "") || "/"}`;
  return t.simEndpoints[key] ?? COMMON_ENDPOINTS[key] ?? { status: 404, body: { sandbox: "simulated", error: "not_found", message: `No simulated endpoint at ${key}.` } };
}

export interface ResetPlan {
  templateId: string;
  templateVersion: number;
  /** Template files that exist now and will be overwritten with the starter content. */
  replace: string[];
  /** Template files that are missing now and will be restored. */
  restore: string[];
  /** Files in the workspace that are not part of the template and will be removed. */
  remove: string[];
  keeps: string[];
  summary: string;
}

/** Exactly which files a reset would replace, restore and remove. */
export function describeReset(templateId: string, current?: Vfs): ResetPlan {
  const t = getTemplate(templateId);
  const starter = Object.keys(t.files).sort();
  const now = current ? Object.keys(vfsToFiles(current)) : [];
  const replace = current ? starter.filter((f) => now.includes(f)) : starter;
  const restore = current ? starter.filter((f) => !now.includes(f)) : [];
  const remove = now.filter((f) => !starter.includes(f));
  return {
    templateId: t.id,
    templateVersion: t.version,
    replace,
    restore,
    remove,
    keeps: ["Submission snapshots (never deleted by a reset)", "Shell history", "Budget usage"],
    summary: `Reset to ${t.title} v${t.version}: ${replace.length} file(s) replaced, ${restore.length} restored, ${remove.length} removed. Submission snapshots are kept.`,
  };
}

export interface ValidationResult {
  passed: number;
  total: number;
  checks: { id: string; label: string; passed: boolean; detail?: string }[];
  at?: string;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Run the template's structural checks against the VFS (learner content is only matched as text). */
export function runValidation(t: WorkspaceTemplate, v: Vfs): ValidationResult {
  const checks = t.validations.map((c) => {
    const abs = `${WORKSPACE_ROOT}/${c.path}`;
    const n = vfsStat(v, abs);
    const content = n?.type === "file" ? n.content : null;
    let passed = false;
    let detail: string | undefined;
    if (c.kind === "exists") {
      passed = !!n;
      if (!passed) detail = `${relPath(abs)} not found`;
    } else if (content === null) {
      detail = `${c.path} not found`;
    } else if (c.kind === "contains") {
      passed = content.toLowerCase().includes((c.text ?? "").toLowerCase());
      if (!passed) detail = "requirement not met yet";
    } else {
      const missing = (c.keys ?? []).filter((k) => !new RegExp(`^\\s*-?\\s*${escRe(k)}\\s*:`, "m").test(content));
      passed = missing.length === 0;
      if (!passed) detail = `missing key(s): ${missing.join(", ")}`;
    }
    return { id: c.id, label: c.label, passed, ...(detail ? { detail } : {}) };
  });
  return { passed: checks.filter((c) => c.passed).length, total: checks.length, checks };
}
