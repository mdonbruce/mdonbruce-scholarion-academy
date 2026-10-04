import { randomBytes } from "node:crypto";
import { broker, CampusError, type TenantStore } from "../core";
import type { Actor } from "../iam";
import { audit } from "./common";

/**
 * Public portfolios (parity §11). A portfolio is private until its owner turns on the public
 * link; that creates an unguessable token. Turning it off removes the token, so old links stop
 * working. The public view shows the owner's chosen pages and the titles of work they picked —
 * never grades, comments or anything they didn't add.
 */
export function setPortfolioPublic(store: TenantStore, a: Actor, portfolioId: string, on: boolean) {
  const p = store.get("portfolios", portfolioId);
  if (!p || p.userId !== a.id) throw new CampusError("not_found", "Portfolio not found", 404);
  const token = on ? (p.publicToken as string) || randomBytes(18).toString("base64url") : null;
  const row = store.tx(() => store.update("portfolios", p.id, { public: on, publicToken: token }));
  audit(store, a, on ? "portfolio.publish" : "portfolio.unpublish", `portfolios/${p.id}`);
  return { id: row.id, public: on, path: token ? `/campus/${broker.tenant(store.tenantId)!.slug}/portfolio/${token}` : null, token };
}

export function publicPortfolio(store: TenantStore, token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new CampusError("not_found", "Portfolio not found", 404);
  const p = store.list("portfolios", (x) => x.publicToken === token && !!x.public)[0];
  if (!p) throw new CampusError("not_found", "Portfolio not found", 404);
  const owner = store.get("users", String(p.userId));
  const pages = store
    .list("portfolio_pages", (x) => x.portfolioId === p.id)
    .sort((x, y) => String(x.section).localeCompare(String(y.section)) || String(x.createdAt).localeCompare(String(y.createdAt)))
    .map((pg) => ({
      section: String(pg.section),
      title: String(pg.title),
      body: String(pg.body ?? ""),
      work: ((pg.submissionIds as string[]) ?? [])
        .map((sid) => store.get("submissions", sid))
        .filter((s) => s && s.userId === p.userId)
        .map((s) => ({ title: String(store.get("assignments", String(s!.assignmentId))?.title ?? "Work sample"), text: s!.body ? String(s!.body).slice(0, 4000) : null })),
    }));
  return { title: String(p.title), summary: String(p.summary ?? ""), owner: String(owner?.name ?? "A learner"), pages };
}
