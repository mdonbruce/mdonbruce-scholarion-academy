/**
 * "Also as PDF · Word · Excel" links for a download. Every download route accepts
 * ?format=pdf|docx|xlsx and returns the same content in that format.
 */
export function withFormat(href: string, format: "pdf" | "docx" | "xlsx") {
  return `${href}${href.includes("?") ? "&" : "?"}format=${format}`;
}

export function Formats({ href, name, label = "Download as", skip }: { href: string; name: string; label?: string; skip?: "pdf" | "docx" | "xlsx" }) {
  const items = ([["pdf", "PDF"], ["docx", "Word"], ["xlsx", "Excel"]] as const).filter(([f]) => f !== skip);
  return (
    <span className="doc-formats small">
      {label}{" "}
      {items.map(([f, l], i) => (
        <span key={f}>
          {i > 0 && " · "}
          <a href={withFormat(href, f)} aria-label={`${name} as ${l}`} download>
            {l}
          </a>
        </span>
      ))}
    </span>
  );
}
