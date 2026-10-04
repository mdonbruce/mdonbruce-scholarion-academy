import http2 from "node:http2";
import "../index";
import { broker, CampusError, resolveTenant } from "../core";
import * as entity from "../entity";
import { resolveApiToken } from "../services/integration";
import { ensureCampusSeed } from "../seed";

/**
 * Internal gRPC server (contracts/campus/v1/campus.proto) over node:http2 with a small
 * hand-written protobuf codec — no generated code, no extra dependencies.
 */

/* ---------------- Protobuf wire codec (varint + length-delimited) ---------------- */

export type FieldSpec = { [field: string]: { no: number; type: "string" | "int32" | "message" | "repeated"; of?: FieldSpecMap } };
type FieldSpecMap = FieldSpec;

function varint(n: number): Buffer {
  const out: number[] = [];
  let v = n >>> 0;
  while (v > 127) {
    out.push((v & 127) | 128);
    v >>>= 7;
  }
  out.push(v);
  return Buffer.from(out);
}
function readVarint(b: Buffer, i: number): [number, number] {
  let r = 0;
  let shift = 0;
  for (;;) {
    const byte = b[i++];
    r |= (byte & 127) << shift;
    if (!(byte & 128)) break;
    shift += 7;
  }
  return [r >>> 0, i];
}

export function encode(spec: FieldSpec, obj: Record<string, unknown>): Buffer {
  const parts: Buffer[] = [];
  for (const [name, f] of Object.entries(spec)) {
    const v = obj[name];
    if (v === undefined || v === null) continue;
    if (f.type === "int32") {
      if (v === 0) continue;
      parts.push(varint((f.no << 3) | 0), varint(Number(v)));
    } else if (f.type === "string") {
      const s = Buffer.from(String(v));
      if (!s.length) continue;
      parts.push(varint((f.no << 3) | 2), varint(s.length), s);
    } else {
      const list = f.type === "repeated" ? (v as Record<string, unknown>[]) : [v as Record<string, unknown>];
      for (const item of list) {
        const m = encode(f.of!, item);
        parts.push(varint((f.no << 3) | 2), varint(m.length), m);
      }
    }
  }
  return Buffer.concat(parts);
}

export function decode(spec: FieldSpec, b: Buffer): Record<string, unknown> {
  const byNo = new Map(Object.entries(spec).map(([n, f]) => [f.no, { name: n, ...f }]));
  const out: Record<string, unknown> = {};
  let i = 0;
  while (i < b.length) {
    let key: number;
    [key, i] = readVarint(b, i);
    const no = key >>> 3;
    const wire = key & 7;
    const f = byNo.get(no);
    if (wire === 0) {
      let v: number;
      [v, i] = readVarint(b, i);
      if (f) out[f.name] = v;
    } else if (wire === 2) {
      let len: number;
      [len, i] = readVarint(b, i);
      const chunk = b.subarray(i, i + len);
      i += len;
      if (!f) continue;
      if (f.type === "string") out[f.name] = chunk.toString("utf8");
      else if (f.type === "repeated") {
        const list = (out[f.name] as unknown[]) ?? [];
        list.push(decode(f.of!, chunk));
        out[f.name] = list;
      }
      else out[f.name] = decode(f.of!, chunk);
    } else throw new Error(`Unsupported wire type ${wire}`);
  }
  return out;
}

export const frame = (msg: Buffer) => {
  const h = Buffer.alloc(5);
  h.writeUInt8(0, 0);
  h.writeUInt32BE(msg.length, 1);
  return Buffer.concat([h, msg]);
};
export const unframe = (b: Buffer) => (b.length >= 5 ? b.subarray(5, 5 + b.readUInt32BE(1)) : Buffer.alloc(0));

/* ---------------- Messages ---------------- */

