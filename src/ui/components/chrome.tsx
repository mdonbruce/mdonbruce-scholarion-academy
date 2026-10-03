import type { ReactNode } from "react";
import { Icon } from "./icons";
import { SearchBox } from "./client/SearchBox";
import { SupportChat } from "./client/SupportChat";
import { LOCALES, requestPrefs, t, type MessageKey } from "@/i18n";
import { REGIONS } from "@/platform/pricing";

/** Site chrome: brand, public header/footer, learner app shell. Plain <a> links so views render anywhere. */

export interface Viewer {
  id: string;
  name: string;
  roles: string[];
  orgAdminOf?: string;
  unread?: number;
}

export function Brand({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <a className="brand" href={href} aria-label="Scholarion Academy home">
      <img src="/brand/scholarion-emblem.png" alt="" width={57} height={40} />
      <span className="brand-word">
        <strong>SCHOLARION</strong>
        {!compact && <span>Learn. Earn. Build Your Future.</span>}
      </span>
    </a>
  );
}

const EXPLORE: [MessageKey, [MessageKey, string][]][] = [
  [
    "nav.goals",
    [
      ["nav.goal.career", "/explore?type=professional_certificate"],
      ["nav.goal.ai", "/explore?q=ai"],
      ["nav.goal.free", "/explore?free=1"],
      ["nav.goal.live", "/explore?format=live"],
    ],
  ],
  [
    "nav.topics",
    [
      ["nav.topic.agentic", "/hubs/agentic-ai"],
      ["nav.topic.genai", "/hubs/generative-ai"],
      ["nav.topic.data", "/hubs/python-and-data"],
      ["nav.topic.leaders", "/hubs/ai-for-leaders"],
    ],
  ],
  [
    "nav.types",
    [
      ["nav.type.courses", "/explore?type=course"],
      ["nav.type.certs", "/explore?type=professional_certificate"],
      ["nav.type.projects", "/explore?type=guided_project"],
      ["nav.type.stack", "/programs"],
    ],
  ],
];

