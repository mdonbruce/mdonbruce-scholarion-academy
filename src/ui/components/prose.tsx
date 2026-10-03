import type { ReactNode } from "react";

/**
 * Renders article text safely (no HTML injection): blank-line paragraphs, "## " headings,
 * "- " bullet lists, **bold** and [text](https-or-site-relative-url) links.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      const href = m[2];
      const ok = /^https:\/\//.test(href) || (href.startsWith("/") && !href.startsWith("//"));
      out.push(
        ok ? (
          <a key={`${keyBase}-${k++}`} href={href} {...(href.startsWith("http") ? { rel: "noopener noreferrer nofollow", target: "_blank" } : {})}>
            {m[1]}
          </a>
        ) : (
          m[1]
        ),
      );
    } else if (m[3]) out.push(<strong key={`${keyBase}-${k++}`}>{m[3]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Prose({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        const t = b.trim();
        if (!t) return null;
        if (t.startsWith("## ")) return <h2 key={i}>{inline(t.slice(3), `h${i}`)}</h2>;
        const lines = t.split("\n");
        if (lines.every((l) => /^\s*-\s+/.test(l)))
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*-\s+/, ""), `l${i}-${j}`)}</li>
              ))}
            </ul>
          );
        return <p key={i}>{inline(lines.join(" "), `p${i}`)}</p>;
      })}
    </div>
  );
}