const Course: FieldSpec = { id: { no: 1, type: "string" }, code: { no: 2, type: "string" }, title: { no: 3, type: "string" }, state: { no: 4, type: "string" } };
const Enrollment: FieldSpec = { user_id: { no: 1, type: "string" }, role: { no: 2, type: "string" }, state: { no: 3, type: "string" }, section_id: { no: 4, type: "string" } };
const Event: FieldSpec = { id: { no: 1, type: "string" }, type: { no: 2, type: "string" }, subject: { no: 3, type: "string" }, at: { no: 4, type: "string" }, status: { no: 5, type: "string" }, data_json: { no: 6, type: "string" } };
export const MESSAGES = {
  HealthRequest: {} as FieldSpec,
  HealthResponse: { status: { no: 1, type: "string" }, tenants: { no: 2, type: "int32" } } as FieldSpec,
  ListCoursesRequest: { tenant: { no: 1, type: "string" }, page_size: { no: 2, type: "int32" }, page_token: { no: 3, type: "string" } } as FieldSpec,
  ListCoursesResponse: { courses: { no: 1, type: "repeated", of: Course }, next_page_token: { no: 2, type: "string" } } as FieldSpec,
  ListEnrollmentsRequest: { tenant: { no: 1, type: "string" }, course_id: { no: 2, type: "string" } } as FieldSpec,
  ListEnrollmentsResponse: { enrollments: { no: 1, type: "repeated", of: Enrollment } } as FieldSpec,
  ListEventsRequest: { tenant: { no: 1, type: "string" }, after: { no: 2, type: "int32" }, limit: { no: 3, type: "int32" } } as FieldSpec,
  ListEventsResponse: { events: { no: 1, type: "repeated", of: Event }, next: { no: 2, type: "int32" } } as FieldSpec,
};

const GRPC = { OK: 0, INVALID_ARGUMENT: 3, NOT_FOUND: 5, PERMISSION_DENIED: 7, UNAUTHENTICATED: 16, UNIMPLEMENTED: 12, INTERNAL: 13, FAILED_PRECONDITION: 9, RESOURCE_EXHAUSTED: 8 };
function codeFor(status: number) {
  return status === 401 ? GRPC.UNAUTHENTICATED : status === 403 ? GRPC.PERMISSION_DENIED : status === 404 ? GRPC.NOT_FOUND : status === 422 || status === 400 ? GRPC.INVALID_ARGUMENT : status === 429 ? GRPC.RESOURCE_EXHAUSTED : status === 423 || status === 409 ? GRPC.FAILED_PRECONDITION : GRPC.INTERNAL;
}

function tenantStore(slug: unknown, authorization: string | undefined) {
  const ctx = resolveTenant({ slug: String(slug ?? ""), traceId: "grpc" });
  const store = broker.connect(ctx);
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1];
  if (!bearer) throw new CampusError("unauthenticated", "Missing bearer token", 401);
  const t = resolveApiToken(store, bearer);
  if (!t.scopes.includes("read") && !t.scopes.includes("write")) throw new CampusError("insufficient_scope", "Token needs the read scope", 403);
  return { store, actor: t.actor };
}

