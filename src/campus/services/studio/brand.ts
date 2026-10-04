import { CampusError, nowIso, type TenantStore } from "../../core";
import type { Actor } from "../../iam";
import { audit } from "../common";
import { fitSize, LEAD_FACULTY } from "../../../brand/faculty";
import { facultyImageBytes } from "../../../brand/faculty-assets";
import { toPptx, type PptDeck, type PptPara, type PptShape, type PptSlide } from "../../../documents/pptx";
import { excerpt } from "./extract";
import { concepts, INSTRUCTOR_ROLE, type Model, type Slide } from "./generate";
import { requireGenerate } from "./sources";
import { DRAFT_LABEL, SUPPLEMENTAL, type StudioProfile } from "./types";

/**
 * Course / institution branding for the Studio: one layout model (shapes on a 1920×1080 grid)
 * renders both the HTML covers and the PowerPoint files, so they always match.
 *
 *   Variant A — dark: wordmark, motto band, two-tone course code, module banner, topic title,
 *               approved faculty photograph with name and title, six-cell footer info bar.
 *   Variant B — light: the same plus key topics, a process strip and an outcomes checklist.
 */

export const PROFILES = "studio_profiles";
const HEX = /^#[0-9a-fA-F]{6}$/;
const pad2 = (n: number) => String(n).padStart(2, "0");

export interface ResolvedProfile {
  institution: string;
  motto: string;
  primary: string;
  accent: string;
  light: string;
  format: string;
  footer: { label: string; value: string }[];
  keyTopics: string[];
  process: string[];
}

export function cleanProfile(raw: StudioProfile | undefined | null): StudioProfile | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const color = (v: unknown, name: string) => {
    if (v === undefined || v === null || v === "") return undefined;
    if (typeof v !== "string" || !HEX.test(v)) throw new CampusError("invalid", `${name} must be a colour like #0b1f4d.`, 422);
    return v.toLowerCase();
  };
  const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.map((x) => s(x, max)).filter((x): x is string => !!x).slice(0, n) : undefined);
  const footer = Array.isArray(raw.footer)
    ? raw.footer
        .map((c) => ({ label: s(c?.label, 24) ?? "", value: s(c?.value, 60) ?? "" }))
        .filter((c) => c.label && c.value)
        .slice(0, 6)
    : undefined;
  const out: StudioProfile = {
    institution: s(raw.institution, 80),
    motto: s(raw.motto, 120),
    primary: color(raw.primary, "primary"),
    accent: color(raw.accent, "accent"),
    light: color(raw.light, "light"),
    format: s(raw.format, 60),
    footer,
    keyTopics: list(raw.keyTopics, 6, 60),
    process: list(raw.process, 6, 40),
  };
  for (const k of Object.keys(out) as (keyof StudioProfile)[]) if (out[k] === undefined) delete out[k];
  return Object.keys(out).length ? out : undefined;
}

/** Stored profile for a course (staff), or null. */
export function getProfile(store: TenantStore, courseKey: string): StudioProfile | null {
  const row = store.list(PROFILES, (p) => p.courseKey === courseKey)[0];
  return row ? ((row.profile as StudioProfile) ?? null) : null;
}

export function setProfile(store: TenantStore, a: Actor, courseKey: string, raw: StudioProfile) {
  requireGenerate(store, a, courseKey, "studio.profile.set");
  const profile = cleanProfile(raw) ?? {};
  const row = store.tx(() => {
    const cur = store.list(PROFILES, (p) => p.courseKey === courseKey)[0];
    return cur ? store.update(PROFILES, cur.id, { profile, updatedBy: a.id, updatedAt: nowIso() }) : store.insert(PROFILES, { courseKey, profile, updatedBy: a.id, updatedAt: nowIso() }, "sprof");
  });
  audit(store, a, "studio.profile.set", `${PROFILES}/${row.id}`, courseKey);
  return { id: row.id, courseKey, profile };
}

