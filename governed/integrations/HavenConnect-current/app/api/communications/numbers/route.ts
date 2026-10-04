import { asc } from "drizzle-orm";
import { getDb } from "../../../../db";
import { havenNumbers } from "../../../../db/schema";
import { normalizeDestination, validExtension } from "../_lib";

const defaults = [
  ["+999-800-002-001", "2001", "Reservations", "staff", "extension", "2001"],
  ["+999-800-002-002", "2002", "Guest Services", "staff", "extension", "2002"],
  ["+999-800-002-003", "2003", "Front Desk", "staff", "extension", "2003"],
  ["+888-700-000-0001", "7000", "Guest Services Department", "department", "ring_group", "guest-services"],
  ["+888-710-000-0001", "7100", "Reservations Queue", "department", "queue", "reservations"],
  ["+888-730-000-0001", "7300", "Housekeeping Department", "department", "ring_group", "housekeeping"],
  ["+777-900-000-0000", "9000", "Haven AI Concierge", "ai", "ai", "haven-ai"],
  ["+777-900-000-0001", "9001", "Amara AI Concierge", "ai", "ai", "amara"],
  ["+777-900-000-0002", "9002", "Amara Live Sync", "ai", "ai", "amara"],
] as const;

const clean = (value: unknown, max = 80) => String(value || "").trim().slice(0, max);
const formatVirtual = (digits: string) => `+${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}-${digits.slice(9)}`;

async function ensureDefaults() {
  const db = getDb();
  const existing = await db.select({ virtualNumber: havenNumbers.virtualNumber }).from(havenNumbers);
  const known = new Set(existing.map((row) => normalizeDestination(row.virtualNumber)));
  for (const [virtualNumber, extension, label, category, routeType, routeTarget] of defaults) {
    if (!known.has(normalizeDestination(virtualNumber))) {
      await db.insert(havenNumbers).values({ virtualNumber, extension, label, category, routeType, routeTarget, tenant: "Oak Haven", edgeAlias: "internal" });
    }
  }
}

export async function GET(request: Request) {
  try {
    await ensureDefaults();
    const lookup = new URL(request.url).searchParams.get("lookup");
    const db = getDb();
    if (lookup) {
      const normalized = normalizeDestination(lookup);
      const items = await db.select().from(havenNumbers);
      const item = items.find((row) => row.status === "Active" && (normalizeDestination(row.virtualNumber) === normalized || row.extension === normalized));
      return item ? Response.json({ item }) : Response.json({ error: "HavenConnect number not found" }, { status: 404 });
    }
    return Response.json({ items: await db.select().from(havenNumbers).orderBy(asc(havenNumbers.extension)) });
  } catch {
    return Response.json({ error: "Number registry is temporarily unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const extension = clean(body.extension, 4);
    const label = clean(body.label);
    const category = clean(body.category, 24).toLowerCase();
    const routeType = clean(body.routeType, 24).toLowerCase();
    const routeTarget = clean(body.routeTarget, 120);
    if (!validExtension(extension) || !label) return Response.json({ error: "A valid 4-digit extension and label are required" }, { status: 400 });
    if (!["staff", "department", "ai", "tenant", "temporary", "masked"].includes(category)) return Response.json({ error: "Choose a supported number category" }, { status: 400 });
    if (!["extension", "ring_group", "queue", "ai", "sip", "pstn", "whatsapp"].includes(routeType) || !routeTarget) return Response.json({ error: "Choose a valid route and target" }, { status: 400 });
    const prefix = category === "ai" || category === "temporary" || category === "masked" ? "777" : category === "department" ? "888" : "999";
    const digits = `${prefix}${crypto.getRandomValues(new Uint32Array(1))[0].toString().padStart(10, "0").slice(0, 10)}`;
    const virtualNumber = formatVirtual(digits);
    const [item] = await getDb().insert(havenNumbers).values({ virtualNumber, extension, label, category, routeType, routeTarget, tenant: clean(body.tenant) || "Oak Haven", edgeAlias: clean(body.edgeAlias) || "internal", expiresAt: category === "temporary" ? new Date(Date.now() + 86400000) : null }).returning();
    return Response.json({ item }, { status: 201 });
  } catch (error: any) {
    const duplicate = String(error?.message || "").toLowerCase().includes("unique");
    return Response.json({ error: duplicate ? "That extension is already assigned" : "Number could not be generated" }, { status: duplicate ? 409 : 503 });
  }
}
