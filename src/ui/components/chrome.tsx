import type { ReactNode } from "react";
import { Icon } from "./icons";
import { SearchBox } from "./client/SearchBox";
import { SupportChat } from "./client/SupportChat";

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

const EXPLORE = {
  Goals: [
    ["Start a new career", "/explore?type=professional_certificate"],
    ["Build AI skills", "/explore?q=ai"],
    ["Learn for free", "/explore?free=1"],
    ["Live programs", "/explore?format=live"],
  ],
  Topics: [
    ["Agentic AI", "/hubs/agentic-ai"],
    ["Generative AI & LLMs", "/hubs/generative-ai"],
    ["Python, data & databases", "/hubs/python-and-data"],
    ["AI for business & leaders", "/hubs/ai-for-leaders"],
  ],
  "Product types": [
    ["Courses", "/explore?type=course"],
    ["Professional certificates", "/explore?type=professional_certificate"],
    ["Guided projects", "/explore?type=guided_project"],
    ["How the programs stack", "/programs"],
  ],
};

export function PublicHeader({ viewer, current }: { viewer: Viewer | null; current?: string }) {
  const nav = (href: string, label: string) => (
    <a href={href} aria-current={current === href ? "page" : undefined}>
      {label}
    </a>
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="utility">
        <div className="container">
          <span>A SCHOLARION GLOBAL LEARNING PLATFORM</span>
          <nav aria-label="Utility">
            <a href={viewer ? "/app" : "/login"}>Learner Portal</a>
            <a href="/financial-aid">Financial Aid</a>
            <a href="/teams">For Organizations</a>
            <a href="/help">Support</a>
            <span aria-label="Language">English</span>
          </nav>
        </div>
      </div>
      <header className="site-header">
        <div className="container">
          <Brand />
          <nav className="mainnav" aria-label="Main">
            <details className="mega">
              <summary>Explore ▾</summary>
              <div>
                {Object.entries(EXPLORE).map(([group, links]) => (
                  <div key={group}>
                    <h4>{group}</h4>
                    <ul>
                      {links.map(([l, h]) => (
                        <li key={l}>
                          <a href={h}>{l}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
            {nav("/programs", "Programs")}
            {nav("/plus", "Scholarion Plus")}
            {nav("/pricing", "Pricing")}
            {nav("/teams", "For Teams")}
            {nav("/blog", "Blog")}
          </nav>
          <div className="header-search" style={{ width: 240 }}>
            <SearchBox placeholder="What do you want to learn?" />
          </div>
          <div className="header-actions">
            {viewer ? (
              <a className="btn btn-primary btn-sm" href="/app">
                My Learning
              </a>
            ) : (
              <>
                <a className="btn btn-outline btn-sm" href="/login">
                  Sign In
                </a>
                <a className="btn btn-primary btn-sm" href="/signup">
                  Join for Free
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
  const col = (title: string, links: [string, string][]) => (
    <div>
      <h4>{title}</h4>
      <ul>
        {links.map(([l, h]) => (
          <li key={l}>
            <a href={h}>{l}</a>
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
            <p className="small">A global learning platform. Non-credit professional training by Scholarion Academy.</p>
          </div>
          {col("Learn", [
            ["Explore catalog", "/explore"],
            ["How the programs stack", "/programs"],
            ["Topics", "/hubs"],
            ["Blog", "/blog"],
            ["Scholarion Plus", "/plus"],
            ["Financial aid", "/financial-aid"],
          ])}
          {col("Organizations", [
            ["For Teams", "/teams"],
            ["Partner with us", "/teams?kind=partner"],
            ["Verify a credential", "/verify"],
          ])}
          {col("Support", [
            ["Help Center", "/help"],
            ["Accessibility", "/help#accessibility"],
            ["Refund policy", "/help#refunds"],
            ["Privacy & cookies", "/help#privacy"],
          ])}
        </div>
        <hr className="divider" style={{ background: "rgba(255,255,255,.12)" }} />
        <div className="row between small">
          <span>© 2026 Scholarion Academy · Haven Digital Systems</span>
          <span>English · USD</span>
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

const SIDENAV: [string, string, string][] = [
  ["/app", "Home", "home"],
  ["/app/courses", "My Courses", "book"],
  ["/app/calendar", "Calendar", "calendar"],
  ["/app/live", "Live Sessions", "live"],
  ["/app/grades", "Grades", "chart"],
  ["/app/credentials", "Credentials", "award"],
  ["/app/tutor", "AI Tutor", "sparkle"],
  ["/app/proctoring", "Proctored Assessments", "shield"],
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
        Skip to content
      </a>
      <aside className="sidebar" aria-label="Learner navigation">
        <Brand compact href="/app" />
        <ul className="sidenav">
          {SIDENAV.map(([href, label, icon]) => (
            <li key={href}>
              <a href={href} aria-current={current === href ? "page" : undefined}>
                <Icon name={icon} size={18} />
                {label}
              </a>
            </li>
          ))}
          <li className="sep" aria-hidden="true" />
          <li>
            <a href="/explore">
              <Icon name="search" size={18} />
              Explore catalog
            </a>
          </li>
          <li>
            <a href="/app/account" aria-current={current === "/app/account" ? "page" : undefined}>
              <Icon name="card" size={18} />
              Account & Billing
            </a>
          </li>
          <li>
            <a href="/app/security" aria-current={current === "/app/security" ? "page" : undefined}>
              <Icon name="lock" size={18} />
              Security & Privacy
            </a>
          </li>
          <li>
            <a href="/help">
              <Icon name="help" size={18} />
              Help
            </a>
          </li>
          {viewer.orgAdminOf && (
            <li>
              <a href={`/org/${viewer.orgAdminOf}`} aria-current={current.startsWith("/org") ? "page" : undefined}>
                <Icon name="users" size={18} />
                My Organization
              </a>
            </li>
          )}
          {viewer.roles.some((r) => r === "instructor" || r === "platform_admin") && (
            <li>
              <a href="/teach" aria-current={current.startsWith("/teach") ? "page" : undefined}>
                <Icon name="book" size={18} />
                Teach
              </a>
            </li>
          )}
          {isStaff && (
            <li>
              <a href="/admin" aria-current={current.startsWith("/admin") ? "page" : undefined}>
                <Icon name="settings" size={18} />
                Staff & Admin
              </a>
            </li>
          )}
        </ul>
      </aside>
      <div>
        <div className="topbar">
          <div className="search">
            <SearchBox placeholder="Search courses, content, or help…" />
          </div>
          <div className="row" style={{ marginLeft: "auto", gap: 16 }}>
            <a href="/app/notifications" className="btn btn-ghost btn-sm bell" aria-label={viewer.unread ? `Notifications, ${viewer.unread} unread` : "Notifications"}>
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
                <small>{viewer.roles.includes("platform_admin") ? "Admin" : viewer.roles.includes("instructor") ? "Instructor" : viewer.orgAdminOf ? "Organization admin" : "Student"}</small>
              </span>
            </div>
            <form method="post" action="/api/v1/auth/signout">
              <button className="btn btn-ghost btn-sm" type="submit">
                Sign out
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
