import { config } from "../../communications/_lib";
import { loadApps, runInApp, event, getRec, listKind, upsert, db, T, nid } from "@/lib/agentic-server";
import { appSlug, secretName } from "@/lib/apps";
import { classifyWith, retrieveGuidance } from "@/lib/cx-intelligence";

/**
 * Server-to-server intake for Haven products (HavenUP, Scholaris, HomePilot, …).
 * The product's backend signs `${x-haven-timestamp}.${rawBody}` with HMAC-SHA256 using the room's
 * HAVEN_INBOUND_SECRET_<SLUG> and sends it as x-haven-signature: sha256=<hex>.
 * Messages land in that product's room as sessions; nothing is replied automatically.
 */
const CHANNELS = ["Web", "Mobile", "Voice", "Email", "SMS", "WhatsApp", "Instagram", "Messenger", "X", "Facebook"];
const clean = (v: unknown, n = 400) => String(v ?? "").trim().slice(0, n);
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const json = (body: unknown, status = 200) => Response.json(body, { status });

async function verify(secret: string, signed: string, supplied: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed)));
  if (expected.length !== supplied.length) return false;
  let diff = 0; for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    const slug = appSlug(request.headers.get("x-haven-app") || ""), apps = await loadApps(), app = apps.find(a => a.slug === slug);
    if (!app || app.status === "Archived") return json({ error: "Unknown product" }, 404);
    const secret = config()[secretName(slug)];
    if (!secret) return json({ error: `Inbound messages are not enabled for ${app.name}. Set ${secretName(slug)}.` }, 503);
    const ts = request.headers.get("x-haven-timestamp") || "", sig = (request.headers.get("x-haven-signature") || "").replace(/^sha256=/, "").toLowerCase();
    if (!ts || Math.abs(Date.now() - Number(ts) * 1000) > 5 * 60 * 1000) return json({ error: "Stale or missing timestamp" }, 401);
    if (!sig || !(await verify(secret, `${ts}.${raw}`, sig))) return json({ error: "Invalid signature" }, 401);
    let body: any; try { body = JSON.parse(raw); } catch { return json({ error: "Body must be JSON" }, 400); }
    const text = clean(body.text, 3000), externalId = clean(body.externalId, 120), messageId = clean(body.messageId || request.headers.get("x-haven-message-id"), 120);
    if (!text || !externalId) return json({ error: "externalId and text are required" }, 400);
    const channel = CHANNELS.includes(body.channel) ? body.channel : "Web", actor = `${app.name} · inbound`;

    return await runInApp(app, async () => {
      if (messageId) {
        const dup = await db().prepare("SELECT session_id FROM cx_events WHERE tenant_id = ? AND event_type = 'message.received' AND json_extract(details, '$.messageId') = ? LIMIT 1").bind(T(), messageId).first<any>();
        if (dup) return json({ sessionId: dup.session_id, duplicate: true });
      }
      const found = await db().prepare("SELECT id, payload FROM cx_records WHERE tenant_id = ? AND kind = 'session' AND json_extract(payload, '$.externalId') = ? ORDER BY updated_at DESC LIMIT 1").bind(T(), externalId).first<any>();
      let session = found ? { ...JSON.parse(found.payload), id: found.id } : null;
      const [labels, routing, knowledge, settings] = await Promise.all([listKind("label"), listKind("routing"), listKind("knowledge"), getRec(nid("settings:agentic"), "settings")]);
      const triage = classifyWith(text, { labels, routing });
      if (!session || session.status === "Resolved") {
        const id = crypto.randomUUID();
        session = { id, externalId, contextId: "", persona: triage.persona, channel, channelsUsed: [channel], subject: clean(body.subject, 180) || text.slice(0, 80), status: "Open", startedAt: new Date().toISOString(), customer: { name: clean(body.customer?.name, 120), reference: clean(body.customer?.reference, 80) }, source: "inbound" };
        await upsert(id, "session", session, actor);
        await event({ sessionId: id, channel, type: "session.started", actor, details: { id, externalId } });
      } else if (session.channel !== channel) {
        await event({ sessionId: session.id, channel, type: "channel.switched", actor, details: { from: session.channel, to: channel } });
        session = { ...session, channel, channelsUsed: [...new Set([...(session.channelsUsed || [session.channel]), channel])] };
      }
      await event({ sessionId: session.id, channel, type: "message.received", actor, details: { text, messageId, customer: clean(body.customer?.name, 120) } });
      if (settings?.agentsPaused?.["Ticket Classification"]) {
        await event({ sessionId: session.id, channel, type: "ticket.triage.skipped", actor: "HavenConnect classifier", details: { reason: "Ticket Classification agent paused" } });
      } else {
        const guidance = settings?.agentsPaused?.["Insights & Knowledge Gap"] ? [] : retrieveGuidance(text, knowledge as any);
        await event({ sessionId: session.id, channel, type: "ticket.triaged", actor: "HavenConnect classifier", details: { ...triage, guidance, knowledgeGap: !guidance.length } });
        session = { ...session, ...triage, lastMessageAt: new Date().toISOString() };
      }
      await upsert(session.id, "session", session, actor);
      return json({ sessionId: session.id, workspace: app.slug, intent: triage.intent, priority: triage.priority, needsHuman: triage.needsHuman }, found ? 200 : 201);
    });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Inbound intake is unavailable" }, 503); }
}
