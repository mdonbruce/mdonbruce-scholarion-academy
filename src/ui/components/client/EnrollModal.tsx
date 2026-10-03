"use client";
import { useEffect, useRef, useState } from "react";
import type { Offer } from "@/platform/types";

/**
 * Enroll options modal (Spec §5.2): plain-language choices, each with what's included
 * and excluded, and renewal terms shown before anything is charged.
 */
export function EnrollModal({ productId, slug, offers, signedIn, label = "Enroll", primary = true, startOpen = false }: { productId: string; slug: string; offers: Offer[]; signedIn: boolean; label?: string; primary?: boolean; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("h2")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [open]);

  const back = `/learn/${slug}`;
  const price = (o: Offer) => (o.price === null ? "" : o.price === 0 ? "Free" : `${new Intl.NumberFormat("en-US", { style: "currency", currency: o.currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(o.price)}${o.interval === "month" ? "/month" : o.interval === "year" ? "/year" : ""}`);

  return (
    <>
      <button className={`btn ${primary ? "btn-primary" : "btn-outline"} btn-block`} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {label}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="enroll-title">
            <div className="card-pad" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="row between">
                <h2 id="enroll-title" tabIndex={-1} style={{ margin: 0, fontSize: "1.4rem" }}>
                  Choose how you want to learn
                </h2>
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close">
                  ✕
                </button>
              </div>
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                Sandbox — no real payments. Prices are placeholders set by the product owner.
              </p>
            </div>
            <div className="card-pad">
              {offers.map((o) => (
                <div className="offer" key={o.code}>
                  <div className="row between" style={{ alignItems: "flex-start" }}>
                    <div>
                      <strong>{o.label}</strong>
                      {o.price !== null && (
                        <span className="muted">
                          {" "}
                          · {o.trialDays ? `Free for ${o.trialDays} days, then ${price(o)}` : price(o)}
                        </span>
                      )}
                    </div>
                    {signedIn ? (
                      o.code === "audit" ? (
                        <form method="post" action="/api/v1/lms/enrollments">
                          <input type="hidden" name="productId" value={productId} />
                          <input type="hidden" name="level" value="audit" />
                          <button className="btn btn-outline btn-sm">Audit free</button>
                        </form>
                      ) : o.code === "live_seat" ? (
                        <a className="btn btn-primary btn-sm" href={`/learn/${slug}/apply`}>
                          Apply
                        </a>
                      ) : o.code === "financial_aid" ? (
                        <a className="btn btn-outline btn-sm" href={`/financial-aid/apply?product=${slug}`}>
                          Apply
                        </a>
                      ) : (
                        <form method="post" action="/api/v1/commerce/checkout-sessions">
                          <input type="hidden" name="plan" value={o.code} />
                          {!o.code.startsWith("plus") && <input type="hidden" name="productId" value={productId} />}
                          <button className="btn btn-primary btn-sm">{o.trialDays ? "Start free trial" : "Continue"}</button>
                        </form>
                      )
                    ) : (
                      <a className="btn btn-primary btn-sm" href={`/signup?next=${encodeURIComponent(back + "?enroll=1")}`}>
                        Join to continue
                      </a>
                    )}
                  </div>
                  <div className="grid g2" style={{ ["--gap" as string]: "12px", marginTop: 6 }}>
                    <ul className="ok">
                      {o.includes.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                    {o.excludes.length > 0 && (
                      <ul className="x">
                        {o.excludes.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <p className="tiny muted" style={{ margin: "8px 0 0" }}>
                    {o.renewalTerms}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