/** Language and price-region chooser (no JavaScript needed). */
export function PrefsForm({ compact = false }: { compact?: boolean }) {
  const { locale, region } = requestPrefs();
  return (
    <form method="post" action="/api/v1/prefs" className="row prefs-form" style={{ ["--gap" as string]: "6px", flexWrap: "wrap", alignItems: "center" }} id={compact ? undefined : "site-prefs"}>
      <label className="sr-only" htmlFor={compact ? "pf-l-c" : "pf-l"}>
        {t("prefs.language")}
      </label>
      <select id={compact ? "pf-l-c" : "pf-l"} name="locale" defaultValue={locale} lang="">
        {LOCALES.map((l) => (
          <option key={l.code} value={l.code} lang={l.code}>
            {l.name}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={compact ? "pf-r-c" : "pf-r"}>
        {t("prefs.region")}
      </label>
      <select id={compact ? "pf-r-c" : "pf-r"} name="region" defaultValue={region}>
        {Object.values(REGIONS).map((r) => (
          <option key={r.code} value={r.code}>
            {r.name} · {r.currency}
          </option>
        ))}
      </select>
      <button className="btn btn-ghost btn-sm">{t("prefs.save")}</button>
    </form>
  );
}

export function PublicHeader({ viewer, current }: { viewer: Viewer | null; current?: string }) {
  const nav = (href: string, label: string) => (
    <a href={href} aria-current={current === href ? "page" : undefined}>
      {label}
    </a>
  );
  return (
    <>
      <a className="skip-link" href="#main">
        {t("skip")}
      </a>
      <div className="utility">
        <div className="container">
          <span>{t("util.platform")}</span>
          <nav aria-label="Utility">
            <a href={viewer ? "/app" : "/login"}>{t("util.portal")}</a>
            <a href="/financial-aid">{t("util.aid")}</a>
            <a href="/teams">{t("util.orgs")}</a>
            <a href="/help">{t("util.support")}</a>
            <a href="#site-prefs" aria-label={`${t("prefs.language")}: ${LOCALES.find((l) => l.code === requestPrefs().locale)?.name}`}>
              {LOCALES.find((l) => l.code === requestPrefs().locale)?.name} · {REGIONS[requestPrefs().region].currency}
            </a>
          </nav>
        </div>
      </div>
      <header className="site-header">
        <div className="container">
          <Brand />
          <nav className="mainnav" aria-label="Main">
            <details className="mega">
              <summary>{t("nav.explore")} ▾</summary>
              <div>
                {EXPLORE.map(([group, links]) => (
                  <div key={group}>
                    <h4>{t(group)}</h4>
                    <ul>
                      {links.map(([l, h]) => (
                        <li key={l}>
                          <a href={h}>{t(l)}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
            {nav("/programs", t("nav.programs"))}
            {nav("/plus", t("nav.plus"))}
            {nav("/pricing", t("nav.pricing"))}
            {nav("/teams", t("nav.teams"))}
            {nav("/blog", t("nav.blog"))}
          </nav>
          <div className="header-search" style={{ width: 240 }}>
            <SearchBox placeholder={t("hdr.search")} />
          </div>
          <div className="header-actions">
            {viewer ? (
              <a className="btn btn-primary btn-sm" href="/app">
                {t("hdr.myLearning")}
              </a>
            ) : (
              <>
                <a className="btn btn-outline btn-sm" href="/login">
                  {t("hdr.signin")}
                </a>
                <a className="btn btn-primary btn-sm" href="/signup">
                  {t("hdr.join")}
                </a>
              </>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

export function Footer() {
  const col = (title: MessageKey, links: [MessageKey, string][]) => (
    <div>
      <h4>{t(title)}</h4>
      <ul>
        {links.map(([l, h]) => (
          <li key={l}>
            <a href={h}>{t(l)}</a>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="grid g4">
          <div>
            <div className="dark-brand" style={{ marginBottom: 12 }}>
              <Brand />
            </div>
            <p className="small">{t("foot.blurb")}</p>
          </div>
          {col("foot.learn", [
            ["foot.catalog", "/explore"],
            ["foot.stack", "/programs"],
            ["foot.topics", "/hubs"],
            ["foot.blog", "/blog"],
            ["foot.plus", "/plus"],
            ["foot.aid", "/financial-aid"],
          ])}
          {col("foot.orgs", [
            ["foot.teams", "/teams"],
            ["foot.partner", "/teams?kind=partner"],
            ["foot.verify", "/verify"],
          ])}
          {col("foot.support", [
            ["foot.help", "/help"],
            ["foot.a11y", "/help#accessibility"],
            ["foot.refunds", "/help#refunds"],
            ["foot.privacy", "/help#privacy"],
          ])}
        </div>
        <hr className="divider" style={{ background: "rgba(255,255,255,.12)" }} />
        <p className="tiny" style={{ opacity: 0.8, margin: "0 0 8px" }}>
          {t("prefs.note")} {t("prefs.priceNote")}
        </p>
        <div className="row between small" style={{ flexWrap: "wrap" }}>
          <span>© 2026 Scholarion Academy · Haven Digital Systems</span>
          <PrefsForm />
        </div>
      </div>
    </footer>
  );
}

export function PublicPage({ viewer, current, children }: { viewer: Viewer | null; current?: string; children: ReactNode }) {
  return (
    <>
      <PublicHeader viewer={viewer} current={current} />
      <main id="main">{children}</main>
      <Footer />
      <SupportChat signedIn={!!viewer} />
    </>
  );
}

const SIDENAV: [string, MessageKey, string][] = [
  ["/app", "side.home", "home"],
  ["/app/courses", "side.courses", "book"],
  ["/app/calendar", "side.calendar", "calendar"],
  ["/app/live", "side.live", "live"],
  ["/app/grades", "side.grades", "chart"],
  ["/app/credentials", "side.credentials", "award"],
  ["/app/tutor", "side.tutor", "sparkle"],
  ["/app/proctoring", "side.proctoring", "shield"],
];

export function AppShell({ viewer, current, children }: { viewer: Viewer; current: string; children: ReactNode }) {
  const initials = viewer.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const isStaff = viewer.roles.some((r) => ["platform_admin", "instructor", "reviewer", "support_agent"].includes(r));
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        {t("skip")}
      </a>
      <aside className="sidebar" aria-label="Learner navigation">
        <Brand compact href="/app" />
        <ul className="sidenav">
          {SIDENAV.map(([href, label, icon]) => (
            <li key={href}>
              <a href={href} aria-current={current === href ? "page" : undefined}>
                <Icon name={icon} size={18} />
                {t(label)}
              </a>
            </li>
          ))}
          <li className="sep" aria-hidden="true" />
          <li>
            <a href="/explore">
              <Icon name="search" size={18} />
              {t("side.explore")}
            </a>
          </li>
          <li>
            <a href="/app/account" aria-current={current === "/app/account" ? "page" : undefined}>
              <Icon name="card" size={18} />
              {t("side.account")}
            </a>
          </li>
          <li>
            <a href="/app/security" aria-current={current === "/app/security" ? "page" : undefined}>
              <Icon name="lock" size={18} />
              {t("side.security")}
            </a>
          </li>
          <li>
            <a href="/help">
              <Icon name="help" size={18} />
              {t("side.help")}
            </a>
          </li>
          {viewer.orgAdminOf && (
            <li>
              <a href={`/org/${viewer.orgAdminOf}`} aria-current={current.startsWith("/org") ? "page" : undefined}>
                <Icon name="users" size={18} />
                {t("side.org")}
              </a>
            </li>
          )}
          {viewer.roles.some((r) => r === "instructor" || r === "platform_admin") && (
            <li>
              <a href="/teach" aria-current={current.startsWith("/teach") ? "page" : undefined}>
                <Icon name="book" size={18} />
                {t("side.teach")}
              </a>
            </li>
          )}
          {isStaff && (
            <li>
              <a href="/admin" aria-current={current.startsWith("/admin") ? "page" : undefined}>
                <Icon name="settings" size={18} />
                {t("side.staff")}
              </a>
            </li>
          )}
        </ul>
      </aside>
      <div>
        <div className="topbar">
          <div className="search">
            <SearchBox placeholder={t("top.search")} />
          </div>
          <div className="row" style={{ marginLeft: "auto", gap: 16 }}>
            <a href="/app/notifications" className="btn btn-ghost btn-sm bell" aria-label={viewer.unread ? `${t("top.notifications")}, ${t("top.unread", { n: viewer.unread })}` : t("top.notifications")}>
              <Icon name="bell" size={18} />
              {!!viewer.unread && (
                <span className="bell-count" aria-hidden="true">
                  {viewer.unread > 99 ? "99+" : viewer.unread}
                </span>
              )}
            </a>
            <div className="userchip">
              <span className="avatar" aria-hidden="true">
                {initials}
              </span>
              <span>
                <strong>{viewer.name}</strong>
                <small>{t(viewer.roles.includes("platform_admin") ? "role.admin" : viewer.roles.includes("instructor") ? "role.instructor" : viewer.orgAdminOf ? "role.orgAdmin" : "role.student")}</small>
              </span>
            </div>
            <form method="post" action="/api/v1/auth/signout">
              <button className="btn btn-ghost btn-sm" type="submit">
                {t("top.signout")}
              </button>
            </form>
          </div>
        </div>
        <main id="main" className="main">
          {children}
        </main>
      </div>
      <SupportChat signedIn />
    </div>
  );
}

export function Flash({ notice, error }: { notice?: string; error?: string }) {
  if (!notice && !error) return null;
  return (
    <div className={`notice ${error ? "notice-err" : "notice-ok"}`} role={error ? "alert" : "status"}>
      {error ?? notice}
    </div>
  );
}

export function Crumbs({ items }: { items: [string, string | null][] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map(([label, href], i) => (
        <span key={label}>
          {i > 0 && " › "}
          {href ? <a href={href}>{label}</a> : <span aria-current="page">{label}</span>}
        </span>
      ))}
    </nav>
  );
}
