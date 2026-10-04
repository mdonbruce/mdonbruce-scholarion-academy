import { CampusError, type TenantContext, type TenantStore } from "../core";
import type { Actor } from "../iam";
import * as entity from "../entity";
import { ENTITIES, ENTITY } from "../registry";
import { Args, OPERATIONS } from "./ops";

/**
 * A small, dependency-free GraphQL executor over the registry.
 *
 * Supported: query/mutation operations, variables, aliases, arguments (string, number,
 * boolean, null, enum, list, object, $variable), nested selections, __typename and a
 * minimal __schema. Not supported: fragments, directives, subscriptions.
 *
 *   query { courses(first: 5) { id title modules { title module_items { title } } } }
 *   query { coursesById(id: "crs_…") { title } }
 *   query { op(name: "dashboard") }                      # any query operation, JSON result
 *   mutation { create(table: "pages", input: {…}) }       # create / update / delete / run
 *
 * Every resolver goes through the entity layer, so the same authorization applies.
 */

type Value = string | number | boolean | null | Value[] | { [k: string]: Value } | { $var: string };
interface Field {
  alias: string;
  name: string;
  args: Record<string, Value>;
  selection: Field[] | null;
}

class Parser {
  i = 0;
  constructor(readonly s: string) {}
  ws() {
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === "#") while (this.i < this.s.length && this.s[this.i] !== "\n") this.i++;
      else if (/[\s,]/.test(c)) this.i++;
      else break;
    }
  }
  peek() {
    this.ws();
    return this.s[this.i];
  }
  eat(ch: string) {
    this.ws();
    if (this.s[this.i] !== ch) throw new CampusError("graphql_syntax", `Expected "${ch}" at ${this.i}`, 400);
    this.i++;
  }
  name(): string {
    this.ws();
    const m = /^[_A-Za-z][_0-9A-Za-z]*/.exec(this.s.slice(this.i));
    if (!m) throw new CampusError("graphql_syntax", `Expected a name at ${this.i}`, 400);
    this.i += m[0].length;
    return m[0];
  }
  value(): Value {
    const c = this.peek();
    if (c === "$") {
      this.i++;
      return { $var: this.name() };
    }
    if (c === '"') {
      this.i++;
      let out = "";
      while (this.s[this.i] !== '"') {
        if (this.i >= this.s.length) throw new CampusError("graphql_syntax", "Unterminated string", 400);
        if (this.s[this.i] === "\\") {
          const n = this.s[this.i + 1];
          out += n === "n" ? "\n" : n === "t" ? "\t" : n;
          this.i += 2;
        } else out += this.s[this.i++];
      }
      this.i++;
      return out;
    }
    if (c === "[") {
      this.i++;
      const arr: Value[] = [];
      while (this.peek() !== "]") arr.push(this.value());
      this.i++;
      return arr;
    }
    if (c === "{") {
      this.i++;
      const obj: Record<string, Value> = {};
      while (this.peek() !== "}") {
        const k = this.name();
        this.eat(":");
        obj[k] = this.value();
      }
      this.i++;
      return obj;
    }
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.s.slice(this.i));
    if (m) {
      this.i += m[0].length;
      return Number(m[0]);
    }
    const w = this.name();
    return w === "true" ? true : w === "false" ? false : w === "null" ? null : w;
  }
  selection(): Field[] {
    this.eat("{");
    const out: Field[] = [];
    while (this.peek() !== "}") {
      if (this.s.startsWith("...", this.i)) throw new CampusError("graphql_unsupported", "Fragments aren't supported.", 400);
      let alias = this.name();
      let name = alias;
      if (this.peek() === ":") {
        this.i++;
        name = this.name();
      }
      const args: Record<string, Value> = {};
      if (this.peek() === "(") {
        this.i++;
        while (this.peek() !== ")") {
          const k = this.name();
          this.eat(":");
          args[k] = this.value();
        }
        this.i++;
      }
      if (this.peek() === "@") throw new CampusError("graphql_unsupported", "Directives aren't supported.", 400);
      const selection = this.peek() === "{" ? this.selection() : null;
      out.push({ alias, name, args, selection });
    }
    this.i++;
    return out;
  }
  document(): { kind: "query" | "mutation"; selection: Field[] } {
    let kind: "query" | "mutation" = "query";
    if (this.peek() !== "{") {
      const k = this.name();
      if (k !== "query" && k !== "mutation") throw new CampusError("graphql_unsupported", `${k} operations aren't supported.`, 400);
      kind = k;
      if (this.peek() !== "{" && this.peek() !== "(") this.name();
      if (this.peek() === "(") {
        // Skip variable definitions.
        let depth = 0;
        do {
          const ch = this.s[this.i++];
          if (ch === "(") depth++;
          if (ch === ")") depth--;
        } while (depth > 0 && this.i < this.s.length);
      }
    }
    const selection = this.selection();
    this.ws();
    if (this.i < this.s.length) throw new CampusError("graphql_unsupported", "Only one operation per request.", 400);
    return { kind, selection };
  }
}

function resolveVars(v: Value, vars: Record<string, unknown>): unknown {
  if (v && typeof v === "object" && !Array.isArray(v) && "$var" in v) return vars[(v as { $var: string }).$var];
  if (Array.isArray(v)) return v.map((x) => resolveVars(x, vars));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveVars(x as Value, vars)]));
  return v;
}

/** Child relations: table C has a ref field pointing at table P. */
const CHILDREN: Record<string, { table: string; field: string }[]> = {};
for (const e of ENTITIES) for (const f of e.fields) if (f.type === "ref" && f.ref) (CHILDREN[f.ref] ??= []).push({ table: e.table, field: f.name });

const MAX_DEPTH = 6;
const MAX_NODES = 5000;

