import { connect as tlsConnect } from "node:tls";
import type { Duplex } from "node:stream";
import { CampusError, nowIso, nowMs, type Row, type TenantStore } from "../../core";
import { bool, enumerated, int, octets, readInt, readStr, readTlv, seq, tlv, type Tlv } from "./ber";
import { federatedSignIn } from "./session";

/**
 * LDAPv3 directory sign-in (search-then-bind) over TLS (ldaps://, TLS 1.2+, certificate verified).
 *
 *  1. Bind as the configured service account (password read from the server environment
 *     variable named in bindPasswordEnv) — or anonymously if no service DN is set.
 *  2. Search the base DN with the configured filter. The username is substituted into the
 *     PARSED filter as a value, never spliced into the filter string, so it can't change the
 *     query (no LDAP injection). Exactly one entry must match.
 *  3. Bind as that entry with the password the person typed. Empty passwords are refused
 *     before anything is sent (an empty simple bind is an anonymous bind on many servers).
 *  4. Match by the entry's mail attribute and open a campus session.
 */

type Conn = (opts: { host: string; port: number; ca?: string; servername: string }) => Duplex;
let connector: Conn = ({ host, port, ca, servername }) => tlsConnect({ host, port, servername, ca: ca || undefined, rejectUnauthorized: true, minVersion: "TLSv1.2" });
/** Tests and sandboxes inject a transport (e.g. a plain socket to a fake directory). */
export function setLdapConnector(c: Conn | null) {
  connector = c ?? (({ host, port, ca, servername }) => tlsConnect({ host, port, servername, ca: ca || undefined, rejectUnauthorized: true, minVersion: "TLSv1.2" }));
}

/* ---------------- filters (RFC 4515 subset: & | ! = =*) ---------------- */

type Filter = { and: Filter[] } | { or: Filter[] } | { not: Filter } | { eq: [string, string] } | { present: string };

