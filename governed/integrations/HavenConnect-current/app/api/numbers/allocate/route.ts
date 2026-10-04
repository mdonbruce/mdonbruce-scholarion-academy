import { allocateNumber } from "../_service";
export async function POST(request: Request) { try { return Response.json({ item: await allocateNumber(await request.json()) }, { status: 201 }); } catch (e: any) { return Response.json({ error: e.message || "Allocation failed" }, { status: 400 }); } }
