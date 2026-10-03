/** GET /verify/lookup?id=… → /verify/{id} (keeps the lookup form working without JS). */
export function GET(req: Request) {
  const id = (new URL(req.url).searchParams.get("id") ?? "").trim().replace(/[^A-Za-z0-9_]/g, "");
  return new Response(null, { status: 303, headers: { location: id ? `/verify/${id}` : "/verify" } });
}
