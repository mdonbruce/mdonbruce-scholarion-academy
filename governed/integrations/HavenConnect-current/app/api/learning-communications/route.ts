import { env } from "cloudflare:workers";
import { canAccessApp, appSlug, DEFAULT_APP } from "@/lib/apps";
import { isOakHavenStaff, isPlatformAdmin } from "@/lib/access";
import { loadApps, runInApp, listKind, getRec, upsert, event, db, nid, T } from "@/lib/agentic-server";
import { planClass, capabilityFresh, runGenesysMock, GENESYS_CAPABILITIES } from "@/lib/learning-communications";

type Json = Record<string, any>;
const cfg = () => env as unknown as Record<string, string | undefined>;
const clean = (value: unknown, length = 160) => String(value ?? "").trim().slice(0, length);
const fail = (message: string, status = 400) => Response.json({ error: message }, { status });
const providerName = (v: unknown) => v === "zoom" || v === "webex" ? v : null;
const token = (provider: string) => cfg()[provider === "zoom" ? "ZOOM_ACCESS_TOKEN" : "WEBEX_ACCESS_TOKEN"];

async function context(request: Request, requested: string, fn: (actor: string) => Promise<Response>) {
  const actor = clean(request.headers.get("oai-authenticated-user-email"), 180).toLowerCase();
  if (!actor) return fail("Sign in to use learning communications.", 401);
  const apps = await loadApps(), slug = appSlug(requested) || DEFAULT_APP;
  const app = apps.find(a => a.slug === slug);
  if (!app || !canAccessApp(app, actor, isPlatformAdmin(actor), isOakHavenStaff(actor))) return fail("You cannot access this product room.", 403);
  if (!app.education) return fail("Learning communications are available in education rooms.", 403);
  const database = cfg()[app.isolation === "dedicated" ? `DB_${slug.replace(/-/g, "_").toUpperCase()}` : "DB"];
  if (!database) return fail("This education room needs its dedicated database binding before it can be used.", 503);
  return runInApp(app, () => fn(actor));
}

async function courseFor(code: string, actor: string) {
  const course = (await listKind("course")).find(c => c.code === code);
  if (!course) throw new Error("Select a course in this product room.");
  const admins = String(cfg().HAVEN_CX_EDU_EMAILS || "").toLowerCase().split(",").map(s => s.trim());
  if (course.instructorEmail?.toLowerCase() !== actor && !admins.includes(actor) && !isPlatformAdmin(actor)) throw new Error("Only this course's instructor or an education administrator may change its sessions.");
  return course;
}

async function vendor(provider: "zoom" | "webex", path: string, method = "GET", body?: Json) {
  const secret = token(provider);
  if (!secret) throw new Error(`${provider === "zoom" ? "Zoom" : "Webex"} is awaiting an encrypted access token.`);
  const base = provider === "zoom" ? "https://api.zoom.us/v2" : "https://webexapis.com/v1";
  const response = await fetch(`${base}${path}`, {
    method, headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`${provider === "zoom" ? "Zoom" : "Webex"} returned ${response.status}. Recheck authorization and permissions.`);
  return response.status === 204 ? {} : await response.json() as Json;
}

async function providerCheck(provider: "zoom" | "webex") {
  const user = await vendor(provider, provider === "zoom" ? "/users/me" : "/people/me");
  return {
    provider, status: "PLANNED", verifiedAt: new Date().toISOString(),
    host: clean(provider === "zoom" ? user.email : (user.emails?.[0] || user.displayName), 180),
    plan: provider === "zoom" ? (user.type === 2 ? "Licensed host" : "Basic or unverified") : "Entitlement unverified",
    freeLimitMinutes: 40, participantCap: null, capabilityVerified: false,
    note: "Identity API passed; account capabilities remain unverified. Manual meeting links are available.",
  };
}

function manualLink(value: unknown, provider: string) {
  try {
    const url = new URL(clean(value, 1000));
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || !(provider === "zoom" ? host === "zoom.us" || host.endsWith(".zoom.us") : host === "webex.com" || host.endsWith(".webex.com"))) return null;
    return url.toString();
  } catch { return null; }
}

async function createVendorMeeting(provider: "zoom" | "webex", title: string, start: string, minutes: number) {
  if (provider === "zoom") {
    const j = await vendor("zoom", "/users/me/meetings", "POST", { topic: title, type: 2, start_time: start, duration: minutes, settings: { waiting_room: true, join_before_host: false, mute_upon_entry: true } });
    if (!j.id || !j.join_url) throw new Error("Zoom returned no usable meeting link.");
    return { providerId: String(j.id), joinUrl: String(j.join_url) };
  }
  const end = new Date(Date.parse(start) + minutes * 60000).toISOString();
  const j = await vendor("webex", "/meetings", "POST", { title, start, end, enabledAutoRecordMeeting: false });
  if (!j.id || !j.webLink) throw new Error("Webex returned no usable meeting link.");
  return { providerId: String(j.id), joinUrl: String(j.webLink) };
}