export function resolveProfile(m: Model): ResolvedProfile {
  const i = m.input;
  const p = i.profile ?? {};
  const format = p.format ?? "Online lecture + labs";
  const base = [
    { label: "Course", value: i.courseCode },
    { label: "Module", value: `${pad2(i.moduleNumber)} · ${excerpt(i.moduleTitle, 5)}` },
    { label: "Level", value: i.level || "—" },
    { label: "Duration", value: i.duration || "Self-paced" },
    { label: "Format", value: format },
    { label: "Instructor", value: LEAD_FACULTY.shortName },
  ];
  const footer = base.map((c) => p.footer?.find((f) => f.label.toLowerCase() === c.label.toLowerCase()) ?? c);
  const keyTopics = p.keyTopics?.length ? p.keyTopics : concepts(m, 5).map((c) => c.term);
  const process = p.process?.length
    ? p.process
    : ["Read", "Lecture", "Mini-labs", "Practice quiz", ...(m.assessments.length ? [m.assessments[0].kind === "project" ? "Project" : "Assessment"] : [])];
  return {
    institution: p.institution ?? "Scholarion Academy",
    motto: p.motto ?? "Learn by building. Lead with integrity.",
    primary: p.primary ?? "#0b1f4d",
    accent: p.accent ?? "#f2c66d",
    light: p.light ?? "#f7f5ef",
    format,
    footer,
    keyTopics,
    process,
  };
}

/** Course code in two tones: the letter prefix in the base colour, the number in the accent. */
export function twoTone(code: string): [string, string] {
  const m = /^(\D+)(\d[\s\S]*)$/.exec(code.trim());
  return m ? [m[1], m[2]] : [code, ""];
}

