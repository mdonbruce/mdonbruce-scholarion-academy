import { listNumbers, tenant } from "./_service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantId = tenant(url.searchParams.get("tenant_id"));
    const number = url.searchParams.get("number");
    const items = await listNumbers(tenantId);
    if (number) {
      const item = items.find((row) => row.number === number);
      return item ? Response.json({ item, route: item.realEntryPointId || item.assignedTo || item.number }) : Response.json({ error: "Number not found" }, { status: 404 });
    }
    const summary = items.reduce((acc: Record<string, number>, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1, [item.type]: (acc[item.type] || 0) + 1 }), { total: items.length });
    return Response.json({ items, summary });
  } catch { return Response.json({ error: "Number registry is unavailable" }, { status: 503 }); }
}