export function executeGraphql(store: TenantStore, actor: Actor, tenant: TenantContext, query: string, variables: Record<string, unknown> = {}, scopes?: string[]) {
  const errors: { message: string; path: string[]; code?: string }[] = [];
  let nodes = 0;
  let doc: ReturnType<Parser["document"]>;
  try {
    doc = new Parser(query).document();
  } catch (e) {
    return { data: null, errors: [{ message: (e as Error).message, path: [], code: (e as CampusError).code }] };
  }
  if (scopes && !(scopes.includes("write") || (doc.kind === "query" && scopes.includes("read")))) return { data: null, errors: [{ message: "This token's scopes don't allow that.", path: [], code: "insufficient_scope" }] };

  const shape = (table: string, row: Record<string, unknown>, sel: Field[] | null, path: string[], depth: number): unknown => {
    if (!sel) return row;
    if (depth > MAX_DEPTH) throw new CampusError("graphql_depth", "Query is nested too deeply.", 400);
    const out: Record<string, unknown> = {};
    for (const f of sel) {
      if (++nodes > MAX_NODES) throw new CampusError("graphql_size", "Query returns too much data.", 400);
      if (f.name === "__typename") {
        out[f.alias] = table;
        continue;
      }
      const def = ENTITY[table];
      const refField = def.fields.find((x) => x.type === "ref" && (x.name === `${f.name}Id` || x.name === f.name) && x.ref);
      const child = CHILDREN[table]?.find((c) => c.table === f.name);
      try {
        if (f.selection && refField && row[refField.name]) {
          try {
            out[f.alias] = shape(refField.ref!, entity.read(store, actor, refField.ref!, String(row[refField.name])), f.selection, [...path, f.alias], depth + 1);
          } catch {
            out[f.alias] = null;
          }
        } else if (f.selection && child) {
          const args = resolveVars(f.args as Value, variables) as Record<string, unknown>;
          const r = entity.list(store, actor, child.table, { where: { [child.field]: String(row.id) }, limit: Number(args.first ?? 50) });
          out[f.alias] = r.items.map((it) => shape(child.table, it, f.selection, [...path, f.alias], depth + 1));
        } else out[f.alias] = row[f.name] ?? null;
      } catch (e) {
        errors.push({ message: (e as Error).message, path: [...path, f.alias], code: (e as CampusError).code });
        out[f.alias] = null;
      }
    }
    return out;
  };

  const data: Record<string, unknown> = {};
  for (const f of doc.selection) {
    const args = resolveVars(f.args as Value, variables) as Record<string, unknown>;
    try {
      if (f.name === "__typename") data[f.alias] = doc.kind === "query" ? "Query" : "Mutation";
      else if (f.name === "__schema") data[f.alias] = { queryType: { name: "Query" }, mutationType: { name: "Mutation" }, types: ENTITIES.map((e) => ({ name: e.table, description: e.label, fields: e.fields.filter((x) => !x.secret).map((x) => ({ name: x.name, type: x.type })), children: (CHILDREN[e.table] ?? []).map((c) => c.table) })) };
      else if (doc.kind === "query" && f.name === "me") data[f.alias] = { id: actor.id, name: actor.name, email: actor.email, roles: actor.roles, courseRoles: actor.courseRoles };
      else if (doc.kind === "query" && f.name === "op") {
        const op = OPERATIONS[String(args.name)];
        if (!op || op.kind !== "query") throw new CampusError("not_found", "Unknown query operation", 404);
        data[f.alias] = op.run({ store, actor, args: new Args((args.args as Record<string, unknown>) ?? {}), tenant });
      } else if (doc.kind === "query" && f.name.endsWith("ById") && ENTITY[f.name.slice(0, -4)]) {
        const table = f.name.slice(0, -4);
        data[f.alias] = shape(table, entity.read(store, actor, table, String(args.id)), f.selection, [f.alias], 1);
      } else if (doc.kind === "query" && ENTITY[f.name]) {
        const where = (args.where as Record<string, string>) ?? {};
        const r = entity.list(store, actor, f.name, { courseId: args.courseId as string | undefined, where, search: args.q as string | undefined, cursor: args.after as string | undefined, limit: Number(args.first ?? 50) });
        data[f.alias] = r.items.map((it) => shape(f.name, it, f.selection, [f.alias], 1));
        if (r.next) data[`${f.alias}__next`] = r.next;
      } else if (doc.kind === "mutation" && f.name === "create") {
        data[f.alias] = entity.create(store, actor, String(args.table), (args.input as Record<string, unknown>) ?? {});
      } else if (doc.kind === "mutation" && f.name === "update") {
        data[f.alias] = entity.update(store, actor, String(args.table), String(args.id), (args.input as Record<string, unknown>) ?? {}, args.ifVersion === undefined ? undefined : Number(args.ifVersion));
      } else if (doc.kind === "mutation" && f.name === "delete") {
        data[f.alias] = entity.archive(store, actor, String(args.table), String(args.id));
      } else if (doc.kind === "mutation" && f.name === "publish") {
        data[f.alias] = entity.publish(store, actor, String(args.table), String(args.id), args.on !== false);
      } else if (doc.kind === "mutation" && f.name === "run") {
        const op = OPERATIONS[String(args.name)];
        if (!op || op.kind !== "command") throw new CampusError("not_found", "Unknown command", 404);
        data[f.alias] = op.run({ store, actor, args: new Args((args.args as Record<string, unknown>) ?? {}), tenant });
      } else throw new CampusError("graphql_unknown_field", `Unknown ${doc.kind} field "${f.name}"`, 400);
    } catch (e) {
      errors.push({ message: (e as Error).message, path: [f.alias], code: (e as CampusError).code });
      data[f.alias] = null;
    }
  }
  return errors.length ? { data, errors } : { data };
}