async function audit(actor: string, sessionId: string, type: string, details: Json) {
  await event({ sessionId, type: `learning.${type}`, actor, channel: "Web", details });
}

export async function GET(request: Request) {
  try {
    const app = new URL(request.url).searchParams.get("app") || "";
    return await context(request, app, async actor => {
      const [courses, sessions, saved, auditRows] = await Promise.all([
        listKind("course"), listKind("lc-session"), listKind("lc-connector"),
        db().prepare("SELECT session_id, event_type, actor, details, created_at FROM cx_events WHERE tenant_id = ? AND event_type LIKE 'learning.%' ORDER BY created_at DESC LIMIT 100").bind(T()).all<Json>(),
      ]);
      const allowedCourses = courses.filter(c => c.instructorEmail?.toLowerCase() === actor || isPlatformAdmin(actor) || String(cfg().HAVEN_CX_EDU_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).includes(actor));
      const connectors = ["zoom", "webex"].map(id => {
        const record = saved.find(c => c.provider === id);
        return { id, status: token(id) && record?.capabilityVerified && capabilityFresh(record?.verifiedAt) ? (record?.status || "PLANNED") : "PLANNED", plan: record?.plan || "Unverified", verifiedAt: token(id) ? record?.verifiedAt || null : null, note: token(id) ? record?.note || "Test this connection to verify the host." : "Add an encrypted provider token, then test the connection." };
      });
      connectors.push({ id: "genesys", status: "DISABLED", plan: "Subscription required", verifiedAt: null, note: "Mock tests only. No Genesys network calls." });
      const visibleSessions = sessions.filter(s => allowedCourses.some(c => c.code === s.courseCode)).sort((a,b) => String(b.startAt).localeCompare(String(a.startAt))).slice(0, 100);
      const visibleIds = new Set(visibleSessions.map(s => s.id));
      const auditEvents = (auditRows.results || []).filter(row => visibleIds.has(row.session_id) || (isPlatformAdmin(actor) && row.session_id === "communications"));
      return Response.json({ courses: allowedCourses.map(c => ({ code: c.code, name: c.name, instructorEmail: c.instructorEmail })), sessions: visibleSessions, connectors, genesys: GENESYS_CAPABILITIES.map(name => ({ name, status: "DISABLED" })), audit: auditEvents, viewer: actor });
    });
  } catch { return fail("Learning communications are temporarily unavailable.", 503); }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Json;
    return await context(request, clean(payload.app, 40), async actor => {
      const action = clean(payload.action, 40);
      if (action === "plan") return Response.json(planClass(Number(payload.liveMinutes), Array.isArray(payload.topics) ? payload.topics : [], Number(payload.asyncMinutes || 0), payload.classBlockMinutes === undefined ? undefined : Number(payload.classBlockMinutes)));
      if (action === "genesys.mock") {
        await audit(actor, "communications", "genesys.mock", { mode: "simulation", tests: 6 });
        return Response.json({ mode: "SIMULATED", tests: runGenesysMock() });
      }
      if (action === "provider.test") {
        if (!isPlatformAdmin(actor) && !String(cfg().HAVEN_CX_EDU_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).includes(actor)) return fail("An education administrator must test provider connections.", 403);
        const provider = providerName(payload.provider);
        if (!provider) return fail("Choose Zoom or Webex.");
        const result = await providerCheck(provider);
        await upsert(nid(`lc-connector:${provider}`), "lc-connector", result, actor);
        await audit(actor, "communications", "provider.test", { provider, status: result.status, verifiedAt: result.verifiedAt });
        return Response.json(result);
      }
      if (action === "session.create") {
        const code = clean(payload.courseCode, 30).toUpperCase(), course = await courseFor(code, actor);
        const provider = providerName(payload.provider);
        if (!provider) return fail("Choose Zoom or Webex.");
        const title = clean(payload.title, 180), startAt = new Date(payload.startAt).toISOString();
        if (!title || Date.parse(startAt) <= Date.now()) return fail("Add a title and a future class start time.");
        const plan = planClass(Number(payload.liveMinutes), Array.isArray(payload.topics) ? payload.topics : [], Number(payload.asyncMinutes || 0), Number(payload.classBlockMinutes));
        if (plan.overrunMinutes) return fail(`The timetable exceeds the class block by ${plan.overrunMinutes} minutes. Adjust live time or the class block.`);
        const mode = payload.mode === "provider" ? "provider" : "manual";
        const links = Array.isArray(payload.manualLinks) ? payload.manualLinks : [];
        if (mode === "manual" && (links.length !== plan.segments.length || links.some(link => !manualLink(link, provider)))) return fail(`Provide ${plan.segments.length} distinct, valid ${provider} meeting links.`);
        if (mode === "manual" && new Set(links.map((link: string) => manualLink(link, provider))).size !== links.length) return fail("Each segment needs a distinct meeting link.");
        const connector = await getRec(nid(`lc-connector:${provider}`), "lc-connector");
        if (mode === "provider" && (!connector?.capabilityVerified || !capabilityFresh(connector?.verifiedAt))) return fail("Verified account scheduling capabilities are required. Use instructor-supplied links until the capability adapter is connected.", 409);
        const created: string[] = [];
        let segments: Json[] = [];
        try {
          for (const segment of plan.segments) {
            const start = new Date(Date.parse(startAt) + segment.offsetMinutes * 60000).toISOString();
            const meeting = mode === "provider" ? await createVendorMeeting(provider, `${title} — Part ${segment.number}`, start, segment.liveMinutes) : { providerId: "", joinUrl: manualLink(links[segment.number - 1], provider)! };
            if (meeting.providerId) created.push(meeting.providerId);
            segments.push({ ...segment, startAt: start, ...meeting, attendance: [] });
          }
        } catch (error) {
          await Promise.allSettled(created.map(id => vendor(provider, provider === "zoom" ? `/meetings/${encodeURIComponent(id)}` : `/meetings/${encodeURIComponent(id)}`, "DELETE")));
          throw error;
        }
        const id = nid(`lc-session:${crypto.randomUUID()}`);
        const item = { title, courseCode: code, courseName: course.name, instructor: actor, provider, mode: mode === "manual" ? "MANUAL_LINK" : "PROVIDER_CREATED", status: "Draft", startAt, liveMinutes: Number(payload.liveMinutes), blockMinutes: plan.blockMinutes, asyncMinutes: plan.asyncMinutes, classBlockMinutes: plan.classBlockMinutes, segments, createdAt: new Date().toISOString(), recap: "", recapStatus: "Not drafted", attendanceStatus: "Unconfirmed", scholarionStatus: "Not connected" };
        await upsert(id, "lc-session", item, actor);
        await audit(actor, id, "session.created", { provider, mode: item.mode, courseCode: code, segmentCount: segments.length });
        return Response.json({ item: { ...item, id } }, { status: 201 });
      }
      if (["session.approve", "session.recap", "session.attendance", "session.link"].includes(action)) {
        const id = clean(payload.id, 120), item = await getRec(id, "lc-session");
        if (!item) return fail("Session not found in this room.", 404);
        await courseFor(item.courseCode, actor);
        if (action === "session.approve") { item.status = "Approved for sharing"; item.approvedAt = new Date().toISOString(); item.approvedBy = actor; }
        if (action === "session.recap") { item.recap = clean(payload.recap, 3000); if (!item.recap) return fail("Add a recap before approving it."); item.recapStatus = "Instructor approved"; item.recapApprovedBy = actor; }
        if (action === "session.attendance") { const learner = clean(payload.learner, 120), minutes = Number(payload.minutes); if (!learner || !Number.isInteger(minutes) || minutes < 0 || minutes > item.liveMinutes) return fail("Add a learner reference and valid minutes."); item.attendance = [...(item.attendance || []).filter((a: Json) => a.learner !== learner), { learner, minutes, status: minutes < item.liveMinutes ? "Partial — review" : "Full — review", confirmedBy: actor, confirmedAt: new Date().toISOString() }]; item.attendanceStatus = "Instructor confirmed"; }
        if (action === "session.link") { const index = Number(payload.segment) - 1, newUrl = manualLink(payload.link, item.provider); if (!Number.isInteger(index) || index < 0 || index >= item.segments.length || !newUrl) return fail("Select a segment and a valid provider link."); item.segments[index].joinUrl = newUrl; item.segments[index].providerId = ""; item.mode = "MANUAL_LINK"; }
        await upsert(id, "lc-session", item, actor);
        await audit(actor, id, action, { courseCode: item.courseCode, segment: action === "session.link" ? Number(payload.segment) : undefined, learner: action === "session.attendance" ? clean(payload.learner, 120) : undefined });
        return Response.json({ item });
      }
      return fail("Unknown learning communications action.");
    });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) return fail("Check the session details and start time.");
    return fail(error instanceof Error ? error.message : "Action failed.", 503);
  }
}
