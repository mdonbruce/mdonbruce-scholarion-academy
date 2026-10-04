import { clean } from "./model";
import { zipDeflate } from "./zip";

/**
 * A small, dependency-free PowerPoint (.pptx, Office Open XML) writer. Slides are laid out on a
 * 1920×1080 pixel grid (16:9, 13.333×7.5 in; 1 px = 6350 EMU) from rectangles, text boxes and
 * pictures, with speaker notes per slide. Every slide's first text box is its title placeholder so
 * screen readers and the outline view get a real slide title. Images keep the size you give them —
 * callers pass proportional sizes (the approved faculty photo is never stretched).
 */

export interface PptRun {
  text: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
}
export interface PptPara {
  text?: string;
  runs?: PptRun[];
  size?: number; // px on the 1920×1080 grid (1 px = 0.5 pt)
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: "l" | "ctr" | "r";
  bullet?: boolean;
  font?: "heading" | "body";
  spaceAfter?: number; // px
}
export type PptShape =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill: string; line?: string; round?: boolean; name?: string }
  | { t: "text"; x: number; y: number; w: number; h: number; paras: PptPara[]; title?: boolean; fill?: string; line?: string; anchor?: "t" | "ctr" | "b"; inset?: number; name?: string; round?: boolean }
  | { t: "image"; x: number; y: number; w: number; h: number; image: number; alt: string; line?: string; lineWidth?: number };
