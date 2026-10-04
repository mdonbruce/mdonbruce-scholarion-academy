"use client";
import { useId, useState } from "react";
import { formatMoney } from "@/platform/pricing";

/**
 * Monthly vs annual calculator for Scholarion Plus. Uses the real (sandbox) plan prices
 * passed from the server. No "was/now" prices: it only compares what you'd actually pay.
 */
export function PricingCalculator({ plusMonthly, plusAnnual, currency, trialDays, refundDays }: { plusMonthly: number; plusAnnual: number; currency: string; trialDays: number; refundDays: number }) {
  const id = useId();
  const [months, setMonths] = useState(6);
  const m = Math.min(36, Math.max(1, Math.round(months) || 1));
  const monthlyTotal = plusMonthly * m;
  const years = Math.ceil(m / 12);
  const annualTotal = plusAnnual * years;
  const diff = Math.abs(monthlyTotal - annualTotal);
  const cheaper = monthlyTotal < annualTotal ? "monthly" : monthlyTotal > annualTotal ? "annual" : "same";
  const breakEven = Math.ceil(plusAnnual / plusMonthly);
  const M = (n: number) => formatMoney(Math.round(n * 100) / 100, currency);
  return (
    <div className="calc" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} style={{ fontFamily: "var(--font-sans)", fontSize: "1.05rem", margin: "4px 0 8px" }}>
        Calculator: what would you pay?
      </h3>
      <div className="row" style={{ ["--gap" as string]: "12px", alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor={`${id}-m`}>How many months do you expect to learn?</label>
          <input id={`${id}-m`} type="number" min={1} max={36} value={months} onChange={(e) => setMonths(Number(e.target.value))} style={{ width: 110 }} aria-describedby={`${id}-hint`} />
        </div>
        <input type="range" min={1} max={36} value={m} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Months (slider)" style={{ flex: 1, minWidth: 160 }} />
      </div>
      <p id={`${id}-hint`} className="tiny muted" style={{ margin: "4px 0 10px" }}>
        1 to 36 months. Prices are sandbox placeholders in {currency}.
      </p>
      <table className="table calc-table">
        <caption className="sr-only">Cost for {m} months</caption>
        <tbody>
          <tr>
            <th scope="row">Plus monthly</th>
            <td className="mono">
              {m} × {M(plusMonthly)} = <strong>{M(monthlyTotal)}</strong>
            </td>
          </tr>
          <tr>
            <th scope="row">Plus annual</th>
            <td className="mono">
              {years} × {M(plusAnnual)} = <strong>{M(annualTotal)}</strong>
              <span className="tiny muted"> (paid up front each year)</span>
            </td>
          </tr>
        </tbody>
      </table>
      <p role="status" aria-live="polite" className="calc-result">
        {cheaper === "same"
          ? `For ${m} month${m === 1 ? "" : "s"}, both cost the same.`
          : cheaper === "monthly"
            ? `For ${m} month${m === 1 ? "" : "s"}, monthly costs ${M(diff)} less than annual.`
            : `For ${m} month${m === 1 ? "" : "s"}, annual costs ${M(diff)} less than paying monthly.`}
      </p>
      <p className="tiny muted" style={{ margin: 0 }}>
        {breakEven <= 12 ? `Annual costs less once you use Plus for about ${breakEven} months or more in a year.` : "At these prices, annual costs more than 12 monthly payments."} Monthly starts with a {trialDays}-day free trial and can be cancelled any time (no refunds for monthly). Annual has a {refundDays}-day money-back window. Taxes, if any, are shown at checkout.
      </p>
    </div>
  );
}
