"use client";
import { AgenticAI } from "./agentic-ai";

/** Product-room members from outside Oak Haven see only the Agentic AI rooms they belong to. */
export function PartnerWorkspace({ email, signOutHref, rooms }: { email: string; signOutHref: string; rooms: string[] }) {
  return <div className="hc-partner">
    <header><div><h1>HavenConnect Agentic AI</h1><p>{rooms.join(" · ")}</p></div><div style={{ display: "flex", gap: 14, alignItems: "center" }}><span id="agentic-header-slot" /><span style={{ fontSize: 13, color: "#7b746b" }}>{email}</span><a href={signOutHref} target="_top">Sign out</a></div></header>
    <AgenticAI />
  </div>;
}
