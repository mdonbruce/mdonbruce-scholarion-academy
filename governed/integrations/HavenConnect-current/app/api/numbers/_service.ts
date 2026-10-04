import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { numberAllocations } from "../../../db/schema";

export const clean = (value: unknown, max = 120) => String(value ?? "").trim().slice(0, max);
export const tenant = (value: unknown) => clean(value || "oak_haven", 64).toLowerCase().replace(/[^a-z0-9_-]/g, "");
export const validType = (value: string) => ["extension", "virtual", "cloud"].includes(value);
const formatCloud = (digits: string) => `XC-${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;

export async function listNumbers(tenantId: string) {
  return getDb().select().from(numberAllocations).where(eq(numberAllocations.tenantId, tenantId)).orderBy(asc(numberAllocations.number));
}

export async function allocateNumber(input: Record<string, unknown>) {
  const tenantId = tenant(input.tenant_id);
  const type = clean(input.type, 16).toLowerCase();
  if (!tenantId || !validType(type)) throw new Error("A valid tenant and number type are required");
  const db = getDb();
  const start = clean(input.range, 16) === "3000-3999" ? 3000 : 2000;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidate = type === "extension"
      ? String(start + attempt)
      : formatCloud(crypto.getRandomValues(new Uint32Array(1))[0].toString().padStart(10, "0").slice(0, 10));
    try {
      const [item] = await db.insert(numberAllocations).values({
        id: crypto.randomUUID(), tenantId, number: candidate, type,
        status: clean(input.status, 16).toLowerCase() === "reserved" ? "reserved" : "allocated",
        assignedTo: clean(input.assigned_to) || null,
        realEntryPointId: type === "cloud" ? clean(input.real_entry_point_id) || null : null,
      }).returning();
      return item;
    } catch (error: any) {
      if (!String(error?.message || "").toLowerCase().includes("unique")) throw error;
    }
  }
  throw new Error("No free number is available in the selected range");
}

export async function mutateNumber(input: Record<string, unknown>, action: "release" | "assign" | "map") {
  const tenantId = tenant(input.tenant_id);
  const number = clean(input.number, 32);
  if (!tenantId || !number) throw new Error("Tenant and number are required");
  const db = getDb();
  const existing = await db.select().from(numberAllocations).where(and(eq(numberAllocations.tenantId, tenantId), eq(numberAllocations.number, number))).limit(1);
  if (!existing[0]) throw new Error("Number not found for this tenant");
  if (action === "map" && existing[0].type !== "cloud") throw new Error("Only cloud numbers can map to a real entry point");
  const values = action === "release"
    ? { status: "free", assignedTo: null, realEntryPointId: null, updatedAt: new Date() }
    : action === "assign"
      ? { status: "allocated", assignedTo: clean(input.assigned_to) || null, updatedAt: new Date() }
      : { status: "allocated", realEntryPointId: clean(input.real_entry_point_id) || null, updatedAt: new Date() };
  const [item] = await db.update(numberAllocations).set(values).where(and(eq(numberAllocations.tenantId, tenantId), eq(numberAllocations.number, number))).returning();
  return item;
}
