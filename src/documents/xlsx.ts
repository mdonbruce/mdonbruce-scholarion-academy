import { clean, type Block, type Doc, xml } from "./model";
import { zipDeflate } from "./zip";

/**
 * Excel (.xlsx, SpreadsheetML) writer. Every table becomes its own sheet with a bold, frozen,
 * filterable header row; numbers are stored as numbers. Documents that are more than a table also
 * get a "Document" sheet with the full text in reading order, one block per row.
 */
interface Sheet {
  name: string;
  rows: { cells: string[]; style?: "title" | "head" | "h" | "small" }[];
  table?: { headRow: number; cols: number; lastRow: number };
  widths: number[];
}

const NUM = /^-?(0|[1-9]\d{0,14})(\.\d+)?$/;
const colName = (i: number) => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

function sheetName(raw: string, used: Set<string>) {
  const base = clean(raw).replace(/[\[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 28) || "Sheet";
  let n = base;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 27 - String(i).length)} ${i}`;
  used.add(n.toLowerCase());
  return n;
}

export function sheetsOf(doc: Doc): Sheet[] {
  const used = new Set<string>();
  const tables = doc.blocks.filter((b): b is Extract<Block, { t: "table" }> => b.t === "table");
  const prose = doc.blocks.filter((b) => b.t !== "table" && b.t !== "hr" && !(b.t === "h" && b.text === doc.title));
  const sheets: Sheet[] = [];
  const names = new Map<Block, string>();
  if (prose.length || !tables.length) {
    const s: Sheet = { name: sheetName("Document", used), rows: [{ cells: [doc.title], style: "title" }], widths: [100] };
    if (doc.subtitle) s.rows.push({ cells: [doc.subtitle], style: "small" });
    let lastHeading = "";
    for (const b of doc.blocks) {
      if (b.t === "h") {
        lastHeading = b.text;
        if (b.text !== doc.title) s.rows.push({ cells: [b.text], style: "h" });
      } else if (b.t === "p") s.rows.push({ cells: [b.text], style: b.small ? "small" : undefined });
      else if (b.t === "list") b.items.forEach((it, i) => s.rows.push({ cells: [`${b.ordered && !it.startsWith("– ") ? `${i + 1}.` : it.startsWith("– ") ? "    –" : "•"} ${it.replace(/^– /, "")}`] }));
      else if (b.t === "code") s.rows.push(...b.text.split("\n").map((l) => ({ cells: [l] })));
      else if (b.t === "table") s.rows.push({ cells: [`Table: ${b.caption ?? lastHeading ?? "data"} — see the sheet "${tableName(b, lastHeading)}"`], style: "small" });
    }
    sheets.push(s);
  }
  function tableName(b: Extract<Block, { t: "table" }>, heading: string) {
    if (!names.has(b)) names.set(b, sheetName(b.caption || heading || `Table ${names.size + 1}`, used));
    return names.get(b)!;
  }
  let heading = "";
  for (const b of doc.blocks) {
    if (b.t === "h") heading = b.text;
    if (b.t !== "table") continue;
    const cols = Math.max(1, b.head.length);
    const s: Sheet = { name: tableName(b, heading), rows: [], widths: [] };
    s.rows.push({ cells: b.head, style: "head" });
    for (const r of b.rows) s.rows.push({ cells: Array.from({ length: cols }, (_x, i) => r[i] ?? "") });
    s.table = { headRow: 1, cols, lastRow: s.rows.length };
    s.widths = Array.from({ length: cols }, (_x, i) => Math.min(60, Math.max(8, ...s.rows.slice(0, 300).map((r) => clean(r.cells[i] ?? "").split("\n").reduce((m, l) => Math.max(m, l.length), 0) + 2))));
    sheets.push(s);
  }
  return sheets;
}

const STYLE_ID = { title: 1, head: 2, h: 3, small: 4 } as const;

function sheetXml(s: Sheet, footer: string) {
  const rows = s.rows
    .map((r, ri) => {
      const cells = r.cells
        .map((v, ci) => {
          const ref = `${colName(ci)}${ri + 1}`;
          const st = r.style ? STYLE_ID[r.style] : s.table ? 6 : 5;
          const val = clean(v);
          if (!r.style && s.table && NUM.test(val.trim())) return `<c r="${ref}" s="7"><v>${val.trim()}</v></c>`;
          return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xml(val.slice(0, 32000))}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const cols = s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const freeze = s.table ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>` : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const filter = s.table && s.table.lastRow > 1 ? `<autoFilter ref="A1:${colName(s.table.cols - 1)}${s.table.lastRow}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}<sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${rows}</sheetData>${filter}<pageMargins left="0.6" right="0.6" top="0.7" bottom="0.7" header="0.3" footer="0.3"/><pageSetup orientation="${s.table && s.table.cols > 5 ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>${xml(`&L${footer.replace(/&/g, "&&")}&RPage &P of &N`)}</oddFooter></headerFooter></worksheet>`;
}

export async function toXlsx(doc: Doc): Promise<Buffer> {
  const sheets = sheetsOf(doc);
  const footer = (doc.footer ?? doc.title).slice(0, 80);
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="5"><font><sz val="11"/><color rgb="FF10192F"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="16"/><color rgb="FF0B1F4D"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FF0B1F4D"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="13"/><color rgb="FF13306E"/><name val="Calibri"/><family val="2"/></font><font><sz val="9"/><color rgb="FF4A5672"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF0FA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFC7CCDA"/></left><right style="thin"><color rgb="FFC7CCDA"/></right><top style="thin"><color rgb="FFC7CCDA"/></top><bottom style="thin"><color rgb="FFC7CCDA"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const files: { name: string; data: string }[] = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${(() => {
      const defs = sheets.map((s, i) => (s.table && s.table.lastRow > 1 ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(s.name.replace(/'/g, "''"))}'!$A$1:$${colName(s.table.cols - 1)}$${s.table.lastRow}</definedName>` : "")).join("");
      return defs ? `<definedNames>${defs}</definedNames>` : "";
    })()}</workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: styles },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s, footer) })),
    { name: "docProps/core.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(doc.title)}</dc:title><dc:creator>${xml(doc.author ?? "Scholaris AI Academy")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>` },
  ];
  return zipDeflate(files);
}
