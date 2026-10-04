"use client";

import { AgenticAI } from "./agentic-ai";
import { TenantRegistry } from "./tenant-registry";
import { Workspace, type SignedInUser } from "./workspace";
import "./havenconnect-platform.css";

type Surface = "platform" | "staff" | "tenant-registry";

/** HavenConnect's primary application shell. The collaboration workspace is a separate destination. */
export function HavenConnectPlatform({ user, surface, staff, section }: {
  user: SignedInUser;
  surface: Surface;
  staff: boolean;
  section?: string;
}) {
  const nav = [
    { id: "platform", label: "Agentic AI", href: "/?view=platform" },
    ...(staff ? [
      { id: "staff", label: "Team operations", href: "/?view=staff" },
      { id: "tenant-registry", label: "Tenant control", href: "/?view=tenant-registry" },
    ] : []),
  ];
  return <main className={`hc-platform${surface === "staff" ? " staff-mode" : ""}`}>
    <header className="hc-platform-bar">
      <a className="hc-platform-brand" href="/?view=platform" aria-label="HavenConnect Agentic AI home"><span className="hc-platform-mark">H</span><span><b>HavenConnect</b><small>AGENTIC AI · HAVEN DIGITAL SYSTEMS</small></span></a>
      <nav aria-label="HavenConnect workspaces">{nav.map(item => <a key={item.id} href={item.href} aria-current={surface === item.id ? "page" : undefined}>{item.label}</a>)}</nav>
      <div className="hc-platform-account"><span id="agentic-header-slot" /><span className="hc-platform-name" title={user.email}>{user.displayName}</span><a href="/?view=login" target="_top">Account</a><a href={user.signOutHref} target="_top">Sign out</a></div>
    </header>
    <div className="hc-platform-stage">
      {surface === "platform" && <AgenticAI />}
      {surface === "staff" && staff && <Workspace user={user} initialView={section} />}
      {surface === "tenant-registry" && staff && <TenantRegistry />}
    </div>
  </main>;
}
