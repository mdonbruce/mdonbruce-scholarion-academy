/**
 * Deterministic, extractive NLP helpers for the Course Studio. No model, no randomness:
 * the same text always yields the same sentences, terms, definitions and summaries.
 */

export const STOPWORDS = new Set(
  (
    "a about above after again against all also am an and any are aren't as at be because been before being below between both but by can can't cannot could " +
    "did do does doing don't down during each either else even ever every few for from further get gets got had has have having he her here hers herself him himself his how however " +
    "i if in into is isn't it it's its itself just least less let like made make makes many may me might more most much must my myself need needs neither no nor not now of off often on once one only or other " +
    "others our ours ourselves out over own per rather really same see seen several shall she should since so some such than that the their theirs them themselves then there these they this those " +
    "though through thus to too toward under until up upon us use used uses using very via was we well were what when where whether which while who whom whose why will with within without would " +
    "yet you your yours yourself yourselves first second third next finally instead example examples e.g i.e etc way ways thing things something anything everything lot lots part parts kind kinds"
  ).split(/\s+/),
);

export interface Sentence {
  /** Index in the combined corpus (original order across sources). */
  idx: number;
  text: string;
  sourceId: string;
  ref: string;
  words: number;
}

export interface Term {
  term: string;
  display: string;
  freq: number;
  score: number;
  firstIdx: number;
  n: number;
}

export interface Definition {
  term: string;
  definition: string;
  sentence: Sentence;
  article?: string | null;
  verb?: string;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Split text into sentences; blank lines and bullets also end a sentence. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const blocks = String(text ?? "")
    .replace(/\r/g, "")
    .split(/\n\s*\n|\n(?=\s*(?:[-*•]|\d+[.)])\s)/);
  for (const b of blocks) {
    const flat = norm(b.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, ""));
    if (!flat) continue;
    for (const s of flat.split(/(?<=[.!?])["')\]]?\s+(?=["'(\[]?[A-Z0-9])/)) {
      const t = norm(s);
      if (t) out.push(t);
    }
  }
  return out;
}

export function wordCount(s: string): number {
  return (String(s).match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length;
}

export function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z0-9-]*[a-z0-9]|[a-z]/g) ?? []).map((w) => w.replace(/-+$/, ""));
}

/** Build the cited corpus from sources (only sentences of a useful length are kept). */
export function corpus(sources: { id: string; ref: string; text: string }[]): Sentence[] {
  const seen = new Set<string>();
  const out: Sentence[] = [];
  for (const src of sources) {
    for (const s of splitSentences(src.text)) {
      const w = wordCount(s);
      if (w < 5 || w > 70) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ idx: out.length, text: s, sourceId: src.id, ref: src.ref, words: w });
    }
  }
  return out;
}

