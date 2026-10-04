import { readinessQuestions, readinessScore } from "../../services/readiness";

/** Public advisory self-check (ported from the Python service). Scored on the server from the query; nothing is stored. */
export function ReadinessView({ slug, sp }: { slug: string; sp: Record<string, string | undefined> }) {
  const q = readinessQuestions();
  const answered = q.questions.every((x) => sp[`q${x.id}`] !== undefined) && (sp.goal === "agents" || sp.goal === "data");
  let result: ReturnType<typeof readinessScore> | null = null;
  try {
    result = answered ? readinessScore(q.questions.map((x) => Number(sp[`q${x.id}`])), sp.goal) : null;
  } catch {
    result = null;
  }
  return (
    <article className="stack">
      <h1 className="page-title">Where should I start? A 10-question self-check</h1>
      <p className="notice notice-info small">{q.notice}</p>
      {result && (
        <section className="card card-pad stack" aria-labelledby="rd-res" aria-live="polite">
          <h2 id="rd-res" className="card-title">
            {result.score} of {result.total} correct
          </h2>
          <p>
            Suggested starting point: {result.recommendedPrograms.map((n) => `#${n}`).join(", then ")}. {result.reason}
          </p>
          <ul className="small">
            {Object.entries(result.domains).map(([d, v]) => (
              <li key={d}>
                {d === "api" ? "APIs" : d.charAt(0).toUpperCase() + d.slice(1)}: {v.correct} of {v.total}
              </li>
            ))}
          </ul>
          <details>
            <summary>Explanations</summary>
            <ol className="small">
              {result.feedback.map((f) => (
                <li key={f.id}>
                  {f.correct ? "Correct. " : "Not quite. "}
                  {f.explanation}
                </li>
              ))}
            </ol>
          </details>
          <p>
            <a className="btn btn-outline btn-sm" href={`/campus/${slug}/programs`}>
              Browse programs
            </a>
          </p>
        </section>
      )}
      <form method="get" action={`/campus/${slug}/readiness`} className="stack">
        <fieldset>
          <legend>Your goal</legend>
          <label>
            <input type="radio" name="goal" value="agents" defaultChecked={sp.goal !== "data"} required /> Build AI agents and applications
          </label>
          <label>
            <input type="radio" name="goal" value="data" defaultChecked={sp.goal === "data"} /> Work with data and models
          </label>
        </fieldset>
        {q.questions.map((x) => (
          <fieldset key={x.id}>
            <legend>
              {x.id}. {x.prompt}
            </legend>
            {x.options.map((o, i) => (
              <label key={o}>
                <input type="radio" name={`q${x.id}`} value={i} required defaultChecked={sp[`q${x.id}`] === String(i)} /> {o}
              </label>
            ))}
          </fieldset>
        ))}
        <button className="btn btn-primary">See my starting point</button>
      </form>
    </article>
  );
}