const darken = (c: string, k = 0.72) => {
  const n = parseInt(c.slice(1), 16);
  const ch = (v: number) => Math.round(v * k).toString(16).padStart(2, "0");
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
};
const lum = (c: string) => {
  const n = parseInt(c.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};
const strip = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export interface CoverLayout {
  slide: PptSlide;
  images: PptDeck["images"];
  imageAlts: string[];
}

const IMG_PHOTO = 0;
const IMG_LOGO = 1;

function logoImage(uri?: string): { data: Buffer; type: "png" | "jpeg" } | null {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(uri ?? "");
  return m ? { data: Buffer.from(m[2], "base64"), type: m[1] as "png" | "jpeg" } : null;
}

function images(m: Model) {
  const photo = facultyImageBytes(LEAD_FACULTY);
  const list: NonNullable<PptDeck["images"]> = [];
  if (photo) list[IMG_PHOTO] = { data: Buffer.from(photo), type: "png" };
  const logo = logoImage(m.input.logoDataUri);
  if (logo) list[IMG_LOGO] = logo;
  return list;
}

/** The cover as shapes on the 1920×1080 grid. */
export function coverShapes(m: Model, variant: "A" | "B"): PptShape[] {
  const i = m.input;
  const P = resolveProfile(m);
  const imgs = images(m);
  const dark = variant === "A";
  const ink = dark ? "#ffffff" : P.primary;
  const soft = dark ? "#d9def0" : "#3a4766";
  const accentInk = lum(P.accent) > 0.55 ? (dark ? P.accent : darken(P.accent, 0.6)) : P.accent;
  const s: PptShape[] = [];
  // Header band with wordmark (and logo when supplied).
  s.push({ t: "rect", x: 0, y: 0, w: 1920, h: 112, fill: dark ? darken(P.primary, 0.75) : P.primary, name: "Header band" });
  let wx = 72;
  if (imgs[IMG_LOGO]) {
    s.push({ t: "image", x: 72, y: 24, w: 64, h: 64, image: IMG_LOGO, alt: `${P.institution} logo` });
    wx = 152;
  }
  s.push({ t: "text", x: wx, y: 22, w: 1180 - wx, h: 70, anchor: "ctr", name: "Wordmark", paras: [{ runs: [{ text: P.institution, color: "#ffffff", bold: true }, { text: `  |  ${excerpt(i.programTitle, 7)}`, color: P.accent }], size: 36 }] });
  s.push({ t: "text", x: 1240, y: 22, w: 608, h: 70, anchor: "ctr", name: "Draft label", paras: [{ text: DRAFT_LABEL, size: 20, color: "#ffffff", align: "r" }] });
  // Motto band.
  s.push({ t: "text", x: 0, y: 112, w: 1920, h: 58, fill: P.accent, anchor: "ctr", inset: 8, name: "Motto band", paras: [{ text: P.motto, size: 28, italic: true, color: P.primary, align: "ctr" }] });
  const [letters, digits] = twoTone(i.courseCode);
  const photo = fitSize(LEAD_FACULTY.photo, 190, 222);
  if (dark) {
    s.push({ t: "text", x: 96, y: 210, w: 1240, h: 140, name: "Course code", paras: [{ runs: [{ text: letters, color: ink }, { text: digits, color: accentInk }], size: 120, bold: true, font: "heading" }] });
    s.push({ t: "text", x: 96, y: 350, w: 1240, h: 64, name: "Course title", paras: [{ text: excerpt(i.courseTitle, 12), size: 40, color: soft }] });
    s.push({ t: "text", x: 96, y: 440, w: 1240, h: 80, fill: P.accent, anchor: "ctr", inset: 24, name: "Module banner", paras: [{ text: `MODULE ${pad2(i.moduleNumber)}  ·  ${excerpt(i.moduleTitle, 10)}`, size: 36, bold: true, color: P.primary }] });
    s.push({ t: "text", title: true, x: 96, y: 548, w: 1300, h: 300, name: "Topic title", paras: [{ text: excerpt(i.topicTitle, 16), size: 88, bold: true, color: ink, font: "heading" }] });
    s.push({ t: "rect", x: 1480, y: 230, w: 360, h: 470, fill: darken(P.primary, 0.85), line: P.accent, round: true, name: "Faculty card" });
    if (imgs[IMG_PHOTO]) s.push({ t: "image", x: 1660 - photo.width / 2, y: 270, w: photo.width, h: photo.height, image: IMG_PHOTO, alt: LEAD_FACULTY.photo.alt, line: P.accent, lineWidth: 3 });
    s.push({ t: "text", x: 1490, y: 270 + photo.height + 24, w: 340, h: 70, name: "Faculty name", paras: [{ text: LEAD_FACULTY.shortName, size: 30, bold: true, color: ink, align: "ctr" }] });
    s.push({ t: "text", x: 1490, y: 270 + photo.height + 94, w: 340, h: 110, name: "Faculty title", paras: [{ text: INSTRUCTOR_ROLE, size: 24, color: soft, align: "ctr" }] });
  } else {
    s.push({ t: "text", x: 72, y: 196, w: 1300, h: 110, name: "Course code", paras: [{ runs: [{ text: letters, color: ink }, { text: digits, color: accentInk }], size: 92, bold: true, font: "heading" }] });
    s.push({ t: "text", x: 72, y: 306, w: 1300, h: 54, name: "Course title", paras: [{ text: excerpt(i.courseTitle, 12), size: 34, color: soft }] });
    s.push({ t: "text", x: 72, y: 372, w: 1300, h: 66, fill: P.primary, anchor: "ctr", inset: 20, name: "Module banner", paras: [{ text: `MODULE ${pad2(i.moduleNumber)}  ·  ${excerpt(i.moduleTitle, 10)}`, size: 30, bold: true, color: "#ffffff" }] });
    s.push({ t: "text", title: true, x: 72, y: 452, w: 1300, h: 170, name: "Topic title", paras: [{ text: excerpt(i.topicTitle, 12), size: 64, bold: true, color: ink, font: "heading" }] });
    s.push({ t: "rect", x: 1440, y: 196, w: 408, h: 420, fill: "#ffffff", line: P.primary, round: true, name: "Faculty card" });
    if (imgs[IMG_PHOTO]) s.push({ t: "image", x: 1644 - photo.width / 2, y: 228, w: photo.width, h: photo.height, image: IMG_PHOTO, alt: LEAD_FACULTY.photo.alt, line: P.primary, lineWidth: 3 });
    s.push({ t: "text", x: 1452, y: 228 + photo.height + 18, w: 384, h: 60, name: "Faculty name", paras: [{ text: LEAD_FACULTY.shortName, size: 28, bold: true, color: ink, align: "ctr" }] });
    s.push({ t: "text", x: 1452, y: 228 + photo.height + 76, w: 384, h: 100, name: "Faculty title", paras: [{ text: INSTRUCTOR_ROLE, size: 22, color: soft, align: "ctr" }] });
    // Panels: key topics · process · outcomes checklist.
    const panel = (x: number, w: number, heading: string, paras: PptPara[], name: string) => {
      s.push({ t: "rect", x, y: 646, w, h: 268, fill: "#ffffff", line: "#c7ccda", round: true, name: `${name} panel` });
      s.push({ t: "text", x: x + 8, y: 654, w: w - 16, h: 252, name, inset: 16, paras: [{ text: heading, size: 26, bold: true, color: P.primary, spaceAfter: 6 }, ...paras] });
    };
    panel(72, 560, "Key topics", P.keyTopics.slice(0, 5).map((t) => ({ text: excerpt(t, 6), bullet: true, size: 22, color: "#1d2740" })), "Key topics");
    s.push({ t: "rect", x: 672, y: 646, w: 560, h: 268, fill: "#ffffff", line: "#c7ccda", round: true, name: "Process panel" });
    s.push({ t: "text", x: 680, y: 654, w: 544, h: 50, inset: 16, name: "Process heading", paras: [{ text: "How this module runs", size: 26, bold: true, color: P.primary }] });
    const steps = P.process.slice(0, 5);
    const cw = Math.floor((520 - (steps.length - 1) * 8) / Math.max(1, steps.length));
    steps.forEach((st, k) => {
      s.push({ t: "text", x: 692 + k * (cw + 8), y: 720, w: cw, h: 170, fill: k % 2 ? P.light : darken(P.light, 0.94), line: P.primary, round: true, anchor: "ctr", inset: 6, name: `Step ${k + 1}`, paras: [{ text: String(k + 1), size: 30, bold: true, color: accentInk, align: "ctr" }, { text: excerpt(st, 3), size: 20, color: "#1d2740", align: "ctr" }] });
    });
    panel(
      1272,
      576,
      "Outcomes checklist",
      m.los.slice(0, 4).map((l) => ({ text: `□  ${excerpt(l.text.replace(SUPPLEMENTAL, "").trim(), 9)}`, size: 20, color: "#1d2740", spaceAfter: 4 })),
      "Outcomes checklist",
    );
  }
  // Six-cell footer info bar.
  const fy = 940;
  s.push({ t: "rect", x: 0, y: fy, w: 1920, h: 140, fill: dark ? darken(P.primary, 0.75) : P.primary, name: "Footer bar" });
  P.footer.slice(0, 6).forEach((c, k) => {
    const x = k * 320;
    if (k) s.push({ t: "rect", x, y: fy + 24, w: 2, h: 92, fill: P.accent, name: `Divider ${k}` });
    s.push({ t: "text", x: x + 16, y: fy + 18, w: 288, h: 108, anchor: "ctr", name: `Footer ${c.label}`, paras: [{ text: c.label.toUpperCase(), size: 18, bold: true, color: P.accent }, { text: excerpt(c.value, 6), size: 24, color: "#ffffff" }] });
  });
  if (!i.designSamples) s.push({ t: "text", x: 72, y: dark ? 868 : 916, w: 1776, h: 24, inset: 0, name: "Provisional note", paras: [{ text: "Provisional Scholarion design — upload cover samples in the Course Studio to replace this layout.", size: 18, color: dark ? "#c9d1e6" : "#4a5672", align: "r" }] });
  return s;
}

/* ---------------- HTML from the same shapes ---------------- */

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function shapesHtml(shapes: PptShape[], imgUri: (k: number) => string | null, opts: { title: string; label: string; bg: string; fonts?: { heading: string; body: string } }) {
  const fonts = opts.fonts ?? { heading: "Georgia,'Source Serif 4',serif", body: "Arial,'Source Sans 3',sans-serif" };
  const box = (s: { x: number; y: number; w: number; h: number }) => `left:${Math.round(s.x)}px;top:${Math.round(s.y)}px;width:${Math.round(s.w)}px;height:${Math.round(s.h)}px`;
  const body = shapes
    .map((s) => {
      if (s.t === "rect") return `<div aria-hidden="true" style="position:absolute;${box(s)};background:${s.fill};${s.line ? `border:2px solid ${s.line};box-sizing:border-box;` : ""}${s.round ? "border-radius:16px;" : ""}"></div>`;
      if (s.t === "image") {
        const uri = imgUri(s.image);
        return uri ? `<img src="${uri}" alt="${esc(s.alt)}" width="${Math.round(s.w)}" height="${Math.round(s.h)}" style="position:absolute;${box(s)};object-fit:cover;object-position:top;${s.line ? `outline:${s.lineWidth ?? 3}px solid ${s.line};` : ""}border-radius:8px">` : "";
      }
      const align = (a?: string) => (a === "ctr" ? "center" : a === "r" ? "right" : "left");
      const justify = s.anchor === "ctr" ? "center" : s.anchor === "b" ? "flex-end" : "flex-start";
      const paras = s.paras
        .map((p, k) => {
          const tag = s.title && k === 0 ? "h1" : "p";
          const runs = (p.runs ?? [{ text: p.text ?? "" }]).map((r) => `<span style="color:${r.color ?? p.color ?? "#10192f"};${(r.bold ?? p.bold) ? "font-weight:700;" : ""}${(r.italic ?? p.italic) ? "font-style:italic;" : ""}">${esc(r.text)}</span>`).join("");
          return `<${tag} style="margin:0 0 ${p.spaceAfter ?? 2}px;font-size:${p.size ?? 32}px;line-height:1.15;text-align:${align(p.align)};font-family:${p.font === "heading" ? fonts.heading : fonts.body};font-weight:${p.bold ? 700 : 400}">${p.bullet ? "• " : ""}${runs}</${tag}>`;
        })
        .join("");
      return `<div style="position:absolute;${box(s)};padding:${s.inset ?? 12}px;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;justify-content:${justify};${s.fill ? `background:${s.fill};` : ""}${s.line ? `border:2px solid ${s.line};` : ""}${s.round ? "border-radius:16px;" : ""}">${paras}</div>`;
    })
    .join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)}</title><style>html,body{margin:0;background:#1a1a1a}.wrap{width:100%;overflow:hidden}.cv{position:relative;width:1920px;height:1080px;overflow:hidden;background:${opts.bg};transform-origin:top left}</style></head><body><div class="wrap"><section class="cv" aria-label="${esc(opts.label)}">
${body}
</section></div><script>(function(){var c=document.querySelector(".cv"),w=document.querySelector(".wrap");function f(){var k=Math.min(1,w.clientWidth/1920);c.style.transform="scale("+k+")";w.style.height=(1080*k)+"px"}f();addEventListener("resize",f)})()</script></body></html>`;
}

function imageUris(m: Model) {
  const imgs = images(m);
  return (k: number) => {
    const im = imgs[k];
    return im ? `data:image/${im.type};base64,${Buffer.from(im.data).toString("base64")}` : null;
  };
}

export function coverHtml(m: Model, variant: "A" | "B") {
  const i = m.input;
  const P = resolveProfile(m);
  return shapesHtml(coverShapes(m, variant), imageUris(m), { title: `${i.courseCode} Module ${pad2(i.moduleNumber)} — ${i.topicTitle} (cover ${variant})`, label: `Cover variant ${variant}`, bg: variant === "A" ? P.primary : P.light });
}

export function coverPptx(m: Model, variant: "A" | "B" = "A") {
  const P = resolveProfile(m);
  return toPptx({ title: `${m.input.courseCode} — ${m.input.topicTitle} (cover ${variant})`, author: P.institution, subject: DRAFT_LABEL, images: images(m), slides: [{ bg: variant === "A" ? P.primary : P.light, shapes: coverShapes(m, variant), name: `Cover ${variant}`, notes: `${DRAFT_LABEL} Cover variant ${variant}.` }] });
}

/** The 10-slide lecture deck as PowerPoint: cover A, then nine content slides with speaker notes. */
export function deckPptx(m: Model, slides: Slide[]) {
  const i = m.input;
  const P = resolveProfile(m);
  const content = (s: Slide): PptSlide => {
    const bullets = s.bullets.map(strip).filter(Boolean);
    const size = bullets.length > 4 || bullets.some((b) => b.length > 140) ? 30 : 36;
    return {
      bg: "#ffffff",
      name: s.title,
      notes: `${s.notes}\n\n${DRAFT_LABEL}`,
      shapes: [
        { t: "rect", x: 0, y: 0, w: 1920, h: 72, fill: P.primary, name: "Header band" },
        { t: "text", x: 72, y: 8, w: 1200, h: 56, anchor: "ctr", inset: 0, name: "Header", paras: [{ runs: [{ text: `${P.institution}  |  `, color: "#ffffff", bold: true }, { text: `${i.courseCode} · Module ${pad2(i.moduleNumber)}`, color: P.accent }], size: 24 }] },
        { t: "text", x: 1500, y: 8, w: 348, h: 56, anchor: "ctr", inset: 0, name: "Slide number", paras: [{ text: `${s.n} / ${slides.length}`, size: 24, color: "#ffffff", align: "r" }] },
        { t: "rect", x: 72, y: 214, w: 160, h: 8, fill: P.accent, name: "Accent rule" },
        { t: "text", title: true, x: 72, y: 100, w: 1776, h: 110, anchor: "b", name: "Title", paras: [{ text: s.title, size: 64, bold: true, color: P.primary, font: "heading" }] },
        { t: "text", x: 72, y: 250, w: 1776, h: 700, name: "Content", paras: bullets.map((b) => ({ text: b, bullet: true, size, color: "#1d2740", spaceAfter: 14 })) },
        { t: "text", x: 72, y: 1000, w: 1776, h: 50, anchor: "ctr", inset: 0, name: "Footer", paras: [{ text: `${excerpt(i.topicTitle, 10)}  ·  ${LEAD_FACULTY.shortName}  ·  ${DRAFT_LABEL}`, size: 20, color: "#4a5672" }] },
      ],
    };
  };
  const deck: PptDeck = {
    title: `${i.courseCode} Module ${pad2(i.moduleNumber)} — ${i.topicTitle}`,
    author: P.institution,
    subject: DRAFT_LABEL,
    images: images(m),
    slides: slides.map((s, k) => (k === 0 ? { bg: P.primary, name: "Cover", shapes: coverShapes(m, "A"), notes: `${s.notes}\n\n${DRAFT_LABEL}` } : content(s))),
  };
  return toPptx(deck);
}

export function coverNotes(m: Model) {
  const P = resolveProfile(m);
  const i = m.input;
  return `- Size: 1920×1080 (16:9). HTML and PowerPoint are drawn from the same layout, so they match.
- Variant A (dark): ${P.institution} wordmark, motto band ("${P.motto}"), two-tone course code (${twoTone(i.courseCode).join(" | ")}), module banner, topic title, ${LEAD_FACULTY.shortName} (${INSTRUCTOR_ROLE}) with the approved photograph, six-cell footer bar.
- Variant B (light): the same plus key topics (${P.keyTopics.slice(0, 5).join(", ") || "—"}), a process strip (${P.process.join(" → ")}) and an outcomes checklist.
- Footer bar: ${P.footer.map((c) => `${c.label}: ${c.value}`).join(" · ")}.
- Colours: primary ${P.primary}, accent ${P.accent}, light ${P.light}. ${i.profile ? "From the course branding profile." : "Scholarion defaults — set a course branding profile (studio.profile_set) to change them."}
- The photograph is shown at its original proportions and never upscaled or re-generated.
`;
}
