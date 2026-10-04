import { CampusError, nowIso } from "../../core";

/**
 * Virtual filesystem for the simulated sandbox workspaces.
 *
 * The whole tree is plain data (a flat map of absolute path → node) stored inside the
 * workspace row in the tenant store. Nothing here touches the host machine: there are no
 * real files, no symlinks and no devices. Paths are POSIX-like and always resolve under
 * /workspace; anything that tries to climb out is rejected before it reaches a lookup.
 */

export const WORKSPACE_ROOT = "/workspace";

export const VFS_LIMITS = {
  fileBytes: 200 * 1024,
  workspaceBytes: 5 * 1024 * 1024,
  maxNodes: 2000,
  maxPathLength: 1024,
  maxSegmentLength: 255,
} as const;

export type VfsNode = { type: "dir"; mtime: string } | { type: "file"; content: string; mtime: string };
export type Vfs = Record<string, VfsNode>;

const enc = new TextEncoder();
export const byteLength = (s: string) => enc.encode(s).length;

const fail = (code: string, message: string, status = 400): never => {
  throw new CampusError(code, message, status);
};

/** True when `p` is `root` or sits underneath it. */
export function isWithin(p: string, root: string): boolean {
  if (root === "/") return p.startsWith("/");
  return p === root || p.startsWith(root + "/");
}

/**
 * Normalize a learner-supplied path to an absolute, canonical path.
 *
 * Rejects: null bytes and control characters, backslashes, percent-encoded separators or
 * dots, Unicode look-alikes (anything NFKC would change), "~" shortcuts, all-dot segments
 * other than "." and "..", and any ".." that would climb above /workspace (or above the
 * first segment of an absolute path). Absolute paths outside /workspace are returned as-is
 * so the execution policy can refuse them with a boundary explanation.
 */
export function normalizePath(input: unknown, cwd: string = WORKSPACE_ROOT): string {
  if (typeof input !== "string" || input.length === 0) fail("invalid_path", "A path is required.");
  const raw = input as string;
  if (raw.length > VFS_LIMITS.maxPathLength) fail("invalid_path", `Path is longer than ${VFS_LIMITS.maxPathLength} characters.`);
  if (/[\u0000-\u001f\u007f]/.test(raw)) fail("invalid_path", "Paths can't contain null bytes or control characters.");
  if (raw.includes("\\")) fail("invalid_path", "Use forward slashes (/) in simulated sandbox paths.");
  if (/%(2e|2f|5c|00)/i.test(raw)) fail("path_traversal", "Encoded path separators or dots are not allowed in the simulated sandbox.", 403);
  if (raw.normalize("NFKC") !== raw) fail("path_traversal", "Paths must use plain characters (look-alike characters are rejected).", 403);
  if (raw.startsWith("~")) fail("invalid_path", "Home-directory shortcuts (~) are not available; paths start at /workspace.");

  const stack: string[] = raw.startsWith("/") ? [] : cwd.split("/").filter(Boolean);
  for (const seg of raw.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (stack.length <= 1) fail("path_traversal", "Path traversal outside /workspace is not allowed in the simulated sandbox.", 403);
      stack.pop();
      continue;
    }
    if (/^\.{3,}$/.test(seg)) fail("path_traversal", "Dot-only path segments are not allowed.", 403);
    if (seg.length > VFS_LIMITS.maxSegmentLength) fail("invalid_path", "A path segment is too long.");
    stack.push(seg);
  }
  return "/" + stack.join("/");
}

export function parentOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}
export function baseName(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}
/** Path relative to /workspace (for listings, snapshots and templates). */
export function relPath(p: string): string {
  return p === WORKSPACE_ROOT ? "." : p.slice(WORKSPACE_ROOT.length + 1);
}

export function emptyVfs(): Vfs {
  return { [WORKSPACE_ROOT]: { type: "dir", mtime: nowIso() } };
}

export function vfsClone(v: Vfs): Vfs {
  return JSON.parse(JSON.stringify(v)) as Vfs;
}

export function vfsStat(v: Vfs, p: string): VfsNode | undefined {
  return Object.prototype.hasOwnProperty.call(v, p) ? v[p] : undefined;
}

export function vfsUsage(v: Vfs): { bytes: number; nodes: number; files: number; dirs: number } {
  let bytes = 0;
  let files = 0;
  let dirs = 0;
  for (const n of Object.values(v)) {
    if (n.type === "file") {
      files++;
      bytes += byteLength(n.content);
    } else dirs++;
  }
  return { bytes, nodes: files + dirs, files, dirs };
}

function guardInside(p: string) {
  if (!isWithin(p, WORKSPACE_ROOT)) fail("outside_boundary", `${p} is outside the simulated /workspace filesystem.`, 403);
}

