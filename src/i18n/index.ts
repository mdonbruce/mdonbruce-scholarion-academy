import { cache } from "react";
import { DEFAULT_REGION, isRegion, type RegionCode } from "@/platform/pricing";
import { en, type MessageKey, type Messages } from "./en";
import { es } from "./es";
import { fr } from "./fr";

/**
 * Interface languages and request preferences. The locale and price-book region are
 * resolved once per request (cookie → saved account preference → Accept-Language)
 * and read by server components through a request-scoped store (React `cache`).
 * Outside a request (tests, static preview) the defaults apply: English, US prices.
 */

export type Locale = "en" | "es" | "fr";
export const LOCALES: { code: Locale; name: string }[] = [
  { code: "en", name: "English" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "sch_locale";
export const REGION_COOKIE = "sch_region";

const DICTS: Record<Locale, Messages> = { en, es, fr };

export function isLocale(x: unknown): x is Locale {
  return x === "en" || x === "es" || x === "fr";
}

export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  for (const part of (header ?? "").split(",")) {
    const lang = part.trim().split(";")[0].split("-")[0].toLowerCase();
    if (isLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

const store = cache(() => ({ locale: DEFAULT_LOCALE as Locale, region: DEFAULT_REGION as RegionCode }));

export function setRequestPrefs(p: { locale?: string | null; region?: string | null }): void {
  const s = store();
  if (isLocale(p.locale)) s.locale = p.locale;
  if (isRegion(p.region)) s.region = p.region;
}

export function requestPrefs(): { locale: Locale; region: RegionCode } {
  const s = store();
  return { locale: s.locale, region: s.region };
}

/** Translate a key for a locale (default: this request's). Falls back to English. */
export function t(key: MessageKey, vars?: Record<string, string | number>, locale?: Locale): string {
  const l = locale ?? requestPrefs().locale;
  let s = DICTS[l]?.[key] ?? en[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export { type MessageKey };
