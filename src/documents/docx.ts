import { clean, type Block, type Doc, xml } from "./model";
import { zipDeflate } from "./zip";

/**
 * Word (.docx, Office Open XML) writer. Real heading styles (navigable and screen-reader friendly),
 * bulleted and numbered lists, tables with a repeating header row, code in a monospace style,
 * document properties and a footer with page numbers.
 */
const run = (t: string, rPr = "") => {
  const parts = clean(t).split("\n");
  return parts.map((p, i) => `${i ? "<w:r><w:br/></w:r>" : ""}<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${xml(p)}</w:t></w:r>`).join("");
};
const para = (t: string, style?: string, extra = "", rPr = "") => `<w:p>${style || extra ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}</w:pPr>` : ""}${run(t, rPr)}</w:p>`;

export async function toDocx(doc: Doc): Promise<Buffer> {
  const body: string[] = [];
  const nums: string[] = [];
  let numId = 1; // 1 = bullets
  body.push(para(doc.title, "Title"));
  if (doc.subtitle) body.push(para(doc.subtitle, "Subtitle"));
  for (const b of doc.blocks) body.push(block(b));

  function block(b: Block): string {
    switch (b.t) {
      case "h":
        return para(b.text, `Heading${b.level}`);
      case "p":
        return para(b.text, b.small ? "Small" : undefined);
      case "hr":
        return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C7CCDA"/></w:pBdr></w:pPr></w:p>`;
      case "code":
        return b.text.split("\n").map((l) => para(l || " ", "Code")).join("");
      case "list": {
        let id = 1;
        if (b.ordered) {
          id = ++numId;
          nums.push(`<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`);
        }
        return b.items
          .map((it) => {
            const nested = it.startsWith("– ");
            return para(nested ? it.slice(2) : it, "ListParagraph", `<w:numPr><w:ilvl w:val="${nested ? 1 : 0}"/><w:numId w:val="${nested ? 1 : id}"/></w:numPr>`);
          })
          .join("");
      }
      case "table": {
        const cols = Math.max(1, b.head.length);
        const tw = Math.floor(9360 / cols);
        const cell = (v: string, head: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${tw}" w:type="dxa"/>${head ? '<w:shd w:val="clear" w:color="auto" w:fill="EAF0FA"/>' : ""}</w:tcPr>${para(v ?? "", "TableText", "", head ? "<w:b/>" : "")}</w:tc>`;
        const row = (r: string[], head: boolean) => `<w:tr>${head ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : '<w:trPr><w:cantSplit/></w:trPr>'}${Array.from({ length: cols }, (_x, i) => cell(r[i] ?? "", head)).join("")}</w:tr>`;
        return `${b.caption ? para(b.caption, "Caption") : ""}<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>${b.caption ? `<w:tblCaption w:val="${xml(b.caption)}"/>` : ""}</w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${tw}"/>`).join("")}</w:tblGrid>${row(b.head, true)}${b.rows.map((r) => row(r, false)).join("")}</w:tbl>${para("")}`;
      }
    }
  }

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body.join("")}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1260" w:right="1260" w:bottom="1260" w:left="1260" w:header="720" w:footer="560" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${W}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="9720"/></w:tabs></w:pPr>${run((doc.footer ?? doc.title).slice(0, 90))}<w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">Page </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t xml:space="preserve"> of </w:t></w:r><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
  const style = (id: string, name: string, ppr: string, rpr: string, extra = "") => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra}<w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:rPr><w:color w:val="10192F"/></w:rPr></w:style>
${style("Title", "Title", '<w:pBdr><w:top w:val="single" w:sz="24" w:space="8" w:color="0B1F4D"/></w:pBdr><w:spacing w:after="80"/>', '<w:b/><w:color w:val="0B1F4D"/><w:sz w:val="40"/>')}
${style("Subtitle", "Subtitle", '<w:spacing w:after="240"/>', '<w:color w:val="4A5672"/><w:sz w:val="24"/>')}
${style("Heading1", "heading 1", '<w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/>', '<w:b/><w:color w:val="0B1F4D"/><w:sz w:val="32"/>')}
${style("Heading2", "heading 2", '<w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="1"/>', '<w:b/><w:color w:val="13306E"/><w:sz w:val="26"/>')}
${style("Heading3", "heading 3", '<w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="2"/>', '<w:b/><w:color w:val="13306E"/><w:sz w:val="23"/>')}
${style("ListParagraph", "List Paragraph", '<w:spacing w:after="40"/><w:ind w:left="720"/><w:contextualSpacing/>', "")}
${style("Code", "Code", '<w:shd w:val="clear" w:color="auto" w:fill="F4F6FB"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/>')}
${style("Caption", "caption", '<w:keepNext/><w:spacing w:before="120" w:after="60"/>', '<w:b/><w:color w:val="4A5672"/><w:sz w:val="20"/>')}
${style("TableText", "Table Text", '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', '<w:sz w:val="19"/>')}
${style("Small", "Small", "", '<w:color w:val="4A5672"/><w:sz w:val="18"/>')}
${style("Footer", "footer", "", '<w:color w:val="4A5672"/><w:sz w:val="16"/>')}
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="C7CCDA"/><w:left w:val="single" w:sz="4" w:space="0" w:color="C7CCDA"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="C7CCDA"/><w:right w:val="single" w:sz="4" w:space="0" w:color="C7CCDA"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="C7CCDA"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="C7CCDA"/></w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
  const lvl = (i: number, fmt: string, txt: string, font = "") => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${txt}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + i * 360}" w:hanging="360"/></w:pPr>${font}</w:lvl>`;
  const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, "bullet", "•", '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>')}${lvl(1, "bullet", "–", '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>')}</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, "decimal", "%1.")}${lvl(1, "lowerLetter", "%2.")}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>${nums.join("")}</w:numbering>`;
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(doc.title)}</dc:title><dc:subject>${xml(doc.subject ?? "")}</dc:subject><dc:creator>${xml(doc.author ?? "Scholaris AI Academy")}</dc:creator><dc:language>en-US</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  const files = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
    { name: "word/_rels/document.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>` },
    { name: "word/document.xml", data: document },
    { name: "word/styles.xml", data: styles },
    { name: "word/numbering.xml", data: numbering },
    { name: "word/footer1.xml", data: footer },
    { name: "docProps/core.xml", data: core },
    { name: "docProps/app.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Scholarion</Application></Properties>` },
  ];
  return zipDeflate(files);
}