function quota(v: Vfs, deltaBytes: number, deltaNodes: number, maxTotalBytes: number = VFS_LIMITS.workspaceBytes) {
  const u = vfsUsage(v);
  const cap = Math.min(maxTotalBytes, VFS_LIMITS.workspaceBytes);
  if (u.bytes + deltaBytes > cap) fail("quota_exceeded", `Workspace storage limit reached (${Math.round(cap / 1024)} KB).`, 413);
  if (u.nodes + deltaNodes > VFS_LIMITS.maxNodes) fail("quota_exceeded", `Workspace file limit reached (${VFS_LIMITS.maxNodes} files and folders).`, 413);
}

function requireDir(v: Vfs, p: string) {
  const n = vfsStat(v, p);
  if (!n) fail("not_found", `${relPath(p)}: No such file or directory`, 404);
  if (n!.type !== "dir") fail("not_a_directory", `${relPath(p)}: Not a directory`);
}

export function vfsRead(v: Vfs, p: string): string {
  const n = vfsStat(v, p);
  if (!n) return fail("not_found", `${relPath(p)}: No such file or directory`, 404);
  if (n.type !== "file") return fail("is_directory", `${relPath(p)}: Is a directory`);
  return n.content;
}

export function vfsMkdir(v: Vfs, p: string, parents = false) {
  guardInside(p);
  const existing = vfsStat(v, p);
  if (existing) {
    if (existing.type === "dir" && parents) return;
    fail("exists", `${relPath(p)}: File exists`, 409);
  }
  const missing: string[] = [];
  let cur = p;
  while (!vfsStat(v, cur)) {
    missing.unshift(cur);
    cur = parentOf(cur);
    if (!isWithin(cur, WORKSPACE_ROOT)) fail("outside_boundary", "Directories can only be created inside /workspace.", 403);
  }
  if (vfsStat(v, cur)!.type !== "dir") fail("not_a_directory", `${relPath(cur)}: Not a directory`);
  if (missing.length > 1 && !parents) fail("not_found", `${relPath(parentOf(p))}: No such file or directory (use mkdir -p)`, 404);
  quota(v, 0, missing.length);
  const t = nowIso();
  for (const m of missing) v[m] = { type: "dir", mtime: t };
}

export function vfsWrite(v: Vfs, p: string, content: string, opts: { append?: boolean; createParents?: boolean; maxTotalBytes?: number } = {}) {
  guardInside(p);
  if (typeof content !== "string") fail("invalid_content", "File content must be text.");
  if (p === WORKSPACE_ROOT) fail("is_directory", "The workspace root is a directory.");
  const existing = vfsStat(v, p);
  if (existing?.type === "dir") fail("is_directory", `${relPath(p)}: Is a directory`);
  const parent = parentOf(p);
  if (!vfsStat(v, parent)) {
    if (opts.createParents) vfsMkdir(v, parent, true);
    else fail("not_found", `${relPath(parent)}: No such file or directory`, 404);
  }
  requireDir(v, parent);
  const next = opts.append && existing?.type === "file" ? existing.content + content : content;
  const size = byteLength(next);
  if (size > VFS_LIMITS.fileBytes) fail("quota_exceeded", `File would be ${Math.ceil(size / 1024)} KB; the per-file limit is ${VFS_LIMITS.fileBytes / 1024} KB.`, 413);
  const before = existing?.type === "file" ? byteLength(existing.content) : 0;
  quota(v, size - before, existing ? 0 : 1, opts.maxTotalBytes);
  v[p] = { type: "file", content: next, mtime: nowIso() };
}

export function vfsTouch(v: Vfs, p: string, maxTotalBytes?: number) {
  const n = vfsStat(v, p);
  if (n) n.mtime = nowIso();
  else vfsWrite(v, p, "", { maxTotalBytes });
}

function subtree(v: Vfs, p: string): string[] {
  return Object.keys(v).filter((k) => isWithin(k, p));
}

export function vfsRemove(v: Vfs, p: string, recursive = false) {
  guardInside(p);
  if (p === WORKSPACE_ROOT) fail("forbidden", "Refusing to remove the workspace root.", 403);
  const n = vfsStat(v, p);
  if (!n) fail("not_found", `${relPath(p)}: No such file or directory`, 404);
  if (n!.type === "dir") {
    const kids = subtree(v, p).filter((k) => k !== p);
    if (kids.length && !recursive) fail("not_empty", `${relPath(p)}: Is a directory (use rm -r)`);
    for (const k of kids) delete v[k];
  }
  delete v[p];
}

function destinationFor(v: Vfs, src: string, dst: string): string {
  const d = vfsStat(v, dst);
  return d?.type === "dir" ? (dst === "/" ? "" : dst) + "/" + baseName(src) : dst;
}

