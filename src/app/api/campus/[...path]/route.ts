import { handleCampus } from "@/campus/http/router";

/** Mounts the Scholarion Campus API at /api/campus/* (Node runtime: crypto, http2, fs). */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Params): Promise<Response> {
  const { path } = await params;
  return handleCampus(req, path.join("/"));
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
