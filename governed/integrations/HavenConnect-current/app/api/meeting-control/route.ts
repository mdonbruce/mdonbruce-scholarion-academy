import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  meetingAgentProposals,
  meetingAudit,
  meetingRecords,
  meetingRooms,
  roomBookings,
  roomReservationSlots,
  tasks,
} from "../../../db/schema";

const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const parseList = (value: unknown) => Array.isArray(value) ? value.map((item) => clean(item, 180)).filter(Boolean).slice(0, 50) : [];
const viewer = (request: Request) => {
  const email = clean(request.headers.get("oai-authenticated-user-email"), 180).toLowerCase();
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  const name = encoded ? decodeURIComponent(encoded) : email.split("@")[0] || "Anonymous viewer";
  return { email, name, staff: email.endsWith("@oakhavensuites.com") };
};
const requireStaff = (request: Request) => {
  const user = viewer(request);
  if (!user.staff) throw new Response(JSON.stringify({ error: "Sign in with an authorized @oakhavensuites.com account to change meeting or room records." }), { status: 401, headers: { "content-type": "application/json" } });
  return user;
};
const jsonList = (value: string) => { try { return JSON.parse(value); } catch { return []; } };
const slots = (startAt: string, endAt: string) => {
  const start = new Date(startAt).getTime(), end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 12 * 60 * 60 * 1000) return [];
  const first = Math.floor(start / 900000) * 900000, result: string[] = [];
  for (let time = first; time < end; time += 900000) result.push(new Date(time).toISOString());
  return result;
};

