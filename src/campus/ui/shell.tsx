import type { ReactNode } from "react";
import type { Tenant, TenantStore } from "../core";
import type { Actor } from "../iam";
import { visibleTabs } from "../http/router";
import { activeGlobalAnnouncements, helpLinks } from "../services/admin";
import { myNotifications } from "../services/success";
import { api, Hidden } from "./kit";

/** Campus chrome: tenant-branded global navigation, role-filtered tab groups, act-as banner. */

const PRIMARY: [string, string][] = [
  ["dashboard", "Dashboard"],
  ["courses", "Courses"],
  ["calendar", "Calendar"],
  ["agent-labs", "Agentic Cloud Labs"],
  ["hub", "Free Resources & Careers"],
  ["inbox", "Inbox"],
  ["notifications", "Notifications"],
  ["search", "Search"],
  ["account", "Account"],
];

export function CampusShell({ tenant, store, actor, current, children }: { tenant: Tenant; store: TenantStore; actor: Actor; current: string; children: ReactNode }) {
  const slug = tenant.slug;
  const tabs = visibleTabs(store, actor);
  const groups = [...new Set(tabs.map((t) => t.group))];
  const unread = myNotifications(store, actor).unread;
  const announcements = activeGlobalAnnouncements(store, actor);
  const initials = actor.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const theme = { "--primary": tenant.theme.primary, "--accent": tenant.theme.accent } as never;
  const here = `/campus/${slug}/${current}`;
  // Personal accessibility settings (Account → Profile) apply to every campus screen.
  const prof = store.list("profiles", (p) => p.userId === actor.id)[0];
  const a11y = [prof?.highContrast && "a11y-contrast", prof?.dyslexiaFont && "a11y-dyslexia", prof?.underlineLinks && "a11y-underline", prof?.reducedMotion && "a11y-reduce-motion"].filter(Boolean).join(" ");
  return (
    <div className={`app campus ${a11y}`.trim()} style={theme} data-tenant={slug} lang={String(prof?.language ?? "en")}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar campus-sidebar" aria-label={`${tenant.name} navigation`}>
        <a className="brand campus-brand" href={`/campus/${slug}/dashboard`}>
          <span className="campus-logo" aria-hidden="true">
            {tenant.theme.logoText.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}
          </span>
          <span className="brand-word">{tenant.theme.logoText}</span>
        </a>
        <nav aria-label="Main">
          <ul className="sidenav">
            {PRIMARY.map(([path, label]) => (
              <li key={path}>
                <a href={`/campus/${slug}/${path}`} aria-current={current === path || current.startsWith(`${path}/`) ? "page" : undefined}>
                  {label}
                  {path === "notifications" && unread > 0 && (
                    <span className="bell-count" aria-label={`${unread} unread`}>
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="All areas" className="campus-tabnav">
          {groups.map((g) => (
            <details key={g} open={tabs.some((t) => t.group === g && current === `t/${t.slug}`)}>
              <summary>{g}</summary>
              <ul className="sidenav">
                {tabs
                  .filter((t) => t.group === g)
                  .map((t) => (
                    <li key={t.slug}>
                      <a href={`/campus/${slug}/t/${t.slug}`} aria-current={current === `t/${t.slug}` ? "page" : undefined}>
                        {t.title}
                        {t.disabledByFlag && <span className="tiny muted"> (off)</span>}
                      </a>
                    </li>
                  ))}
              </ul>
            </details>
          ))}
        </nav>
        <ul className="sidenav campus-help">
          {helpLinks(store).map((l) => (
            <li key={l.label}>
              <a href={l.href.replace("{tenant}", slug)}>{l.label}</a>
            </li>
          ))}
        </ul>
        {tenant.flags.powered_by !== false && <p className="tiny muted campus-powered">Powered by Scholarion</p>}
      </aside>
      <div>
        {actor.masqueradedBy && (
          <div className="campus-actas" role="alert">
            <span>
              Acting as <strong>{actor.name}</strong> (by {actor.masqueradedBy.name}). Everything you do is recorded.
            </span>
            <form method="post" action={api(slug, "auth/masquerade")}>
              <Hidden values={{ back: here, _method: "DELETE", stop: "1" }} />
              <button className="btn btn-sm btn-on-dark" type="submit">
                Stop acting as
              </button>
            </form>
          </div>
        )}
        <div className="topbar">
          <form className="search" role="search" method="get" action={`/campus/${slug}/search`}>
            <label className="sr-only" htmlFor="campus-q">
              Search {tenant.name}
            </label>
            <input id="campus-q" name="q" type="search" placeholder="Search courses, pages, people…" />
          </form>
          <div className="row" style={{ marginLeft: "auto", gap: 12 }}>
            <div className="userchip">
              <span className="avatar" aria-hidden="true">
                {initials}
              </span>
              <span>
                <strong>{actor.name}</strong>
                <small>{[...actor.roles, ...new Set(Object.values(actor.courseRoles).flat())].join(", ") || "member"}</small>
              </span>
            </div>
            <form method="post" action={api(slug, "auth/signout")}>
              <button className="btn btn-ghost btn-sm" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <main id="main" className="main campus-main" tabIndex={-1}>
          <p className="dev-banner tiny" role="note">
            Staging · demonstration data · sandbox payments only
          </p>
          {announcements.map((g) => (
            <div key={String(g.id)} className="notice notice-info campus-global" role="status">
              <strong>{String(g.title)}</strong> {String(g.body)}
              <form method="post" action={api(slug, "a/global_announcements.dismiss")} className="inline">
                <Hidden values={{ back: here, id: String(g.id) }} />
                <button className="linkish" type="submit">
                  Dismiss
                </button>
              </form>
            </div>
          ))}
          {children}
        </main>
      </div>
    </div>
  );
}

/** Minimal branded frame for public tenant pages (catalog, verification, sign-in). */
export function PublicFrame({ tenant, children }: { tenant: Tenant; children: ReactNode }) {
  const theme = { "--primary": tenant.theme.primary, "--accent": tenant.theme.accent } as never;
  return (
    <div className="campus-public" style={theme}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="campus-public-head">
        <a className="brand campus-brand" href={`/campus/${tenant.slug}`}>
          <span className="campus-logo" aria-hidden="true">
            {tenant.theme.logoText.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}
          </span>
          <span className="brand-word">{tenant.theme.logoText}</span>
        </a>
        <nav aria-label="Public" className="row">
          <a href={`/campus/${tenant.slug}/catalog`}>Catalog</a>
          <a href={`/campus/${tenant.slug}/programs`}>Programs</a>
          <a href={`/campus/${tenant.slug}/agentic-ai`}>Agentic AI</a>
          <a href={`/campus/${tenant.slug}/signin`} className="btn btn-primary btn-sm">
            Sign in
          </a>
        </nav>
      </header>
      <main id="main" className="container campus-public-main" tabIndex={-1}>
        <p className="dev-banner tiny" role="note">
          Staging · demonstration data · sandbox payments only
        </p>
        {children}
      </main>
      {tenant.flags.powered_by !== false && <footer className="container tiny muted campus-powered">Powered by Scholarion</footer>}
    </div>
  );
}
