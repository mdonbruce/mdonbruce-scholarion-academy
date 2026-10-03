/**
 * Regional price books. Each region has its own currency and a purchasing-power
 * adjusted multiplier with "clean" rounding. These are sandbox placeholders set by
 * Scholarion (like every other price here), not live exchange rates. A real price
 * book per region replaces this table before launch.
 */

export type RegionCode = "US" | "EU" | "GB" | "NG" | "IN";

export interface Region {
  code: RegionCode;
  name: string;
  currency: string;
  /** Multiplier applied to the base (USD) placeholder price. */
  factor: number;
  /** Prices round to a multiple of this, in local currency. */
  step: number;
}

export const REGIONS: Record<RegionCode, Region> = {
  US: { code: "US", name: "United States & other countries", currency: "USD", factor: 1, step: 1 },
  EU: { code: "EU", name: "Euro area", currency: "EUR", factor: 0.95, step: 1 },
  GB: { code: "GB", name: "United Kingdom", currency: "GBP", factor: 0.8, step: 1 },
  NG: { code: "NG", name: "Nigeria", currency: "NGN", factor: 500, step: 500 },
  IN: { code: "IN", name: "India", currency: "INR", factor: 35, step: 50 },
};

export const DEFAULT_REGION: RegionCode = "US";

export function isRegion(x: unknown): x is RegionCode {
  return typeof x === "string" && x in REGIONS;
}

export function region(code: string | null | undefined): Region {
  return REGIONS[isRegion(code) ? code : DEFAULT_REGION];
}

/** Base (USD) placeholder → regional price. Free stays free. */
export function localize(usd: number, code: string | null | undefined): number {
  if (!usd) return 0;
  const r = region(code);
  if (r.code === "US") return usd;
  return Math.max(r.step, Math.round((usd * r.factor) / r.step) * r.step);
}

/** Splits an amount into installments, rounding each up to the currency's smallest sensible unit. */
export function installment(amount: number, n: number, code: string | null | undefined): number {
  const r = region(code);
  const unit = r.step >= 50 ? 1 : 0.01;
  return Math.ceil(amount / n / unit) * unit;
}

const EU_COUNTRIES = new Set(["AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES"]);

/** Best guess from Accept-Language (e.g. en-NG → NG, fr-FR → EU). Falls back to US. */
export function regionFromAcceptLanguage(header: string | null | undefined): RegionCode {
  for (const part of (header ?? "").split(",")) {
    const country = part.trim().split(";")[0].split("-")[1]?.toUpperCase();
    if (!country) continue;
    if (country === "NG") return "NG";
    if (country === "IN") return "IN";
    if (country === "GB") return "GB";
    if (EU_COUNTRIES.has(country)) return "EU";
    return "US";
  }
  return DEFAULT_REGION;
}

/** Formats with the currency's own symbol (₦, ₹, €, £, $). */
export function formatMoney(amount: number, currency: string, locale = "en"): string {
  const whole = amount % 1 === 0;
  return new Intl.NumberFormat(locale === "en" ? "en-US" : locale, { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(amount);
}
