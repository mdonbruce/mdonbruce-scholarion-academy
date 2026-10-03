import { handleApi } from "@/bff/api";

/** Mounts the Academy BFF at /api/v1/*. Node runtime: the platform clients need Node APIs. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path: string[] }> };

async function handle(req: Request, { params }: Params): Promise<Response> {
  const { path } = await params;
  return handleApi(req, path.join("/"));
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