/** Key terms: frequency + capitalization + noun-phrase-ish n-grams (no stopwords inside). */
export function keyTerms(sentences: Sentence[], max = 24): Term[] {
  const stats = new Map<string, { freq: number; firstIdx: number; n: number; surfaces: Map<string, number>; capital: number }>();
  for (const s of sentences) {
    const raw = s.text.match(/[A-Za-z][A-Za-z0-9-]*[A-Za-z0-9]|[A-Za-z]/g) ?? [];
    const low = raw.map((w) => w.toLowerCase());
    for (let n = 1; n <= 3; n++) {
      for (let i = 0; i + n <= low.length; i++) {
        const gram = low.slice(i, i + n);
        if (gram.some((w) => STOPWORDS.has(w) || w.length < 3 || /^\d/.test(w))) continue;
        if (n === 1 && gram[0].length < 4) continue;
        const key = gram.join(" ");
        const surface = raw.slice(i, i + n).join(" ");
        const st = stats.get(key) ?? { freq: 0, firstIdx: s.idx, n, surfaces: new Map(), capital: 0 };
        st.freq++;
        st.surfaces.set(surface, (st.surfaces.get(surface) ?? 0) + 1);
        if (i > 0 && /^[A-Z]/.test(raw[i])) st.capital++;
        stats.set(key, st);
      }
    }
  }
  const cands: Term[] = [];
  for (const [key, st] of stats) {
    if (st.freq < 2) continue;
    const display = [...st.surfaces.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    const score = st.freq * (1 + 0.6 * (st.n - 1)) + Math.min(st.capital, 3) * 0.5;
    cands.push({ term: key, display: /^[A-Z]{2,}/.test(display) || st.capital > st.freq / 2 ? display : key, freq: st.freq, score, firstIdx: st.firstIdx, n: st.n });
  }
  // Drop a shorter term when a longer phrase containing it covers most of its uses.
  const kept = cands.filter((t) => !cands.some((o) => o.n > t.n && ` ${o.term} `.includes(` ${t.term} `) && o.freq >= t.freq * 0.7));
  return kept.sort((a, b) => b.score - a.score || a.firstIdx - b.firstIdx || a.term.localeCompare(b.term)).slice(0, max);
}

const DEF_RE = /^(?:(An?|The)\s+)?([A-Za-z][A-Za-z0-9 &/()'-]{1,60}?)\s*(?:,[^,]{0,40},\s*)?\s+(is defined as|refers to|is called|is|are|means|describes)\s+(.{12,})$/;
const LEAD_BLOCK = new Set(["this", "that", "it", "these", "those", "there", "what", "which", "each", "when", "if", "because", "although", "while", "after", "before", "since", "once", "as", "where", "why", "how", "here", "one", "another"]);
const EVALUATIVE = /^(common|frequent|main|primary|key|important|typical|simple|good|best|worst|other|same|following|first|last|next|only|real|goal|result|reason|problem|point|idea|difference|question|answer)$|est$/i;
const PARTICIPLE = /^(?:not\b|(?:not\s+)?(?:\w+ed|hit|done|made|set|run|given|taken|known|shown|seen|built|kept|met|held|put|cut|left|lost|found|said|told|sent|spent|written|chosen|driven|broken|able|likely|unlikely|about|also|often|usually|only|always|never|still|then|to)\b)/i;

/** Definition sentences: "X is …", "X refers to …", "X means …". */
export function definitions(sentences: Sentence[]): Definition[] {
  const out: Definition[] = [];
  const seen = new Set<string>();
  const midCaps = new Set<string>();
  for (const s of sentences) for (const m of s.text.matchAll(/(?<=\S\s)([A-Z][a-z]+)/g)) midCaps.add(m[1]);
  for (const s of sentences) {
    const m = s.text.match(DEF_RE);
    if (!m) continue;
    let term = m[2].trim();
    const tw = term.split(/\s+/);
    if (tw.length > 4) continue;
    const low = tw.map((w) => w.toLowerCase());
    if (low.every((w) => STOPWORDS.has(w))) continue;
    if (STOPWORDS.has(low[low.length - 1]) || LEAD_BLOCK.has(low[0]) || EVALUATIVE.test(low[0])) continue;
    if (tw.slice(1).some((w) => /^(define|defines|is|are|was|be|can|will|should|must|may)$/i.test(w))) continue;
    const def = m[4].replace(/[.!?]+$/, "").trim();
    if (PARTICIPLE.test(def) || wordCount(def) < 4) continue;
    if (/^[A-Z][a-z]/.test(term) && !midCaps.has(tw[0])) term = term[0].toLowerCase() + term.slice(1);
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const verb = m[3].toLowerCase();
    out.push({ term, definition: def, sentence: s, article: m[1] ? m[1].toLowerCase() : null, verb });
  }
  return out;
}

/** "What is a plan?" / "What are guardrails?" */
export function definitionQuestion(d: Definition): string {
  if (d.verb === "are") return `What are ${d.article === "the" ? "the " : ""}${d.term}?`;
  if (d.verb === "refers to") return `What does ${d.article ? `${d.article} ` : ""}${d.term} refer to?`;
  if (d.verb === "means") return `What does ${d.article ? `${d.article} ` : ""}${d.term} mean?`;
  return `What is ${d.article ? `${d.article} ` : ""}${d.term}?`;
}

/** Score sentences by key-term density, definitional value and position. */
export function scoreSentences(sentences: Sentence[], terms: Term[], defs: Definition[] = []): Map<number, number> {
  const scores = new Map<number, number>();
  const defIdx = new Set(defs.map((d) => d.sentence.idx));
  for (const s of sentences) {
    const low = ` ${tokens(s.text).join(" ")} `;
    let sc = 0;
    for (const t of terms) if (low.includes(` ${t.term} `)) sc += t.score;
    sc = sc / Math.sqrt(Math.max(8, s.words));
    if (defIdx.has(s.idx)) sc *= 1.3;
    if (s.words > 45) sc *= 0.8;
    scores.set(s.idx, Math.round(sc * 1000) / 1000);
  }
  return scores;
}

export function topSentences(sentences: Sentence[], scores: Map<number, number>, n: number): Sentence[] {
  return [...sentences].sort((a, b) => (scores.get(b.idx) ?? 0) - (scores.get(a.idx) ?? 0) || a.idx - b.idx).slice(0, n);
}

/** Extractive summary: top-n sentences, returned in original order. */
export function summarize(sentences: Sentence[], scores: Map<number, number>, n: number): Sentence[] {
  return topSentences(sentences, scores, n).sort((a, b) => a.idx - b.idx);
}

/** Cloze: blank the first whole-word occurrence of `term`. */
export function cloze(sentence: string, term: string): { prompt: string; answer: string } | null {
  const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i");
  const m = sentence.match(re);
  if (!m || m.index === undefined) return null;
  return { prompt: sentence.slice(0, m.index) + "_____" + sentence.slice(m.index + m[0].length), answer: m[0] };
}

export function containsTerm(sentence: string, term: string): boolean {
  return ` ${tokens(sentence).join(" ")} `.includes(` ${tokens(term).join(" ")} `);
}

/** Shorten to at most `maxWords` words (quotes stay short excerpts). */
export function excerpt(s: string, maxWords = 30): string {
  const w = norm(s).split(" ");
  return w.length <= maxWords ? norm(s) : `${w.slice(0, maxWords).join(" ").replace(/[,;:]$/, "")} …`;
}

const MISCONCEPTION = /\b(not|never|avoid|mistake|mistaken|misconception|instead|wrong|incorrect|pitfall|common error|don't|do not|should not|cannot|risk)\b/i;
const PROCESS = /\b(first|then|next|after|afterwards|finally|step|stage|phase|loop|cycle|before|once|followed by)\b/i;
const EXAMPLE = /\b(for example|for instance|e\.g\.|such as|consider|suppose|imagine|scenario|example)\b/i;
const APPLIED = /\b(in practice|real[- ]world|production|organi[sz]ation|team|teams|customer|industry|business|deploy|deployment|operations|use case|workplace)\b/i;
const WHY = /\b(because|so that|in order to|which means|therefore|this is why|that is why)\b/i;

export const isMisconception = (s: string) => MISCONCEPTION.test(s);
export const isProcess = (s: string) => PROCESS.test(s);
export const isExample = (s: string) => EXAMPLE.test(s);
export const isApplied = (s: string) => APPLIED.test(s);
export const isWhy = (s: string) => WHY.test(s);

/** Split a "why" sentence into claim / reason halves. */
export function whyParts(s: string): { claim: string; reason: string; marker: string } | null {
  const m = s.match(/^(.{12,}?)(?:,\s*|\s+)(because|so that|in order to)\s+(.{8,})$/i) ?? s.match(/^(.{12,}?)[,;]\s*(which means|therefore)\s+(.{8,})$/i);
  if (!m) return null;
  return { claim: m[1].replace(/[,;]$/, "").trim(), reason: m[3].replace(/[.!?]+$/, "").trim(), marker: m[2].toLowerCase() };
}

/** The most specific key term in a sentence (longer phrases first; overly common words skipped). */
export function bestTermIn(sentence: string, terms: Term[], corpusSize: number, prefer: string[] = []): Term | undefined {
  const pref = new Set(prefer.map((p) => p.toLowerCase()));
  const present = terms.filter((t) => containsTerm(sentence, t.term) && !(t.n === 1 && t.freq > Math.max(6, corpusSize * 0.2)));
  return present.sort((a, b) => Number(pref.has(b.term)) - Number(pref.has(a.term)) || b.n - a.n || b.score - a.score)[0];
}

/** Deterministic string hash (FNV-1a) for stable ordering decisions. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Stable pseudo-shuffle keyed by a seed string. */
export function stableShuffle<T>(items: T[], seed: string, key: (x: T) => string = (x) => String(x)): T[] {
  return [...items].sort((a, b) => hash(seed + key(a)) - hash(seed + key(b)) || key(a).localeCompare(key(b)));
}

/** Map a text to the best-overlapping learning objective (index), default 0. */
export function bestObjective(text: string, objectives: string[]): number {
  const t = new Set(tokens(text).filter((w) => !STOPWORDS.has(w) && w.length > 3));
  let best = 0;
  let bestScore = 0;
  objectives.forEach((o, i) => {
    const sc = tokens(o).filter((w) => t.has(w)).length;
    if (sc > bestScore) {
      best = i;
      bestScore = sc;
    }
  });
  return best;
}
