import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { handleApi } from "../src/bff/api";
import { LOCALES, localeFromAcceptLanguage, t } from "../src/i18n";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { fr } from "../src/i18n/fr";
import { commerce, identity } from "../src/platform";
import { formatMoney, installment, localize, REGIONS, regionFromAcceptLanguage } from "../src/platform/pricing";
import { DEMO } from "../src/platform/seed";
import { getDb } from "../src/platform/store";
import { advanceDays, fresh } from "./helpers";

beforeEach(() => fresh());

describe("Interface languages", () => {
  it("every language has every key, with the same placeholders", () => {
    for (const [name, dict] of [["es", es], ["fr", fr]] as const) {
      for (const k of Object.keys(en) as (keyof typeof en)[]) {
        assert.ok(dict[k]?.trim(), `${name} is missing ${k}`);
        const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
        assert.equal(vars(dict[k]), vars(en[k]), `${name}.${k} placeholders`);
      }
      assert.equal(Object.keys(dict).length, Object.keys(en).length, `${name} has no extra keys`);
    }
    assert.deepEqual(LOCALES.map((l) => l.code), ["en", "es", "fr"]);
  });
  it("translates with variables and falls back to English by default", () => {
    assert.equal(t("greet.morning", { name: "Amara" }, "es"), "¡Buenos días, Amara!");
    assert.equal(t("nav.programs", undefined, "fr"), "Programmes");
    assert.equal(t("nav.programs"), "Programs");
  });
  it("picks a language from the browser", () => {
    assert.equal(localeFromAcceptLanguage("fr-CA,fr;q=0.9,en;q=0.8"), "fr");
    assert.equal(localeFromAcceptLanguage("de-DE,es;q=0.5"), "es");
    assert.equal(localeFromAcceptLanguage("de-DE"), "en");
    assert.equal(localeFromAcceptLanguage(undefined), "en");
  });
});

describe("Regional pricing", () => {
  it("localizes with clean rounding and never makes free things paid", () => {
    assert.equal(localize(55, "US"), 55);
    assert.equal(localize(55, "NG"), 27500);
    assert.equal(localize(55, "IN") % 50, 0);
    assert.equal(localize(0, "NG"), 0);
    assert.equal(localize(55, "XX"), 55, "unknown regions use the base price book");
    assert.equal(installment(1260, 3, "US"), 420);
    assert.equal(installment(100, 3, "US"), 33.34);
    assert.equal(installment(630000, 3, "NG"), 210000);
  });
  it("formats with local symbols", () => {
    assert.equal(formatMoney(27500, "NGN"), "₦27,500");
    assert.equal(formatMoney(52, "EUR"), "€52");
    assert.equal(formatMoney(33.34, "USD"), "$33.34");
  });
  it("guesses region from the browser", () => {
    assert.equal(regionFromAcceptLanguage("en-NG,en;q=0.9"), "NG");
    assert.equal(regionFromAcceptLanguage("fr-FR"), "EU");
    assert.equal(regionFromAcceptLanguage("en-GB"), "GB");
    assert.equal(regionFromAcceptLanguage("hi-IN"), "IN");
    assert.equal(regionFromAcceptLanguage("en-US"), "US");
    assert.equal(regionFromAcceptLanguage("en"), "US");
  });
  it("offers and plan summaries come in the region's currency", () => {
    const ng = commerce.offers("prd_cop1047c", "NG");
    assert.ok(ng.every((o) => o.currency === "NGN"));
    const plus = ng.find((o) => o.code === "plus_monthly")!;
    assert.equal(plus.price, localize(commerce.plansSummary().plusMonthly, "NG"));
    assert.match(plus.renewalTerms, /₦/);
    assert.equal(commerce.plansSummary("EU").currency, "EUR");
    assert.equal(commerce.offers("prd_cop1047c").find((o) => o.code === "plus_monthly")!.currency, "USD");
  });
  it("checkout charges and renews in the local currency", () => {
    const u = identity.signUp({ name: "Ada Obi", email: "ada@example.ng", password: "LongEnough123", acceptTerms: true });
    const cs = commerce.createCheckout({ userId: u.id, plan: "plus_annual", productId: null, idempotencyKey: "k-ng", region: "NG" });
    assert.equal(cs.currency, "NGN");
    assert.equal(cs.amount, localize(commerce.plansSummary().plusAnnual, "NG"));
    const { subscription } = commerce.confirmSandboxPayment(cs.id, u.id);
    assert.equal(subscription!.currency, "NGN");
    assert.equal(getDb().orders.find((o) => o.userId === u.id)!.currency, "NGN");
    assert.match(getDb().outbox.find((e) => e.to === "ada@example.ng" && e.template === "receipt")!.body, /₦/);
    advanceDays(366);
    commerce.tick();
    const renewal = getDb().orders.filter((o) => o.userId === u.id).at(-1)!;
    assert.match(renewal.description, /renewal/);
    assert.equal(renewal.currency, "NGN");
  });
  it("the checkout API uses the region cookie, and the preference is saved to the account", async () => {
    const login = await handleApi(new Request("http://localhost:3000/api/v1/auth/signin", { method: "POST", headers: { host: "localhost:3000", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ email: DEMO.visitor.email, password: DEMO.visitor.password }) }), "auth/signin");
    const session = login.headers.getSetCookie()[0].split(";")[0];
    const prefs = await handleApi(new Request("http://localhost:3000/api/v1/prefs", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie: session, referer: "http://localhost:3000/pricing", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ locale: "fr", region: "EU" }) }), "prefs");
    assert.equal(prefs.status, 303);
    assert.equal(new URL(prefs.headers.get("location")!, "http://x").pathname, "/pricing");
    const set = prefs.headers.getSetCookie().map((c) => c.split(";")[0]);
    assert.deepEqual(set.sort(), ["sch_locale=fr", "sch_region=EU"]);
    assert.equal(identity.getUser("usr_tunde")!.locale, "fr");
    const co = await handleApi(new Request("http://localhost:3000/api/v1/commerce/checkout-sessions", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", cookie: `${session}; sch_region=EU`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ plan: "plus_monthly" }) }), "commerce/checkout-sessions");
    assert.equal(co.status, 303);
    const cs = getDb().checkouts.find((c) => c.userId === "usr_tunde")!;
    assert.equal(cs.currency, "EUR");
    assert.equal(cs.region, "EU");
  });
  it("every region is well formed", () => {
    for (const r of Object.values(REGIONS)) {
      assert.match(r.currency, /^[A-Z]{3}$/);
      assert.ok(r.factor > 0 && r.step > 0);
    }
  });
});