export async function GET(request: Request) {
  try {
    const db = getDb();
    const [meetings, proposals, rooms, bookings, audit] = await Promise.all([
      db.select().from(meetingRecords).orderBy(desc(meetingRecords.startAt)).limit(100),
      db.select().from(meetingAgentProposals).orderBy(desc(meetingAgentProposals.createdAt)).limit(100),
      db.select().from(meetingRooms).orderBy(meetingRooms.name).limit(100),
      db.select().from(roomBookings).orderBy(desc(roomBookings.startAt)).limit(100),
      db.select().from(meetingAudit).orderBy(desc(meetingAudit.createdAt)).limit(100),
    ]);
    const user = viewer(request);
    return Response.json({
      viewer: user,
      meetings: meetings.map((item) => ({ ...item, agenda: jsonList(item.agenda), attendees: jsonList(item.attendees) })),
      proposals,
      rooms: rooms.map((item) => ({ ...item, equipment: jsonList(item.equipment), supportedProviders: jsonList(item.supportedProviders) })),
      bookings,
      audit,
      connectors: [
        { id: "havenroute", name: "HavenRoute", status: "Awaiting Authorization", note: "Mail and file scopes must be granted and tested." },
        { id: "tasks", name: "HavenConnect Tasks", status: "Connected", note: "Native D1 task bridge verified in this application." },
        { id: "exchange", name: "Microsoft Exchange Online", status: "Not Configured", note: "Requires Microsoft administration, licensing, and room mailboxes." },
        { id: "teams", name: "Microsoft Teams", status: "Not Configured", note: "Requires Microsoft Graph authorization and applicable licenses." },
        { id: "planner", name: "Microsoft Planner", status: "Not Configured", note: "Requires Microsoft Graph authorization and applicable licenses." },
        { id: "google", name: "Google Calendar / Google Meet", status: "Not Configured", note: "Requires authorized Google Workspace OAuth." },
        { id: "zoom", name: "Zoom", status: "Not Configured", note: "Requires a tested Zoom OAuth application." },
        { id: "slack", name: "Slack", status: "Not Configured", note: "Requires a tested Slack application." },
        { id: "jira", name: "Jira", status: "Not Configured", note: "Requires authorized Jira API access." },
        { id: "azure", name: "Azure DevOps", status: "Not Configured", note: "Requires authorized Azure DevOps access." },
        { id: "asana", name: "Asana", status: "Not Configured", note: "Requires authorized Asana OAuth." },
      ],
    });
  } catch {
    return Response.json({ error: "Meeting control data is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const user = requireStaff(request), payload = await request.json(), kind = clean(payload.kind, 40), db = getDb();
    if (kind === "meeting") {
      const title = clean(payload.title, 180), startAt = clean(payload.startAt, 40), endAt = clean(payload.endAt, 40);
      if (!title || !slots(startAt, endAt).length) return Response.json({ error: "Provide a title and a valid start and end time." }, { status: 400 });
      const item = { id: crypto.randomUUID(), title, purpose: clean(payload.purpose, 1200), organizer: user.email, startAt, endAt, lifecycle: "Pre-Meeting", agenda: JSON.stringify(parseList(payload.agenda)), attendees: JSON.stringify(parseList(payload.attendees)), consentStatus: "Not requested", recordingStatus: "Off", transcriptStatus: "Off" };
      await db.batch([
        db.insert(meetingRecords).values(item),
        db.insert(meetingAudit).values({ meetingId: item.id, actor: user.email, eventType: "Meeting created", detail: `Created ${title}`, consequential: true }),
      ]);
      return Response.json({ item: { ...item, agenda: jsonList(item.agenda), attendees: jsonList(item.attendees) } }, { status: 201 });
    }
    if (kind === "proposal") {
      const title = clean(payload.title, 180), meetingId = clean(payload.meetingId, 80);
      if (!title || !meetingId) return Response.json({ error: "A meeting and proposal title are required." }, { status: 400 });
      const proposedOwner = clean(payload.proposedOwner, 180), proposedDeadline = clean(payload.proposedDeadline, 40);
      const item = { id: crypto.randomUUID(), meetingId, agent: clean(payload.agent, 100) || "Haven Meeting Agent", actionType: clean(payload.actionType, 80) || "Follow-up", title, details: clean(payload.details, 2000), proposedOwner, proposedDeadline, source: clean(payload.source, 600), destination: clean(payload.destination, 100) || "HavenConnect Tasks", status: "Proposed" };
      await db.insert(meetingAgentProposals).values(item);
      return Response.json({ item }, { status: 201 });
    }
    if (kind === "room") {
      const name = clean(payload.name, 120), roomEmail = clean(payload.roomEmail, 180).toLowerCase();
      if (!name || !roomEmail.endsWith("@oakhavensuites.com")) return Response.json({ error: "Provide a room name and approved Oak Haven room address." }, { status: 400 });
      const item = { id: crypto.randomUUID(), name, roomEmail, building: clean(payload.building, 100), floor: clean(payload.floor, 60), location: clean(payload.location, 200), roomType: clean(payload.roomType, 100), capacity: Math.max(1, Math.min(500, Number(payload.capacity) || 1)), accessible: Boolean(payload.accessible), equipment: JSON.stringify(parseList(payload.equipment)), supportedProviders: JSON.stringify(parseList(payload.supportedProviders)), operatingStatus: "Unknown", maintenanceStatus: "On-site assessment required", bookingWindowDays: 90, maxDurationMinutes: 240, externalMeetingPolicy: "Approval required" };
      await db.insert(meetingRooms).values(item);
      return Response.json({ item: { ...item, equipment: jsonList(item.equipment), supportedProviders: jsonList(item.supportedProviders) } }, { status: 201 });
    }
    if (kind === "booking") {
      const roomId = clean(payload.roomId, 80), title = clean(payload.title, 180), startAt = clean(payload.startAt, 40), endAt = clean(payload.endAt, 40), reservationSlots = slots(startAt, endAt);
      if (!roomId || !title || !reservationSlots.length) return Response.json({ error: "Select a room and provide a valid meeting time." }, { status: 400 });
      const [room] = await db.select().from(meetingRooms).where(eq(meetingRooms.id, roomId)).limit(1);
      if (!room || room.operatingStatus === "Maintenance" || room.operatingStatus === "Offline") return Response.json({ error: "This room is unavailable or not in service." }, { status: 409 });
      if ((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000 > room.maxDurationMinutes) return Response.json({ error: `This room has a ${room.maxDurationMinutes}-minute maximum booking duration.` }, { status: 400 });
      const booking = { id: crypto.randomUUID(), roomId, title, organizer: user.email, startAt, endAt, status: "Confirmed" };
      try {
        await db.batch([
          db.insert(roomBookings).values(booking),
          ...reservationSlots.map((slot) => db.insert(roomReservationSlots).values({ id: crypto.randomUUID(), roomId, bookingId: booking.id, slot })),
          db.insert(meetingAudit).values({ meetingId: clean(payload.meetingId, 80) || "workspace", actor: user.email, eventType: "Room booked", detail: `${room.name}: ${startAt}–${endAt}`, consequential: true }),
        ]);
      } catch {
        return Response.json({ error: "That room conflicts with another reservation. No duplicate booking was created." }, { status: 409 });
      }
      return Response.json({ item: booking }, { status: 201 });
    }
    return Response.json({ error: "Unknown meeting control action." }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "The meeting control action could not be completed." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = requireStaff(request), payload = await request.json(), kind = clean(payload.kind, 40), db = getDb();
    if (kind === "proposal") {
      const id = clean(payload.id, 80), decision = payload.decision === "Approved" ? "Approved" : payload.decision === "Rejected" ? "Rejected" : "";
      if (!id || !decision) return Response.json({ error: "Select Approve or Reject." }, { status: 400 });
      const [proposal] = await db.select().from(meetingAgentProposals).where(eq(meetingAgentProposals.id, id)).limit(1);
      if (!proposal || proposal.status !== "Proposed") return Response.json({ error: "This proposal has already been decided or no longer exists." }, { status: 409 });
      const external = proposal.destination !== "HavenConnect Tasks";
      if (decision === "Approved" && external) return Response.json({ error: `${proposal.destination} is not authenticated. The proposal remains pending.` }, { status: 409 });
      if (decision === "Approved" && (!proposal.proposedOwner || !proposal.proposedDeadline)) return Response.json({ error: "Confirm the task owner and deadline before approval. The proposal remains pending." }, { status: 409 });
      const externalId = decision === "Approved" ? `HCT-${Date.now().toString(36).toUpperCase()}` : null;
      const updates = db.update(meetingAgentProposals).set({ status: decision, decidedBy: user.email, externalId }).where(and(eq(meetingAgentProposals.id, id), eq(meetingAgentProposals.status, "Proposed")));
      const audit = db.insert(meetingAudit).values({ meetingId: proposal.meetingId, actor: user.email, eventType: `Agent proposal ${decision.toLowerCase()}`, detail: `${proposal.title}${externalId ? ` · ${externalId}` : ""}`, consequential: true });
      if (decision === "Approved") {
        await db.batch([
          updates,
          audit,
          db.insert(tasks).values({ title: proposal.title, assignee: proposal.proposedOwner, priority: "Normal", due: proposal.proposedDeadline, status: "To do" }),
        ]);
      } else {
        await db.batch([updates, audit]);
      }
      return Response.json({ ok: true, status: decision, externalId });
    }
    if (kind === "room-status") {
      const id = clean(payload.id, 80), operatingStatus = ["Healthy", "Warning", "Degraded", "Offline", "Maintenance", "Update Required", "Unknown"].includes(payload.operatingStatus) ? payload.operatingStatus : "Unknown";
      const [item] = await db.update(meetingRooms).set({ operatingStatus, maintenanceStatus: clean(payload.maintenanceStatus, 200) || (operatingStatus === "Maintenance" ? "Placed in maintenance" : "Assessment required") }).where(eq(meetingRooms.id, id)).returning();
      if (!item) return Response.json({ error: "Room not found." }, { status: 404 });
      await db.insert(meetingAudit).values({ meetingId: "workspace", actor: user.email, eventType: "Room status changed", detail: `${item.name}: ${operatingStatus}`, consequential: true });
      return Response.json({ item });
    }
    if (kind === "pause-agents") {
      await db.insert(meetingAudit).values({ meetingId: "workspace", actor: user.email, eventType: payload.paused ? "All meeting agents paused" : "Meeting agents resumed", detail: "Administrator emergency control", consequential: true });
      return Response.json({ paused: Boolean(payload.paused) });
    }
    return Response.json({ error: "Unknown update." }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "The update could not be completed." }, { status: 503 });
  }
}