export function vfsCopy(v: Vfs, src: string, dst: string, recursive = false, maxTotalBytes?: number) {
  guardInside(src);
  guardInside(dst);
  const n = vfsStat(v, src);
  if (!n) fail("not_found", `${relPath(src)}: No such file or directory`, 404);
  const target = destinationFor(v, src, dst);
  guardInside(target);
  if (n!.type === "file") {
    vfsWrite(v, target, (n as { content: string }).content, { maxTotalBytes });
    return;
  }
  if (!recursive) fail("is_directory", `-r not specified; omitting directory ${relPath(src)}`);
  if (isWithin(target, src)) fail("invalid_target", "Can't copy a directory into itself.");
  if (vfsStat(v, target)) fail("exists", `${relPath(target)}: File exists`, 409);
  requireDir(v, parentOf(target));
  const keys = subtree(v, src).sort();
  let bytes = 0;
  for (const k of keys) if (v[k].type === "file") bytes += byteLength((v[k] as { content: string }).content);
  quota(v, bytes, keys.length, maxTotalBytes);
  const t = nowIso();
  for (const k of keys) v[target + k.slice(src.length)] = { ...v[k], mtime: t } as VfsNode;
}

export function vfsMove(v: Vfs, src: string, dst: string) {
  guardInside(src);
  guardInside(dst);
  if (src === WORKSPACE_ROOT) fail("forbidden", "Refusing to move the workspace root.", 403);
  const n = vfsStat(v, src);
  if (!n) fail("not_found", `${relPath(src)}: No such file or directory`, 404);
  const target = destinationFor(v, src, dst);
  guardInside(target);
  if (target === src) return;
  if (isWithin(target, src)) fail("invalid_target", "Can't move a directory into itself.");
  const t = vfsStat(v, target);
  if (t?.type === "dir") fail("exists", `${relPath(target)}: Is a directory`, 409);
  requireDir(v, parentOf(target));
  const keys = subtree(v, src);
  const moved: Vfs = {};
  for (const k of keys) {
    moved[target + k.slice(src.length)] = v[k];
    delete v[k];
  }
  Object.assign(v, moved);
}

export function vfsList(v: Vfs, dir: string): { name: string; path: string; node: VfsNode }[] {
  requireDir(v, dir);
  const prefix = dir === "/" ? "/" : dir + "/";
  return Object.keys(v)
    .filter((k) => k.startsWith(prefix) && k !== dir && !k.slice(prefix.length).includes("/"))
    .sort()
    .map((k) => ({ name: k.slice(prefix.length), path: k, node: v[k] }));
}

export function vfsTree(v: Vfs, root: string): string {
  requireDir(v, root);
  const lines = [root === WORKSPACE_ROOT ? "/workspace" : relPath(root)];
  let dirs = 0;
  let files = 0;
  const walk = (dir: string, indent: string) => {
    const kids = vfsList(v, dir);
    kids.forEach((k, i) => {
      const last = i === kids.length - 1;
      lines.push(`${indent}${last ? "└── " : "├── "}${k.name}${k.node.type === "dir" ? "/" : ""}`);
      if (k.node.type === "dir") {
        dirs++;
        walk(k.path, indent + (last ? "    " : "│   "));
      } else files++;
    });
  };
  walk(root, "");
  lines.push("", `${dirs} director${dirs === 1 ? "y" : "ies"}, ${files} file${files === 1 ? "" : "s"}`);
  return lines.join("\n") + "\n";
}

/** Build a VFS from a map of workspace-relative paths → content. */
export function vfsFromFiles(files: Record<string, string>): Vfs {
  const v = emptyVfs();
  for (const [rel, content] of Object.entries(files)) {
    const p = normalizePath(rel, WORKSPACE_ROOT);
    if (rel.endsWith("/")) vfsMkdir(v, p, true);
    else vfsWrite(v, p, content, { createParents: true });
  }
  return v;
}

/** Files only, workspace-relative, sorted (snapshots and checksums). */
export function vfsToFiles(v: Vfs): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(v).sort()) {
    const n = v[k];
    if (n.type === "file") out[relPath(k)] = n.content;
  }
  return out;
}

/** Workspace-relative listing (no content). */
export function vfsListing(v: Vfs): { path: string; type: "file" | "dir"; bytes: number; mtime: string }[] {
  return Object.keys(v)
    .filter((k) => k !== WORKSPACE_ROOT)
    .sort()
    .map((k) => {
      const n = v[k];
      return { path: relPath(k), type: n.type, bytes: n.type === "file" ? byteLength(n.content) : 0, mtime: n.mtime };
    });
}
