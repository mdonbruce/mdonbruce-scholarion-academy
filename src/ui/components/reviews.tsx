import type { productVM } from "@/bff/views";
import { fmtDate } from "./cards";

type R = NonNullable<ReturnType<typeof productVM>>["reviews"];

export function Stars({ rating, size = "1rem" }: { rating: number; size?: string }) {
  const full = Math.round(rating);
  return (
    <span aria-label={`${rating} out of 5 stars`} role="img" style={{ color: "var(--gold-600, #b9933d)", fontSize: size, letterSpacing: ".05em" }}>
      {"★".repeat(full)}
      <span style={{ color: "#c8cfdc" }}>{"★".repeat(5 - full)}</span>
    </span>
  );
}

/** Verified learner reviews: only credential holders can write one. */
export function ReviewsSection({ vm, slug, productId, signedIn }: { vm: R; slug: string; productId: string; signedIn: boolean }) {
  const s = vm.summary;
  const mine = vm.mine;
  return (
    <section id="reviews" aria-labelledby="reviews-h">
      <h2 id="reviews-h" className="section-title">
        Learner reviews
      </h2>
      <p className="small muted" style={{ marginTop: -6 }}>
        Every review comes from a learner who earned this credential. We don't edit reviews or remove them for being negative.
      </p>
      {s.count > 0 ? (
        <div className="card card-pad row" style={{ alignItems: "center", gap: 24, flexWrap: "wrap" }}>
          <div style={{ textAlign: "center", minWidth: 110 }}>
            <div style={{ fontSize: "2.4rem", fontWeight: 700, lineHeight: 1 }}>{s.average!.toFixed(1)}</div>
            <Stars rating={s.average!} />
            <div className="tiny muted">
              {s.count} verified review{s.count === 1 ? "" : "s"}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            {([5, 4, 3, 2, 1] as const).map((n) => {
              const pct = s.count ? Math.round((s.distribution[n] / s.count) * 100) : 0;
              return (
                <div key={n} className="row tiny" style={{ ["--gap" as string]: "8px", alignItems: "center" }}>
                  <span style={{ width: 44 }}>{n} star</span>
                  <span style={{ flex: 1, height: 8, background: "#e7ebf3", borderRadius: 4, overflow: "hidden" }} aria-hidden="true">
                    <span style={{ display: "block", width: `${pct}%`, height: "100%", background: "var(--gold-600, #b9933d)" }} />
                  </span>
                  <span style={{ width: 34, textAlign: "right" }}>{s.distribution[n]}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="panel small muted">No reviews yet. Reviews open to learners once they earn this credential.</div>
      )}

      {vm.canReview && (
        <details className="acc" open={!mine} style={{ marginTop: 14 }}>
          <summary>{mine ? "Edit your review" : "Write a review"}</summary>
          <form method="post" action="/api/v1/reviews" className="stack" style={{ ["--gap" as string]: "10px" }}>
            <input type="hidden" name="productId" value={productId} />
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small" style={{ fontWeight: 700, marginBottom: 4 }}>
                Your rating
              </legend>
              <div className="row" style={{ ["--gap" as string]: "12px" }}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <label key={n} className="check">
                    <input type="radio" name="rating" value={n} required defaultChecked={mine?.rating === n} /> {n} ★
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="rv-title">Title</label>
              <input id="rv-title" name="title" required minLength={3} maxLength={100} defaultValue={mine?.title} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="rv-body">
                Your experience <span className="hint">(30–2,000 characters; no links or contact details)</span>
              </label>
              <textarea id="rv-body" name="body" required minLength={30} maxLength={2000} defaultValue={mine?.body} />
            </div>
            <div>
              <button className="btn btn-primary btn-sm">{mine ? "Update review" : "Post review"}</button>
            </div>
          </form>
          {mine && (
            <form method="post" action={`/api/v1/reviews/${mine.id}/delete`} style={{ marginTop: 8 }}>
              <input type="hidden" name="back" value={`/learn/${slug}`} />
              <button className="linkish small">Delete my review</button>
            </form>
          )}
        </details>
      )}

      {vm.list.length > 0 && (
        <ul className="stack" style={{ listStyle: "none", padding: 0, marginTop: 14 }}>
          {vm.list.map((r) => (
            <li key={r.id} className="card card-pad">
              <div className="row between" style={{ flexWrap: "wrap" }}>
                <span className="row" style={{ ["--gap" as string]: "8px", alignItems: "center" }}>
                  <Stars rating={r.rating} />
                  <strong className="small">{r.title}</strong>
                </span>
                {r.status === "pending" && <span className="badge badge-amber">Waiting for a quick check</span>}
              </div>
              <p className="small" style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>
                {r.body}
              </p>
              <div className="row between tiny muted">
                <span>
                  {r.author} · <span className="badge badge-green">Verified credential holder</span> · {fmtDate(r.updatedAt ?? r.createdAt)}
                  {r.updatedAt ? " (edited)" : ""}
                </span>
                {signedIn && !r.mine && r.status === "published" && (
                  <form method="post" action={`/api/v1/reviews/${r.id}/report`}>
                    <input type="hidden" name="back" value={`/learn/${slug}`} />
                    <button className="linkish tiny" disabled={r.reportedByMe}>
                      {r.reportedByMe ? "Reported" : "Report"}
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
