import type { AudioOverview, MindMapNode, StudioOutput } from "@/platform/types";

/** Accessible renderers for Studio study aids (learner module page and staff review). */

function MindMapTree({ node, depth = 0 }: { node: MindMapNode; depth?: number }) {
  return (
    <li>
      <span className={depth === 0 ? "mm-root" : depth === 1 ? "mm-branch" : "mm-leaf"}>{node.label}</span>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c, i) => (
            <MindMapTree key={`${c.label}-${i}`} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function StudioOutputView({ o }: { o: Pick<StudioOutput, "kind" | "content" | "title" | "id"> }) {
  if (o.kind === "flashcards") {
    return (
      <dl>
        {(o.content as { front: string; back: string }[]).map((f) => (
          <div key={f.front} style={{ marginBottom: 8 }}>
            <dt>
              <strong>{f.front}</strong>
            </dt>
            <dd style={{ margin: 0 }} className="muted">
              {f.back}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  if (o.kind === "audio_overview") {
    const a = o.content as AudioOverview;
    return (
      <div className="stack" style={{ ["--gap" as string]: "8px" }}>
        {a.audioUrl ? (
          <audio controls src={a.audioUrl} aria-label={`${o.title} audio`} />
        ) : (
          <p className="badge badge-amber" style={{ width: "fit-content" }}>
            {a.audioStatus}
          </p>
        )}
        <p className="tiny muted" style={{ margin: 0 }}>
          About {a.estimatedMinutes} min read aloud. Read the script below.
        </p>
        <ol className="audio-script">
          {a.script.map((l, i) => (
            <li key={i}>
              <strong>{l.speaker}:</strong> {l.text}
            </li>
          ))}
        </ol>
        <details className="acc">
          <summary>Plain-text transcript</summary>
          <pre className="tiny" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {a.transcript}
          </pre>
        </details>
      </div>
    );
  }
  if (o.kind === "mind_map") {
    const root = (o.content as { root: MindMapNode }).root;
    return (
      <div className="mind-map">
        <p className="tiny muted" style={{ margin: "0 0 6px" }}>
          Outline view: each level is nested under the topic it belongs to.
        </p>
        <ul aria-label={`${o.title} outline`}>
          <MindMapTree node={root} />
        </ul>
      </div>
    );
  }
  return (
    <>
      {(o.content as { sections: { heading: string; text: string }[] }).sections.map((s) => (
        <p key={s.heading}>
          <strong>{s.heading}.</strong> {s.text}
        </p>
      ))}
    </>
  );
}