export function parseFilter(src: string): Filter {
  let i = 0;
  const s = src.trim();
  const unescape = (v: string) => v.replace(/\\([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  const item = (): Filter => {
    if (s[i] !== "(") throw new Error("Filter must start with '('");
    i++;
    let f: Filter;
    if (s[i] === "&" || s[i] === "|") {
      const op = s[i++];
      const list: Filter[] = [];
      while (s[i] === "(") list.push(item());
      if (!list.length) throw new Error("Empty filter list");
      f = op === "&" ? { and: list } : { or: list };
    } else if (s[i] === "!") {
      i++;
      f = { not: item() };
    } else {
      const m = /^([A-Za-z][A-Za-z0-9-]*|[0-9]+(?:\.[0-9]+)+)=((?:[^()\\*]|\\[0-9a-fA-F]{2})*|\*)/.exec(s.slice(i));
      if (!m) throw new Error("Only attr=value and attr=* filters are supported");
      i += m[0].length;
      f = m[2] === "*" ? { present: m[1] } : { eq: [m[1], unescape(m[2])] };
    }
    if (s[i] !== ")") throw new Error("Unbalanced filter");
    i++;
    return f;
  };
  const f = item();
  if (i !== s.length) throw new Error("Trailing characters after filter");
  return f;
}

/** Replace the {username} placeholder in VALUES only. */
export function bindUsername(f: Filter, username: string): Filter {
  if ("and" in f) return { and: f.and.map((x) => bindUsername(x, username)) };
  if ("or" in f) return { or: f.or.map((x) => bindUsername(x, username)) };
  if ("not" in f) return { not: bindUsername(f.not, username) };
  if ("eq" in f) return { eq: [f.eq[0], f.eq[1] === "{username}" ? username : f.eq[1]] };
  return f;
}

function encFilter(f: Filter): Buffer {
  if ("and" in f) return tlv(0xa0, f.and.map(encFilter));
  if ("or" in f) return tlv(0xa1, f.or.map(encFilter));
  if ("not" in f) return tlv(0xa2, encFilter(f.not));
  if ("eq" in f) return tlv(0xa3, [octets(f.eq[0]), octets(f.eq[1])]);
  return octets(f.present, 0x87);
}

/* ---------------- protocol ---------------- */

const RESULT: Record<number, string> = { 0: "success", 32: "noSuchObject", 34: "invalidDNSyntax", 48: "inappropriateAuthentication", 49: "invalidCredentials", 50: "insufficientAccessRights", 53: "unwillingToPerform" };

class LdapSession {
  private buf = Buffer.alloc(0);
  private waiters: ((m: Tlv) => void)[] = [];
  private queue: Tlv[] = [];
  private failed: Error | null = null;
  private nextId = 1;
  constructor(private sock: Duplex) {
    sock.on("data", (d: Buffer) => {
      this.buf = Buffer.concat([this.buf, d]);
      for (;;) {
        let r: ReturnType<typeof readTlv>;
        try {
          r = readTlv(this.buf);
        } catch (e) {
          this.fail(e as Error);
          return;
        }
        if (!r) break;
        this.buf = this.buf.subarray(r.next);
        const w = this.waiters.shift();
        if (w) w(r.node);
        else this.queue.push(r.node);
      }
    });
    sock.on("error", (e: Error) => this.fail(e));
    sock.on("close", () => this.fail(new Error("Directory closed the connection")));
  }
  private fail(e: Error) {
    if (!this.failed) this.failed = e;
  }
  private next(timeoutMs: number): Promise<Tlv> {
    const q = this.queue.shift();
    if (q) return Promise.resolve(q);
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Directory timed out")), timeoutMs);
      const iv = setInterval(() => {
        if (this.failed) {
          clearTimeout(t);
          clearInterval(iv);
          reject(this.failed);
        }
      }, 50);
      this.waiters.push((m) => {
        clearTimeout(t);
        clearInterval(iv);
        resolve(m);
      });
    });
  }
  private send(op: Buffer) {
    const id = this.nextId++;
    this.sock.write(seq(int(id), op));
    return id;
  }
  async bind(dn: string, password: string) {
    const id = this.send(tlv(0x60, [int(3), octets(dn), octets(password, 0x80)]));
    const m = await this.next(8000);
    const [mid, op] = m.children ?? [];
    if (!op || readInt(mid) !== id || op.tag !== 0x61) throw new Error("Unexpected bind response");
    return readInt(op.children![0]);
  }
  async search(base: string, filter: Filter, attrs: string[]) {
    const id = this.send(tlv(0x63, [octets(base), enumerated(2), enumerated(0), int(2), int(10), bool(false), encFilter(filter), seq(...attrs.map((a) => octets(a)))]));
    const entries: { dn: string; attrs: Record<string, string[]> }[] = [];
    for (;;) {
      const m = await this.next(8000);
      const [mid, op] = m.children ?? [];
      if (!op || readInt(mid) !== id) throw new Error("Unexpected search response");
      if (op.tag === 0x64) {
        const [dn, list] = op.children!;
        const a: Record<string, string[]> = {};
        for (const pa of list.children ?? []) {
          const [type, vals] = pa.children!;
          a[readStr(type).toLowerCase()] = (vals.children ?? []).map(readStr);
        }
        entries.push({ dn: readStr(dn), attrs: a });
        if (entries.length > 2) throw new Error("Too many entries");
      } else if (op.tag === 0x65) {
        const code = readInt(op.children![0]);
        // sizeLimitExceeded (4) means more than one match — treated as ambiguous.
        if (code !== 0 && code !== 4) throw new Error(`Search failed (${RESULT[code] ?? code})`);
        return { entries, sizeExceeded: code === 4 };
      } else if (op.tag === 0x73) continue; // search result reference — ignored
      else throw new Error("Unexpected search message");
    }
  }
  close() {
    try {
      this.sock.write(seq(int(this.nextId++), Buffer.from([0x42, 0x00])));
    } catch {
      /* ignore */
    }
    this.sock.destroy();
  }
}

function provider(store: TenantStore, idpId: string, requireEnabled = true) {
  const p = store.get("identity_providers", idpId);
  if (!p || p.kind !== "ldap") throw new CampusError("not_found", "Directory not found", 404);
  if (requireEnabled && p.state !== "enabled") throw new CampusError("ldap_disabled", "Directory sign-in isn't enabled.", 409);
  return p as Row & { config: Record<string, unknown> };
}

function open(p: Row & { config: Record<string, unknown> }) {
  const host = String(p.config.host ?? "");
  if (!/^[A-Za-z0-9.-]+$/.test(host)) throw new CampusError("ldap_config", "Directory host is not a valid host name.", 422);
  const port = Number(p.config.port ?? 636);
  return new LdapSession(connector({ host, port, ca: p.config.caPem ? String(p.config.caPem) : undefined, servername: host }));
}

async function serviceBind(s: LdapSession, p: Row & { config: Record<string, unknown> }) {
  const dn = String(p.config.bindDn ?? "");
  if (!dn) return; // anonymous search
  const env = String(p.config.bindPasswordEnv ?? "");
  const pw = /^[A-Z][A-Z0-9_]{2,63}$/.test(env) ? process.env[env] : undefined;
  if (!pw) throw new CampusError("ldap_config", `The service-account password variable ${env || "(bindPasswordEnv)"} isn't set on the server.`, 503);
  const code = await s.bind(dn, pw);
  if (code !== 0) throw new CampusError("ldap_config", `The directory refused the service account (${RESULT[code] ?? code}).`, 503);
}

/** Search-then-bind sign-in. Every credential failure returns the same message. */
export async function ldapSignIn(store: TenantStore, idpId: string, username: string, password: string) {
  const p = provider(store, idpId);
  const user = String(username ?? "").trim();
  const generic = new CampusError("bad_credentials", "Username or password is incorrect.", 401);
  if (!user || user.length > 256 || !password) throw generic; // empty password = anonymous bind: never sent
  const key = `ldap:${p.id}:${user.toLowerCase()}`;
  if (store.list("login_failures", (f) => f.email === key && String(f.createdAt) > new Date(nowMs() - 15 * 60_000).toISOString()).length >= 8) throw new CampusError("locked", "Too many attempts. Wait 15 minutes.", 429);
  const failed = (reason: string) => {
    store.tx(() => {
      store.insert("login_failures", { email: key }, "lf");
      store.audit({ actorId: "anonymous", actorRoles: [], action: "session.create", resource: "session", outcome: "denied", reason: `ldap: ${reason}` });
    });
    return generic;
  };
  let filter: Filter;
  try {
    filter = bindUsername(parseFilter(String(p.config.userFilter ?? "(uid={username})")), user);
  } catch (e) {
    throw new CampusError("ldap_config", `User filter is invalid: ${(e as Error).message}`, 422);
  }
  const mailAttr = String(p.config.mailAttribute ?? "mail").toLowerCase();
  const nameAttr = String(p.config.nameAttribute ?? "cn").toLowerCase();
  const s = open(p);
  try {
    await serviceBind(s, p);
    const r = await s.search(String(p.config.baseDn ?? ""), filter, [mailAttr, nameAttr]);
    if (r.sizeExceeded || r.entries.length !== 1) throw failed(r.entries.length ? "ambiguous user" : "no such user");
    const entry = r.entries[0];
    const code = await s.bind(entry.dn, password);
    if (code !== 0) throw failed(RESULT[code] ?? `code ${code}`);
    const email = entry.attrs[mailAttr]?.[0] ?? "";
    return federatedSignIn(store, p, { email, name: entry.attrs[nameAttr]?.[0], subject: entry.dn, mfa: false, via: "ldap" });
  } catch (e) {
    if (e instanceof CampusError) throw e;
    throw new CampusError("ldap_unreachable", `The directory couldn't be reached: ${(e as Error).message}`, 503);
  } finally {
    s.close();
  }
}

/** Live check: connect over TLS and bind the service account (or confirm anonymous bind is allowed). */
export async function checkLdap(store: TenantStore, idpId: string) {
  const p = provider(store, idpId, false);
  let connected = false;
  let note = "";
  const s = open(p);
  try {
    if (p.config.bindDn) {
      await serviceBind(s, p);
      note = "Service account bind succeeded.";
    } else {
      const code = await s.bind("", "");
      if (code !== 0) throw new Error(`anonymous bind refused (${RESULT[code] ?? code}); set bindDn and bindPasswordEnv`);
      note = "Anonymous search bind accepted.";
    }
    parseFilter(String(p.config.userFilter ?? "(uid={username})"));
    connected = true;
  } catch (e) {
    note = (e as Error).message;
  } finally {
    s.close();
  }
  const result = { at: nowIso(), configComplete: !!p.config.host && !!p.config.baseDn, connected, missing: [], note };
  store.tx(() => store.update("identity_providers", p.id, { lastTest: result }));
  return result;
}
