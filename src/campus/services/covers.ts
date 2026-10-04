import { CampusError, type TenantStore } from "../core";
import type { ProgramSpec } from "../academy/programs-data";
import { fitSize, LEAD_FACULTY } from "../../brand/faculty";
import { facultyDataUri } from "../../brand/faculty-assets";

/**
 * Lecture cover slides and video title cards (16:9, self-contained HTML, printable) built from
 * the program design. They carry the approved faculty photograph — the original file, embedded
 * at its own size or smaller, never stretched or regenerated — with the name and Scholarion
 * Academy branding.
 */

export type CoverKind = "slide" | "title-card";
const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function coverData(store: TenantStore, offeringId: string, week: string) {
  const page = store.list("program_pages", (p) => p.offeringId === offeringId)[0];
  if (!page) throw new CampusError("not_found", "Program not found", 404);
  const spec = page.spec as ProgramSpec;
  const wk = spec.curriculum.find((w) => w.week === week);
  if (!wk) throw new CampusError("not_found", `Week ${week} isn't in ${spec.code}.`, 404);
  const unit = spec.selfPaced ? "Module" : spec.formatKind === "live_weekend" ? "Weekend" : "Week";
  return { code: spec.code, program: spec.title, unit: `${unit} ${wk.week}`, title: wk.title, focus: wk.focus };
}

export function coverHtml(store: TenantStore, offeringId: string, week: string, kind: CoverKind) {
  const d = coverData(store, offeringId, week);
  const f = LEAD_FACULTY;
  const uri = facultyDataUri(f) ?? f.photo.src;
  const size = fitSize(f.photo, kind === "slide" ? 160 : 140, f.photo.height);
  const photo = `<img class="photo" src="${uri}" width="${size.width}" height="${size.height}" alt="${esc(f.photo.alt)}">`;
  const dark = kind === "title-card";
  const body = kind === "slide"
    ? `<div class="bar"><span class="brand">Scholarion Academy</span><span>Program ${esc(d.code)} · ${esc(d.program)}</span></div>
<main><p class="unit">${esc(d.unit)}</p><h1>${esc(d.title)}</h1><p class="focus">${esc(d.focus)}</p></main>
<footer>${photo}<div><p class="name">${esc(f.name)}</p><p class="role">${esc(f.role)}, ${esc(f.org)}</p></div></footer>`
    : `<main class="tc">${photo}<div><p class="brand">Scholarion Academy</p><h1>${esc(d.title)}</h1><p class="unit">${esc(d.unit)} · Program ${esc(d.code)} ${esc(d.program)}</p><p class="name">${esc(f.name)}</p><p class="role">${esc(f.role)}, ${esc(f.org)}</p></div></main>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.unit)}: ${esc(d.title)} — ${kind === "slide" ? "Lecture cover" : "Video title card"}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;background:#e9edf5}
.frame{width:min(100vw,177.78vh);aspect-ratio:16/9;margin:0 auto;display:flex;flex-direction:column;background:${dark ? "#0b1f4d" : "#ffffff"};color:${dark ? "#ffffff" : "#0f1a33"};font:16px/1.4 "Source Sans 3","Segoe UI",system-ui,sans-serif;overflow:hidden}
.bar{display:flex;justify-content:space-between;gap:16px;padding:2.2% 4%;background:#0b1f4d;color:#fff;font-size:clamp(11px,1.4vw,18px)}
.brand{font-weight:700;letter-spacing:.04em;color:${dark ? "#f2c66d" : "#f2c66d"}}
main{flex:1;display:flex;flex-direction:column;justify-content:center;padding:0 6%}
h1{font:700 clamp(22px,4.6vw,60px)/1.1 "Source Serif 4",Georgia,serif;margin:.2em 0}
.unit{text-transform:uppercase;letter-spacing:.12em;font-weight:700;color:${dark ? "#c9d4f0" : "#1b3a8a"};margin:0;font-size:clamp(11px,1.4vw,18px)}
.focus{max-width:60ch;color:#4a5672;font-size:clamp(12px,1.6vw,20px);margin:0}
footer{display:flex;align-items:center;gap:16px;padding:2% 6% 3%;border-top:4px solid #b8861f}
.photo{display:block;height:auto;max-width:100%;border-radius:8px;object-fit:contain}
.name{font-weight:700;margin:0;font-size:clamp(12px,1.6vw,20px)}.role{margin:0;color:${dark ? "#c9d4f0" : "#4a5672"};font-size:clamp(11px,1.3vw,17px)}
.tc{flex-direction:row;align-items:center;gap:5%}.tc .brand{margin:0 0 .4em;font-size:clamp(12px,1.6vw,20px)}
@media print{html,body{background:#fff}.frame{width:100%}}
</style></head><body><div class="frame">${body}</div></body></html>`;
}