const METHODS: Record<string, { req: FieldSpec; res: FieldSpec; run: (r: Record<string, unknown>, auth: string | undefined) => Record<string, unknown> }> = {
  Health: { req: MESSAGES.HealthRequest, res: MESSAGES.HealthResponse, run: () => ({ status: "SERVING", tenants: broker.tenants().filter((t) => t.kind !== "validation").length }) },
  ListCourses: {
    req: MESSAGES.ListCoursesRequest,
    res: MESSAGES.ListCoursesResponse,
    run: (r, auth) => {
      const { store, actor } = tenantStore(r.tenant, auth);
      const page = entity.list(store, actor, "courses", { cursor: (r.page_token as string) || undefined, limit: Number(r.page_size || 50) });
      return { courses: page.items.map((c) => ({ id: c.id, code: c.code, title: c.title, state: c.state })), next_page_token: page.next ?? "" };
    },
  },
  ListEnrollments: {
    req: MESSAGES.ListEnrollmentsRequest,
    res: MESSAGES.ListEnrollmentsResponse,
    run: (r, auth) => {
      const { store, actor } = tenantStore(r.tenant, auth);
      const page = entity.list(store, actor, "enrollments", { where: { courseId: String(r.course_id ?? ""), state: "active" }, limit: 200 });
      return { enrollments: page.items.map((e) => ({ user_id: e.userId, role: e.role, state: e.state, section_id: e.sectionId ?? "" })) };
    },
  },
  ListEvents: {
    req: MESSAGES.ListEventsRequest,
    res: MESSAGES.ListEventsResponse,
    run: (r, auth) => {
      const { store, actor } = tenantStore(r.tenant, auth);
      if (!actor.roles.includes("admin")) throw new CampusError("forbidden", "Admin token required", 403);
      const after = Number(r.after ?? 0);
      const limit = Math.min(Number(r.limit || 100), 500);
      const evts = store.outbox().slice(after, after + limit);
      return { events: evts.map((e) => ({ id: e.id, type: e.type, subject: e.subject, at: e.at, status: e.status, data_json: JSON.stringify(e.data) })), next: after + evts.length };
    },
  },
};

export function startGrpcServer(port = Number(process.env.CAMPUS_GRPC_PORT ?? 50051)): Promise<http2.Http2Server> {
  ensureCampusSeed();
  const server = http2.createServer();
  server.on("stream", (stream: http2.ServerHttp2Stream, headers) => {
    const path = String(headers[":path"] ?? "");
    const m = /^\/scholarion\.campus\.v1\.CampusService\/(\w+)$/.exec(path);
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => {
      let status = GRPC.OK;
      let message = "";
      let body = Buffer.alloc(0);
      try {
        if (headers["content-type"] !== "application/grpc" && !String(headers["content-type"]).startsWith("application/grpc+proto")) throw new CampusError("invalid", "content-type must be application/grpc", 400);
        const method = m ? METHODS[m[1]] : undefined;
        if (!method) {
          status = GRPC.UNIMPLEMENTED;
          message = "Unknown method";
        } else {
          const req = decode(method.req, unframe(Buffer.concat(chunks)));
          body = frame(encode(method.res, method.run(req, headers.authorization as string | undefined)));
        }
      } catch (e) {
        status = e instanceof CampusError ? codeFor(e.status) : GRPC.INTERNAL;
        message = e instanceof Error ? e.message : String(e);
      }
      stream.respond({ ":status": 200, "content-type": "application/grpc" }, { waitForTrailers: true });
      stream.on("wantTrailers", () => stream.sendTrailers({ "grpc-status": String(status), "grpc-message": encodeURIComponent(message) }));
      stream.end(body);
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

/** Minimal unary client (tests, internal tools). */
export function grpcCall(port: number, method: keyof typeof METHODS, req: Record<string, unknown>, authorization?: string): Promise<{ status: number; message: string; response: Record<string, unknown> | null }> {
  const spec = METHODS[method];
  return new Promise((resolve, reject) => {
    const client = http2.connect(`http://127.0.0.1:${port}`);
    client.on("error", reject);
    const s = client.request({ ":method": "POST", ":path": `/scholarion.campus.v1.CampusService/${method}`, "content-type": "application/grpc", te: "trailers", ...(authorization ? { authorization } : {}) });
    const chunks: Buffer[] = [];
    let trailers: http2.IncomingHttpHeaders = {};
    s.on("data", (c: Buffer) => chunks.push(c));
    s.on("trailers", (t) => (trailers = t));
    s.on("end", () => {
      client.close();
      const status = Number(trailers["grpc-status"] ?? 2);
      resolve({ status, message: decodeURIComponent(String(trailers["grpc-message"] ?? "")), response: status === 0 ? decode(spec.res, unframe(Buffer.concat(chunks))) : null });
    });
    s.end(frame(encode(spec.req, req)));
  });
}
