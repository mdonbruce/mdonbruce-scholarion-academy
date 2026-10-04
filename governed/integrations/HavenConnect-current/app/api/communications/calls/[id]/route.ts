import { eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { rtcCalls } from "../../../../../db/schema";
import { gateway, requireStaff } from "../../_lib";
const validId = (id: string) => /^[a-zA-Z0-9_-]{8,100}$/.test(id);
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; if (!validId(id)) return Response.json({ error: "Invalid call" }, { status: 400 }); const [call] = await getDb().select().from(rtcCalls).where(eq(rtcCalls.id, id)).limit(1); return call ? Response.json({ call }) : Response.json({ error: "Call not found" }, { status: 404 }); }
  catch { return Response.json({ error: "Call status is unavailable" }, { status: 503 }); }
}
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireStaff(request); const { id } = await context.params; if (!validId(id)) return Response.json({ error: "Invalid call" }, { status: 400 }); const body = await request.json() as any; if (body.action === "answer" && String(body.answer || "").startsWith("v=0")) await getDb().update(rtcCalls).set({ answer: body.answer, status: "Connected", updatedAt: new Date() }).where(eq(rtcCalls.id, id)); else if (["Rejected", "Ended"].includes(body.status)) await getDb().update(rtcCalls).set({ status: body.status, updatedAt: new Date() }).where(eq(rtcCalls.id, id)); else return Response.json({ error: "Unsupported internal call update" }, { status: 400 }); return Response.json({ updated: true }); }
  catch { return Response.json({ error: "Call could not be updated" }, { status: 503 }); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try { requireStaff(request); const { id } = await context.params; if (!validId(id)) return Response.json({ error: "Invalid call" }, { status: 400 }); const [internal] = await getDb().select({ id: rtcCalls.id }).from(rtcCalls).where(eq(rtcCalls.id, id)).limit(1); if (internal) await getDb().update(rtcCalls).set({ status: "Ended", updatedAt: new Date() }).where(eq(rtcCalls.id, id)); else await gateway(`/v1/calls/${id}`, {}, "DELETE"); return Response.json({ ended: true }); }
  catch (error: any) { return Response.json({ error: error.message || "Call could not be ended" }, { status: 503 }); }
}
