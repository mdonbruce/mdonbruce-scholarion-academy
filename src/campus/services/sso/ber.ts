/** Minimal BER (definite-length) encoder/decoder for LDAPv3 messages. */

export interface Tlv {
  tag: number;
  /** Raw contents. For constructed values, `children` is filled. */
  value: Buffer;
  children?: Tlv[];
}

const MAX_LEN = 4 * 1024 * 1024;

export function encLen(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
export const tlv = (tag: number, value: Buffer | Buffer[]) => {
  const v = Array.isArray(value) ? Buffer.concat(value) : value;
  return Buffer.concat([Buffer.from([tag]), encLen(v.length), v]);
};
export const seq = (...items: Buffer[]) => tlv(0x30, items);
export const octets = (s: string | Buffer, tag = 0x04) => tlv(tag, Buffer.isBuffer(s) ? s : Buffer.from(s, "utf8"));
export const bool = (b: boolean) => tlv(0x01, Buffer.from([b ? 0xff : 0x00]));
export function int(n: number, tag = 0x02): Buffer {
  const bytes: number[] = [];
  let v = n;
  do {
    bytes.unshift(v & 0xff);
    v >>= 8;
  } while (v > 0 && v !== -1);
  if (n >= 0 && bytes[0] & 0x80) bytes.unshift(0);
  return tlv(tag, Buffer.from(bytes));
}
export const enumerated = (n: number) => int(n, 0x0a);

/** Read one TLV at `off`; returns null when the buffer doesn't yet hold a complete element. */
export function readTlv(buf: Buffer, off = 0): { node: Tlv; next: number } | null {
  if (buf.length < off + 2) return null;
  const tag = buf[off];
  if ((tag & 0x1f) === 0x1f) throw new Error("Multi-byte tags are not supported");
  let len = buf[off + 1];
  let p = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error("Unsupported BER length");
    if (buf.length < p + n) return null;
    len = 0;
    for (let k = 0; k < n; k++) len = len * 256 + buf[p + k];
    p += n;
  }
  if (len > MAX_LEN) throw new Error("BER element too large");
  if (buf.length < p + len) return null;
  const value = buf.subarray(p, p + len);
  const node: Tlv = { tag, value };
  if (tag & 0x20) {
    node.children = [];
    let q = 0;
    while (q < value.length) {
      const r = readTlv(value, q);
      if (!r) throw new Error("Truncated BER element");
      node.children.push(r.node);
      q = r.next;
    }
  }
  return { node, next: p + len };
}

export function readInt(t: Tlv): number {
  let n = t.value[0] & 0x80 ? -1 : 0;
  for (const b of t.value) n = n * 256 + b;
  return n;
}
export const readStr = (t: Tlv) => t.value.toString("utf8");
