import { mutateNumber } from "../_service";
export async function POST(request: Request) { try { return Response.json({ item: await mutateNumber(await request.json(), "map") }); } catch (e: any) { return Response.json({ error: e.message || "Mapping failed" }, { status: 400 }); } }