export interface PptSlide {
  shapes: PptShape[];
  notes?: string;
  bg?: string;
  name?: string;
}
export interface PptDeck {
  title: string;
  author?: string;
  subject?: string;
  slides: PptSlide[];
  images?: { data: Buffer | Uint8Array; type: "png" | "jpeg" }[];
  fonts?: { heading: string; body: string };
}

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const EMU = 6350;
const W = 1920;
const H = 1080;
const e = (px: number) => Math.round(px * EMU);
const x = (s: unknown) => clean(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const hex = (c?: string, d = "000000") => (c ?? d).replace(/^#/, "").toUpperCase().slice(0, 6).padEnd(6, "0");

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const rels = (items: [string, string, string][]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type.startsWith("http") ? type : `${REL}/${type}`}" Target="${target}"/>`).join("")}</Relationships>`;

function runXml(r: PptRun, p: PptPara, fonts: { heading: string; body: string }) {
  const sz = Math.max(100, Math.round((p.size ?? 32) * 50));
  const bold = r.bold ?? p.bold;
  const italic = r.italic ?? p.italic;
  const face = p.font === "heading" ? fonts.heading : fonts.body;
  return `<a:r><a:rPr lang="en-US" sz="${sz}"${bold ? ' b="1"' : ""}${italic ? ' i="1"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${hex(r.color ?? p.color, "10192F")}"/></a:solidFill><a:latin typeface="${x(face)}"/><a:cs typeface="${x(face)}"/></a:rPr><a:t>${x(r.text)}</a:t></a:r>`;
}
function paraXml(p: PptPara, fonts: { heading: string; body: string }) {
  const runs = p.runs ?? [{ text: p.text ?? "" }];
  const ppr = `<a:pPr algn="${p.align ?? "l"}"${p.bullet ? ' marL="342900" indent="-342900"' : ""}>${p.spaceAfter ? `<a:spcAft><a:spcPts val="${Math.round(p.spaceAfter * 50)}"/></a:spcAft>` : ""}${p.bullet ? `<a:buFont typeface="Arial"/><a:buChar char="•"/>` : "<a:buNone/>"}</a:pPr>`;
  const sz = Math.round((p.size ?? 32) * 50);
  return `<a:p>${ppr}${runs.filter((r) => r.text !== "").map((r) => runXml(r, p, fonts)).join("")}<a:endParaRPr lang="en-US" sz="${sz}" dirty="0"/></a:p>`;
}
const geom = (round?: boolean) => `<a:prstGeom prst="${round ? "roundRect" : "rect"}"><a:avLst/></a:prstGeom>`;
const lineXml = (c?: string, wpx = 2) => (c ? `<a:ln w="${e(wpx)}"><a:solidFill><a:srgbClr val="${hex(c)}"/></a:solidFill></a:ln>` : "<a:ln><a:noFill/></a:ln>");
const xfrm = (s: { x: number; y: number; w: number; h: number }) => `<a:xfrm><a:off x="${e(s.x)}" y="${e(s.y)}"/><a:ext cx="${e(s.w)}" cy="${e(s.h)}"/></a:xfrm>`;

function shapeXml(s: PptShape, id: number, imageRel: (i: number) => string, fonts: { heading: string; body: string }) {
  if (s.t === "rect") {
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${x(s.name ?? `Shape ${id}`)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(s)}${geom(s.round)}<a:solidFill><a:srgbClr val="${hex(s.fill)}"/></a:solidFill>${lineXml(s.line)}</p:spPr></p:sp>`;
  }
  if (s.t === "image") {
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}" descr="${x(s.alt)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${imageRel(s.image)}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(s)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${s.line ? lineXml(s.line, s.lineWidth ?? 4) : ""}</p:spPr></p:pic>`;
  }
  const inset = e(s.inset ?? 12);
  const ph = s.title ? '<p:nvPr><p:ph type="title"/></p:nvPr>' : "<p:nvPr/>";
  const fill = s.fill ? `<a:solidFill><a:srgbClr val="${hex(s.fill)}"/></a:solidFill>` : "<a:noFill/>";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${x(s.name ?? (s.title ? "Title" : `TextBox ${id}`))}"/><p:cNvSpPr${s.title ? "" : ' txBox="1"'}/>${ph}</p:nvSpPr><p:spPr>${xfrm(s)}${geom(s.round)}${fill}${lineXml(s.line)}</p:spPr><p:txBody><a:bodyPr wrap="square" lIns="${inset}" tIns="${inset}" rIns="${inset}" bIns="${inset}" anchor="${s.anchor ?? "t"}" rtlCol="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>${s.paras.map((p) => paraXml(p, fonts)).join("")}</p:txBody></p:sp>`;
}

const THEME = (name: string, fonts: { heading: string; body: string }) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${x(name)}"><a:themeElements><a:clrScheme name="Scholarion"><a:dk1><a:srgbClr val="10192F"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="0B1F4D"/></a:dk2><a:lt2><a:srgbClr val="F7F5EF"/></a:lt2><a:accent1><a:srgbClr val="0B1F4D"/></a:accent1><a:accent2><a:srgbClr val="F2C66D"/></a:accent2><a:accent3><a:srgbClr val="2F6FDB"/></a:accent3><a:accent4><a:srgbClr val="1F8A70"/></a:accent4><a:accent5><a:srgbClr val="9A6B00"/></a:accent5><a:accent6><a:srgbClr val="6B7A99"/></a:accent6><a:hlink><a:srgbClr val="2F6FDB"/></a:hlink><a:folHlink><a:srgbClr val="6B4FBB"/></a:folHlink></a:clrScheme><a:fontScheme name="Scholarion"><a:majorFont><a:latin typeface="${x(fonts.heading)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${x(fonts.body)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;

const CLRMAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
const EMPTY_TREE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const TITLE_PH = (id: number) => `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Title Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${e(96)}" y="${e(60)}"/><a:ext cx="${e(W - 192)}" cy="${e(140)}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp>`;

const MASTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${EMPTY_TREE}${TITLE_PH(2)}</p:spTree></p:cSld>${CLRMAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/></a:defRPr></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2400"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`;
const LAYOUT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout ${NS} type="titleOnly" preserve="1"><p:cSld name="Title Only"><p:spTree>${EMPTY_TREE}${TITLE_PH(2)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
const NOTES_MASTER = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${EMPTY_TREE}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="381000" y="685800"/><a:ext cx="6096000" cy="3429000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4343400"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld>${CLRMAP}<p:notesStyle><a:lvl1pPr><a:defRPr sz="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`;

function notesXml(text: string) {
  const paras = String(text ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const body = (paras.length ? paras : [""]).map((l) => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${x(l)}</a:t></a:r></a:p>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes ${NS}><p:cSld><p:spTree>${EMPTY_TREE}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

export function toPptx(deck: PptDeck, when = new Date()): Buffer {
  const fonts = deck.fonts ?? { heading: "Georgia", body: "Arial" };
  const images = deck.images ?? [];
  const n = deck.slides.length;
  if (!n) throw new Error("A presentation needs at least one slide.");
  const files: { name: string; data: Buffer | string }[] = [];
  const add = (name: string, data: Buffer | string) => files.push({ name, data });

  const ct = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="png" ContentType="image/png"/>',
    '<Default Extension="jpeg" ContentType="image/jpeg"/>',
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>',
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    '<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>',
    '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>',
    '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
  ];
  for (let i = 1; i <= n; i++) {
    ct.push(`<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
    ct.push(`<Override PartName="/ppt/notesSlides/notesSlide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`);
  }
  add("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${ct.join("")}</Types>`);
  add("_rels/.rels", rels([
    ["rId1", "officeDocument", "ppt/presentation.xml"],
    ["rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"],
    ["rId3", "extended-properties", "docProps/app.xml"],
  ]));
  const iso = when.toISOString().replace(/\.\d+Z$/, "Z");
  add("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${x(deck.title)}</dc:title>${deck.subject ? `<dc:subject>${x(deck.subject)}</dc:subject>` : ""}<dc:creator>${x(deck.author ?? "Scholarion Academy")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`);
  add("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Scholarion Studio</Application><Slides>${n}</Slides><Notes>${n}</Notes><PresentationFormat>Widescreen</PresentationFormat></Properties>`);

  // presentation
  const pr: [string, string, string][] = [["rId1", "slideMaster", "slideMasters/slideMaster1.xml"], ["rId2", "notesMaster", "notesMasters/notesMaster1.xml"], ["rId3", "theme", "theme/theme1.xml"], ["rId4", "presProps", "presProps.xml"], ["rId5", "viewProps", "viewProps.xml"], ["rId6", "tableStyles", "tableStyles.xml"]];
  for (let i = 1; i <= n; i++) pr.push([`rId${10 + i}`, "slide", `slides/slide${i}.xml`]);
  add("ppt/_rels/presentation.xml.rels", rels(pr));
  add("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="rId2"/></p:notesMasterIdLst><p:sldIdLst>${deck.slides.map((_s, i) => `<p:sldId id="${256 + i}" r:id="rId${11 + i}"/>`).join("")}</p:sldIdLst><p:sldSz cx="${e(W)}" cy="${e(H)}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr lang="en-US"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>`);
  add("ppt/presProps.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:presentationPr ${NS}/>`);
  add("ppt/viewProps.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="80000"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`);
  add("ppt/tableStyles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`);
  add("ppt/theme/theme1.xml", THEME("Scholarion", fonts));
  add("ppt/theme/theme2.xml", THEME("Scholarion Notes", fonts));
  add("ppt/slideMasters/slideMaster1.xml", MASTER);
  add("ppt/slideMasters/_rels/slideMaster1.xml.rels", rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "theme", "../theme/theme1.xml"]]));
  add("ppt/slideLayouts/slideLayout1.xml", LAYOUT);
  add("ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels([["rId1", "slideMaster", "../slideMasters/slideMaster1.xml"]]));
  add("ppt/notesMasters/notesMaster1.xml", NOTES_MASTER);
  add("ppt/notesMasters/_rels/notesMaster1.xml.rels", rels([["rId1", "theme", "../theme/theme2.xml"]]));
  images.forEach((im, i) => add(`ppt/media/image${i + 1}.${im.type}`, Buffer.from(im.data)));

  deck.slides.forEach((s, idx) => {
    const i = idx + 1;
    const used = [...new Set(s.shapes.filter((sh): sh is Extract<PptShape, { t: "image" }> => sh.t === "image").map((sh) => sh.image))];
    for (const u of used) if (!images[u]) throw new Error(`Slide ${i} refers to a missing image #${u}.`);
    const imageRel = (k: number) => `rId${10 + used.indexOf(k)}`;
    const bg = s.bg ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex(s.bg)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` : "";
    // Title placeholder first in reading order.
    const ordered = [...s.shapes.filter((sh) => sh.t === "text" && sh.title), ...s.shapes.filter((sh) => !(sh.t === "text" && sh.title))];
    const tree = ordered.map((sh, k) => shapeXml(sh, k + 2, imageRel, fonts)).join("");
    add(`ppt/slides/slide${i}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld ${NS}><p:cSld${s.name ? ` name="${x(s.name)}"` : ""}>${bg}<p:spTree>${EMPTY_TREE}${tree}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    add(`ppt/slides/_rels/slide${i}.xml.rels`, rels([["rId1", "slideLayout", "../slideLayouts/slideLayout1.xml"], ["rId2", "notesSlide", `../notesSlides/notesSlide${i}.xml`], ...used.map((u, k) => [`rId${10 + k}`, "image", `../media/image${u + 1}.${images[u].type}`] as [string, string, string])]));
    add(`ppt/notesSlides/notesSlide${i}.xml`, notesXml(s.notes ?? ""));
    add(`ppt/notesSlides/_rels/notesSlide${i}.xml.rels`, rels([["rId1", "notesMaster", "../notesMasters/notesMaster1.xml"], ["rId2", "slide", `../slides/slide${i}.xml`]]));
  });
  return zipDeflate(files, when);
}

/** Read speaker notes back out of a .pptx (used by tests and the preview). */
export function pptxNotes(files: { name: string; data: Buffer }[]): string[] {
  return files
    .filter((f) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(f.name))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a.name)![1]) - Number(/(\d+)\.xml$/.exec(b.name)![1]))
    .map((f) => [...f.data.toString("utf8").matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join("\n"));
}
