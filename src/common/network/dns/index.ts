/**
 * Zero-copy DNS packet codec.
 *
 * This module provides a complete replacement for the `dns-packet` runtime library.
 * It implements the DNS wire format (RFC 1035 and extensions) with a focus on
 * performance through zero-copy parsing:
 *
 * - Incoming packets keep the raw Buffer as the primary source of truth.
 * - Header fields (id, flags) are read directly from fixed buffer offsets.
 * - Questions and resource records are parsed lazily, only when first accessed.
 * - Encoding builds a Buffer from the JS packet object.
 *
 * Types are still sourced from `@types/dns-packet` so the rest of the codebase
 * retains full TypeScript coverage.
 */

import type * as dnsPacket from 'dns-packet';

// ─────────────────────────────────────────────
// Flag constants (RFC 1035 §4.1.1)
// ─────────────────────────────────────────────
export const QR_MASK = 0x8000;
export const OPCODE_MASK = 0x7800;
export const AUTHORITATIVE_ANSWER = 0x0400;
export const TRUNCATED_RESPONSE = 0x0200;
export const RECURSION_DESIRED = 0x0100;
export const RECURSION_AVAILABLE = 0x0080;
export const AUTHENTIC_DATA = 0x0020;
export const CHECKING_DISABLED = 0x0010;
export const RCODE_MASK = 0x000f;

// ─────────────────────────────────────────────
// Internal resource-record type
// ─────────────────────────────────────────────

/**
 * Internal representation of a DNS resource record used by the codec.
 * `dnsPacket.Answer` is a large discriminated union that TypeScript cannot
 * easily index at runtime; this type names only the fields the codec actually
 * reads, avoiding unsafe double-casts at every use site.
 */
interface RR {
  type: string;
  name: string;
  ttl?: number;
  class?: string;
  data: unknown;
}

// ─────────────────────────────────────────────
// Record-type / class tables
// ─────────────────────────────────────────────
const QTYPES: Record<string, number> = {
  // Standard record types (RFC 1035)
  A: 1, NS: 2, MD: 3, MF: 4, CNAME: 5, SOA: 6, MB: 7, MG: 8, MR: 9,
  NULL: 10, WKS: 11, PTR: 12, HINFO: 13, MINFO: 14, MX: 15, TXT: 16,

  // Extended standard record types
  RP: 17, AFSDB: 18, X25: 19, ISDN: 20, RT: 21, NSAP: 22, 'NSAP-PTR': 23,
  SIG: 24, KEY: 25, PX: 26, GPOS: 27, AAAA: 28, LOC: 29, NXT: 30,
  EID: 31, NIMLOC: 32, SRV: 33, ATMA: 34, NAPTR: 35, KX: 36, CERT: 37,
  A6: 38, DNAME: 39, SINK: 40, OPT: 41, APL: 42,

  // DNSSEC record types (RFC 4034, 5155)
  DS: 43, SSHFP: 44, IPSECKEY: 45, RRSIG: 46, NSEC: 47, DNSKEY: 48,
  DHCID: 49, NSEC3: 50, NSEC3PARAM: 51,

  // Additional / experimental types
  TLSA: 52, HIP: 55, NINFO: 56, RKEY: 57, TALINK: 58,
  CDS: 59, CDNSKEY: 60, OPENPGPKEY: 61, CSYNC: 62, SMIMEA: 63,
  SPF: 99, UINFO: 100, UID: 101, GID: 102, UNSPEC: 103,
  NID: 104, L32: 105, L64: 106, LP: 107, EUI48: 108, EUI64: 109,

  // Meta / query types
  TKEY: 249, TSIG: 250, IXFR: 251, AXFR: 252, MAILB: 253, MAILA: 254,
  ANY: 255, URI: 256, CAA: 257, AVC: 258, DOA: 259, AMTRELAY: 260,
  TA: 32768, DLV: 32769,
};

const QTYPES_R: Record<number, string> = Object.fromEntries(
  Object.entries(QTYPES).map(([k, v]) => [v, k]),
);

const QCLASSES: Record<string, number> = { IN: 1, CS: 2, CH: 3, HS: 4, ANY: 255 };
const QCLASSES_R: Record<number, string> = Object.fromEntries(
  Object.entries(QCLASSES).map(([k, v]) => [v, k]),
);

// ─────────────────────────────────────────────
// DNS name helpers
// ─────────────────────────────────────────────

/**
 * Read a DNS name from `buf` starting at `offset`.
 * Handles label compression (RFC 1035 §4.1.4).
 * Returns `[name, offsetAfterName]`.
 */
function decodeName(buf: Buffer, offset: number): [string, number] {
  const labels: string[] = [];
  let jumped = false;
  let savedOffset = -1;
  let guard = 0;

  while (offset < buf.length) {
    if (++guard > 255) throw new Error('DNS name: compression loop detected');
    const len = buf[offset];

    if (len === 0) {
      if (!jumped) offset++;
      break;
    }

    if ((len & 0xc0) === 0xc0) {
      if (offset + 1 >= buf.length) throw new Error('DNS name: pointer beyond buffer');
      if (!jumped) savedOffset = offset + 2;
      offset = ((len & 0x3f) << 8) | buf[offset + 1];
      jumped = true;
      continue;
    }

    offset++;
    if (offset + len > buf.length) throw new Error('DNS name: label beyond buffer');
    labels.push(buf.subarray(offset, offset + len).toString('ascii'));
    offset += len;
  }

  return [labels.join('.'), jumped ? savedOffset : offset];
}

/**
 * Write a domain name into `buf` at `offset` using the label format.
 * No compression is applied (safe for response building).
 * Returns the number of bytes written.
 */
function encodeName(buf: Buffer, name: string, offset: number): number {
  const start = offset;
  if (!name || name === '.') {
    buf[offset++] = 0;
    return 1;
  }
  for (const label of name.split('.')) {
    if (!label) continue;
    if (label.length > 63) throw new Error(`DNS label too long: "${label}"`);
    buf[offset++] = label.length;
    offset += buf.write(label, offset, 'ascii');
  }
  buf[offset++] = 0;
  return offset - start;
}

/** Byte length of a domain name in wire format (no compression). */
function nameLen(name: string): number {
  if (!name || name === '.') return 1;
  return (
    name
      .split('.')
      .filter(Boolean)
      .reduce((sum, l) => sum + 1 + l.length, 0) + 1
  );
}

// ─────────────────────────────────────────────
// Type-bitmap helpers (used by NSEC / NSEC3)
// ─────────────────────────────────────────────

function decodeTypeBitmap(buf: Buffer): string[] {
  const types: string[] = [];
  let off = 0;
  while (off + 1 < buf.length) {
    const windowNum = buf[off++];
    const bitmapLen = buf[off++];
    for (let i = 0; i < bitmapLen; i++) {
      const byte = buf[off + i];
      for (let bit = 7; bit >= 0; bit--) {
        if (byte & (1 << bit)) {
          const typeNum = windowNum * 256 + i * 8 + (7 - bit);
          const n = QTYPES_R[typeNum];
          if (n) types.push(n);
        }
      }
    }
    off += bitmapLen;
  }
  return types;
}

function encodeTypeBitmap(types: string[]): Buffer {
  const nums = types.map((t) => QTYPES[t] ?? 0).filter(Boolean);
  if (!nums.length) return Buffer.alloc(0);
  nums.sort((a, b) => a - b);

  // We only handle window 0 (type numbers 0–255) for now.
  const maxNum = Math.min(nums[nums.length - 1], 255);
  const bitmapLen = Math.ceil((maxNum + 1) / 8);
  const bitmap = Buffer.alloc(bitmapLen);
  for (const n of nums) {
    if (n > 255) continue;
    bitmap[Math.floor(n / 8)] |= 1 << (7 - (n % 8));
  }
  const result = Buffer.alloc(2 + bitmapLen);
  result[1] = bitmapLen;
  bitmap.copy(result, 2);
  return result;
}

// ─────────────────────────────────────────────
// IPv6 helpers
// ─────────────────────────────────────────────

function expandIPv6(addr: string): string {
  const halves = addr.split('::');
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const fill = 8 - left.length - right.length;
    return [...left, ...Array(fill).fill('0'), ...right]
      .map((g) => g.padStart(4, '0'))
      .join(':');
  }
  return addr
    .split(':')
    .map((g) => g.padStart(4, '0'))
    .join(':');
}

function compressIPv6(groups: string[]): string {
  // Find longest run of consecutive zero groups
  let bestStart = -1;
  let bestLen = 0;
  let cur = -1;
  let curLen = 0;
  for (let i = 0; i < 8; i++) {
    if (parseInt(groups[i], 16) === 0) {
      if (cur === -1) {
        cur = i;
        curLen = 1;
      } else {
        curLen++;
      }
      if (curLen > bestLen) {
        bestStart = cur;
        bestLen = curLen;
      }
    } else {
      cur = -1;
      curLen = 0;
    }
  }
  if (bestLen < 2) return groups.map((g) => parseInt(g, 16).toString(16)).join(':');
  const left = groups.slice(0, bestStart).map((g) => parseInt(g, 16).toString(16));
  const right = groups
    .slice(bestStart + bestLen)
    .map((g) => parseInt(g, 16).toString(16));
  return (left.join(':') || '') + '::' + (right.join(':') || '');
}

// ─────────────────────────────────────────────
// RDATA: decode
// ─────────────────────────────────────────────

function decodeRdata(buf: Buffer, off: number, rdlen: number, type: string): unknown {
  const end = off + rdlen;
  switch (type) {
    case 'A':
      return `${buf[off]}.${buf[off + 1]}.${buf[off + 2]}.${buf[off + 3]}`;

    case 'AAAA': {
      const groups: string[] = [];
      for (let i = 0; i < 8; i++) groups.push(buf.readUInt16BE(off + i * 2).toString(16));
      return compressIPv6(groups.map((g) => g.padStart(4, '0')));
    }

    case 'NS':
    case 'CNAME':
    case 'PTR':
    case 'DNAME': {
      const [name] = decodeName(buf, off);
      return name;
    }

    case 'MX': {
      const preference = buf.readUInt16BE(off);
      const [exchange] = decodeName(buf, off + 2);
      return { preference, exchange };
    }

    case 'SOA': {
      const [mname, off2] = decodeName(buf, off);
      const [rname, off3] = decodeName(buf, off2);
      let o = off3;
      const serial = buf.readUInt32BE(o); o += 4;
      const refresh = buf.readUInt32BE(o); o += 4;
      const retry = buf.readUInt32BE(o); o += 4;
      const expire = buf.readUInt32BE(o); o += 4;
      const minimum = buf.readUInt32BE(o);
      return { mname, rname, serial, refresh, retry, expire, minimum };
    }

    case 'TXT': {
      const strings: Buffer[] = [];
      let o = off;
      while (o < end) {
        const len = buf[o++];
        strings.push(buf.subarray(o, o + len));
        o += len;
      }
      return strings;
    }

    case 'SRV': {
      const priority = buf.readUInt16BE(off);
      const weight = buf.readUInt16BE(off + 2);
      const port = buf.readUInt16BE(off + 4);
      const [target] = decodeName(buf, off + 6);
      return { priority, weight, port, target };
    }

    case 'CAA': {
      const flags = buf[off];
      const tagLen = buf[off + 1];
      const tag = buf.subarray(off + 2, off + 2 + tagLen).toString('ascii');
      const value = buf.subarray(off + 2 + tagLen, end).toString('utf8');
      return { flags, tag, value };
    }

    case 'HINFO': {
      let o = off;
      const cpuLen = buf[o++];
      const cpu = buf.subarray(o, o + cpuLen).toString('ascii'); o += cpuLen;
      const osLen = buf[o++];
      const os = buf.subarray(o, o + osLen).toString('ascii');
      return { cpu, os };
    }

    case 'RP': {
      const [mbox, off2] = decodeName(buf, off);
      const [txt] = decodeName(buf, off2);
      return { mbox, txt };
    }

    case 'SSHFP': {
      const algorithm = buf[off];
      const fingerprint_type = buf[off + 1];
      const fingerprint = buf.subarray(off + 2, end);
      return { algorithm, fingerprint_type, fingerprint };
    }

    case 'DS': {
      const keyTag = buf.readUInt16BE(off);
      const algorithm = buf[off + 2];
      const digestType = buf[off + 3];
      const digest = buf.subarray(off + 4, end);
      return { keyTag, algorithm, digestType, digest };
    }

    case 'DNSKEY': {
      const flags = buf.readUInt16BE(off);
      const protocol = buf[off + 2];
      const algorithm = buf[off + 3];
      const publicKey = buf.subarray(off + 4, end);
      return { flags, protocol, algorithm, publicKey };
    }

    case 'TLSA': {
      const usage = buf[off];
      const selector = buf[off + 1];
      const matchingType = buf[off + 2];
      const certificate = buf.subarray(off + 3, end);
      return { usage, selector, matchingType, certificate };
    }

    case 'NSEC': {
      const [nextDomain, off2] = decodeName(buf, off);
      const types = decodeTypeBitmap(buf.subarray(off2, end));
      return { nextDomain, types };
    }

    case 'NSEC3': {
      let o = off;
      const hashAlgorithm = buf[o++];
      const nsec3flags = buf[o++];
      const iterations = buf.readUInt16BE(o); o += 2;
      const saltLen = buf[o++];
      const salt = buf.subarray(o, o + saltLen); o += saltLen;
      const hashLen = buf[o++];
      const nextOwnerName = buf.subarray(o, o + hashLen); o += hashLen;
      const types = decodeTypeBitmap(buf.subarray(o, end));
      return { hashAlgorithm, flags: nsec3flags, iterations, salt, nextOwnerName, types };
    }

    case 'RRSIG': {
      let o = off;
      const typeCovered = QTYPES_R[buf.readUInt16BE(o)] ?? String(buf.readUInt16BE(o)); o += 2;
      const algorithm = buf[o++];
      const labels = buf[o++];
      const originalTTL = buf.readUInt32BE(o); o += 4;
      const expiration = buf.readUInt32BE(o); o += 4;
      const inception = buf.readUInt32BE(o); o += 4;
      const keyTag = buf.readUInt16BE(o); o += 2;
      const [signerName, o2] = decodeName(buf, o);
      const signature = buf.subarray(o2, end);
      return { typeCovered, algorithm, labels, originalTTL, expiration, inception, keyTag, signerName, signature };
    }

    case 'NAPTR': {
      let o = off;
      const order = buf.readUInt16BE(o); o += 2;
      const preference = buf.readUInt16BE(o); o += 2;
      const fl = buf[o++];
      const naptrFlags = buf.subarray(o, o + fl).toString('ascii'); o += fl;
      const sl = buf[o++];
      const services = buf.subarray(o, o + sl).toString('ascii'); o += sl;
      const rl = buf[o++];
      const regexp = buf.subarray(o, o + rl).toString('ascii'); o += rl;
      const [replacement] = decodeName(buf, o);
      return { order, preference, flags: naptrFlags, services, regexp, replacement };
    }

    default:
      return buf.subarray(off, end);
  }
}

// ─────────────────────────────────────────────
// RDATA: byte-length calculation
// ─────────────────────────────────────────────

function rdataLen(type: string, data: unknown): number {
  const d = data as Record<string, unknown>;
  switch (type) {
    case 'A': return 4;
    case 'AAAA': return 16;
    case 'NS': case 'CNAME': case 'PTR': case 'DNAME':
      return nameLen(data as string);
    case 'MX':
      return 2 + nameLen(d.exchange as string);
    case 'SOA':
      return nameLen(d.mname as string) + nameLen(d.rname as string) + 20;
    case 'TXT': {
      const strs = Array.isArray(data) ? data : [data];
      return (strs as unknown[]).reduce((sum: number, s) => {
        const b = Buffer.isBuffer(s) ? s : Buffer.from(s as string);
        return sum + 1 + b.length;
      }, 0);
    }
    case 'SRV':
      return 6 + nameLen(d.target as string);
    case 'CAA': {
      const tag = Buffer.from(d.tag as string, 'ascii');
      const val = Buffer.from(d.value as string, 'utf8');
      return 2 + tag.length + val.length;
    }
    case 'HINFO': {
      return (
        1 + Buffer.from(d.cpu as string, 'ascii').length +
        1 + Buffer.from(d.os as string, 'ascii').length
      );
    }
    case 'RP':
      return nameLen(d.mbox as string) + nameLen(d.txt as string);
    case 'SSHFP': {
      const fp = toBuffer(d.fingerprint, 'hex');
      return 2 + fp.length;
    }
    case 'DS': {
      const digest = toBuffer(d.digest, 'hex');
      return 4 + digest.length;
    }
    case 'DNSKEY': {
      const pk = toBuffer(d.publicKey, 'base64');
      return 4 + pk.length;
    }
    case 'TLSA': {
      const cert = toBuffer(d.certificate, 'hex');
      return 3 + cert.length;
    }
    case 'NSEC': {
      return nameLen(d.nextDomain as string) + encodeTypeBitmap(d.types as string[]).length;
    }
    case 'NSEC3': {
      const salt = toBuffer(d.salt, 'hex');
      const next = toBuffer(d.nextOwnerName, 'hex');
      return 5 + salt.length + next.length + encodeTypeBitmap(d.types as string[]).length;
    }
    case 'RRSIG': {
      const sig = toBuffer(d.signature, 'base64');
      return 18 + nameLen(d.signerName as string) + sig.length;
    }
    case 'NAPTR': {
      const fl = Buffer.from((d.flags as string) ?? '', 'ascii');
      const sv = Buffer.from((d.services as string) ?? '', 'ascii');
      const re = Buffer.from((d.regexp as string) ?? '', 'ascii');
      return 4 + 1 + fl.length + 1 + sv.length + 1 + re.length + nameLen((d.replacement as string) ?? '.');
    }
    default: {
      if (Buffer.isBuffer(data)) return (data as Buffer).length;
      return 0;
    }
  }
}

function toBuffer(val: unknown, encoding: BufferEncoding): Buffer {
  if (Buffer.isBuffer(val)) return val;
  if (typeof val === 'string') return Buffer.from(val, encoding);
  return Buffer.alloc(0);
}

// ─────────────────────────────────────────────
// RDATA: encode
// ─────────────────────────────────────────────

function encodeRdata(type: string, data: unknown, buf: Buffer, off: number): number {
  const start = off;
  const d = data as Record<string, unknown>;

  switch (type) {
    case 'A': {
      const parts = (data as string).split('.').map(Number);
      buf[off++] = parts[0]; buf[off++] = parts[1];
      buf[off++] = parts[2]; buf[off++] = parts[3];
      break;
    }
    case 'AAAA': {
      const expanded = expandIPv6(data as string);
      for (const group of expanded.split(':')) {
        buf.writeUInt16BE(parseInt(group, 16), off); off += 2;
      }
      break;
    }
    case 'NS': case 'CNAME': case 'PTR': case 'DNAME':
      off += encodeName(buf, data as string, off);
      break;
    case 'MX':
      buf.writeUInt16BE((d.preference as number) ?? 0, off); off += 2;
      off += encodeName(buf, d.exchange as string, off);
      break;
    case 'SOA':
      off += encodeName(buf, d.mname as string, off);
      off += encodeName(buf, d.rname as string, off);
      buf.writeUInt32BE(d.serial as number, off); off += 4;
      buf.writeUInt32BE(d.refresh as number, off); off += 4;
      buf.writeUInt32BE(d.retry as number, off); off += 4;
      buf.writeUInt32BE(d.expire as number, off); off += 4;
      buf.writeUInt32BE(d.minimum as number, off); off += 4;
      break;
    case 'TXT': {
      const strs = Array.isArray(data) ? data : [data];
      for (const s of strs as unknown[]) {
        const b = Buffer.isBuffer(s) ? s : Buffer.from(s as string);
        buf[off++] = b.length;
        b.copy(buf, off); off += b.length;
      }
      break;
    }
    case 'SRV':
      buf.writeUInt16BE(d.priority as number, off); off += 2;
      buf.writeUInt16BE(d.weight as number, off); off += 2;
      buf.writeUInt16BE(d.port as number, off); off += 2;
      off += encodeName(buf, d.target as string, off);
      break;
    case 'CAA': {
      const tagBuf = Buffer.from(d.tag as string, 'ascii');
      const valBuf = Buffer.from(d.value as string, 'utf8');
      buf[off++] = d.flags as number;
      buf[off++] = tagBuf.length;
      tagBuf.copy(buf, off); off += tagBuf.length;
      valBuf.copy(buf, off); off += valBuf.length;
      break;
    }
    case 'HINFO': {
      const cpu = Buffer.from(d.cpu as string, 'ascii');
      const os = Buffer.from(d.os as string, 'ascii');
      buf[off++] = cpu.length; cpu.copy(buf, off); off += cpu.length;
      buf[off++] = os.length;  os.copy(buf, off);  off += os.length;
      break;
    }
    case 'RP':
      off += encodeName(buf, d.mbox as string, off);
      off += encodeName(buf, d.txt as string, off);
      break;
    case 'SSHFP': {
      buf[off++] = d.algorithm as number;
      buf[off++] = d.fingerprint_type as number;
      const fp = toBuffer(d.fingerprint, 'hex');
      fp.copy(buf, off); off += fp.length;
      break;
    }
    case 'DS': {
      buf.writeUInt16BE(d.keyTag as number, off); off += 2;
      buf[off++] = d.algorithm as number;
      buf[off++] = d.digestType as number;
      const digest = toBuffer(d.digest, 'hex');
      digest.copy(buf, off); off += digest.length;
      break;
    }
    case 'DNSKEY': {
      buf.writeUInt16BE(d.flags as number, off); off += 2;
      buf[off++] = d.protocol as number;
      buf[off++] = d.algorithm as number;
      const pk = toBuffer(d.publicKey, 'base64');
      pk.copy(buf, off); off += pk.length;
      break;
    }
    case 'TLSA': {
      buf[off++] = d.usage as number;
      buf[off++] = d.selector as number;
      buf[off++] = d.matchingType as number;
      const cert = toBuffer(d.certificate, 'hex');
      cert.copy(buf, off); off += cert.length;
      break;
    }
    case 'NSEC': {
      off += encodeName(buf, d.nextDomain as string, off);
      const bitmap = encodeTypeBitmap(d.types as string[]);
      bitmap.copy(buf, off); off += bitmap.length;
      break;
    }
    case 'NSEC3': {
      buf[off++] = d.hashAlgorithm as number;
      buf[off++] = (d.flags as number) ?? 0;
      buf.writeUInt16BE(d.iterations as number, off); off += 2;
      const salt = toBuffer(d.salt, 'hex');
      buf[off++] = salt.length; salt.copy(buf, off); off += salt.length;
      const next = toBuffer(d.nextOwnerName, 'hex');
      buf[off++] = next.length; next.copy(buf, off); off += next.length;
      const bitmap = encodeTypeBitmap(d.types as string[]);
      bitmap.copy(buf, off); off += bitmap.length;
      break;
    }
    case 'RRSIG': {
      buf.writeUInt16BE(QTYPES[d.typeCovered as string] ?? 0, off); off += 2;
      buf[off++] = d.algorithm as number;
      buf[off++] = d.labels as number;
      buf.writeUInt32BE(d.originalTTL as number, off); off += 4;
      buf.writeUInt32BE(d.expiration as number, off); off += 4;
      buf.writeUInt32BE(d.inception as number, off); off += 4;
      buf.writeUInt16BE(d.keyTag as number, off); off += 2;
      off += encodeName(buf, d.signerName as string, off);
      const sig = toBuffer(d.signature, 'base64');
      sig.copy(buf, off); off += sig.length;
      break;
    }
    case 'NAPTR': {
      buf.writeUInt16BE(d.order as number, off); off += 2;
      buf.writeUInt16BE(d.preference as number, off); off += 2;
      const fl = Buffer.from((d.flags as string) ?? '', 'ascii');
      buf[off++] = fl.length; fl.copy(buf, off); off += fl.length;
      const sv = Buffer.from((d.services as string) ?? '', 'ascii');
      buf[off++] = sv.length; sv.copy(buf, off); off += sv.length;
      const re = Buffer.from((d.regexp as string) ?? '', 'ascii');
      buf[off++] = re.length; re.copy(buf, off); off += re.length;
      off += encodeName(buf, (d.replacement as string) ?? '.', off);
      break;
    }
    default:
      if (Buffer.isBuffer(data)) {
        (data as Buffer).copy(buf, off); off += (data as Buffer).length;
      }
      break;
  }

  return off - start;
}

// ─────────────────────────────────────────────
// Resource-record decode helper
// ─────────────────────────────────────────────

function decodeRR(buf: Buffer, off: number): [dnsPacket.Answer, number] {
  const [name, o1] = decodeName(buf, off);
  const typeNum = buf.readUInt16BE(o1);
  const classNum = buf.readUInt16BE(o1 + 2);
  const ttl = buf.readUInt32BE(o1 + 4);
  const rdlen = buf.readUInt16BE(o1 + 8);
  const rdOff = o1 + 10;

  const type = QTYPES_R[typeNum] ?? `TYPE${typeNum}`;
  const klass = QCLASSES_R[classNum] ?? 'IN';
  const data = decodeRdata(buf, rdOff, rdlen, type);

  // Build via the internal RR interface then cast to the public Answer union.
  // All fields required by Answer are present; the cast is safe because the
  // discriminant field `type` matches what dns-packet expects.
  const record: RR = { type, name, ttl, class: klass, data };
  return [record as unknown as dnsPacket.Answer, rdOff + rdlen];
}

// ─────────────────────────────────────────────
// Public API – parse questions (zero-copy helper)
// ─────────────────────────────────────────────

/**
 * Parse only the question section from a raw DNS buffer.
 * The header (12 bytes) is read without allocating any new objects for
 * the fields we don't need.
 */
export function parseQuestions(buf: Buffer): dnsPacket.Question[] {
  if (buf.length < 12) return [];
  const count = buf.readUInt16BE(4);
  const questions: dnsPacket.Question[] = [];
  let off = 12;
  for (let i = 0; i < count && off < buf.length; i++) {
    const [name, o1] = decodeName(buf, off);
    const typeNum = buf.readUInt16BE(o1);
    const classNum = buf.readUInt16BE(o1 + 2);
    questions.push({
      name,
      type: (QTYPES_R[typeNum] ?? `TYPE${typeNum}`) as dnsPacket.RecordType,
      class: (QCLASSES_R[classNum] ?? 'IN') as dnsPacket.RecordClass,
    });
    off = o1 + 4;
  }
  return questions;
}

// ─────────────────────────────────────────────
// Public API – decode
// ─────────────────────────────────────────────

/**
 * Decode a raw DNS wire-format buffer into a packet object.
 *
 * The returned object is a fully materialised `dnsPacket.Packet`.
 * For incoming queries where only a subset of fields is needed, prefer
 * accessing them through {@link PacketWrapper} which reads lazily from
 * the underlying buffer.
 */
export function decode(buf: Buffer): dnsPacket.Packet {
  if (buf.length < 12) throw new Error('DNS buffer too short');
  const id = buf.readUInt16BE(0);
  const flags = buf.readUInt16BE(2);
  const qdcount = buf.readUInt16BE(4);
  const ancount = buf.readUInt16BE(6);
  const nscount = buf.readUInt16BE(8);
  const arcount = buf.readUInt16BE(10);

  const type: 'query' | 'response' = flags & QR_MASK ? 'response' : 'query';
  let off = 12;

  const questions: dnsPacket.Question[] = [];
  for (let i = 0; i < qdcount; i++) {
    const [name, o1] = decodeName(buf, off);
    const typeNum = buf.readUInt16BE(o1);
    const classNum = buf.readUInt16BE(o1 + 2);
    questions.push({
      name,
      type: (QTYPES_R[typeNum] ?? `TYPE${typeNum}`) as dnsPacket.RecordType,
      class: (QCLASSES_R[classNum] ?? 'IN') as dnsPacket.RecordClass,
    });
    off = o1 + 4;
  }

  const answers: dnsPacket.Answer[] = [];
  for (let i = 0; i < ancount; i++) {
    const [rr, o1] = decodeRR(buf, off); answers.push(rr); off = o1;
  }
  const authorities: dnsPacket.Answer[] = [];
  for (let i = 0; i < nscount; i++) {
    const [rr, o1] = decodeRR(buf, off); authorities.push(rr); off = o1;
  }
  const additionals: dnsPacket.Answer[] = [];
  for (let i = 0; i < arcount; i++) {
    const [rr, o1] = decodeRR(buf, off); additionals.push(rr); off = o1;
  }

  const packet: dnsPacket.Packet = { id, type, flags, questions, answers, authorities, additionals };

  // Populate the individual flag booleans so DecodedPacket consumers work correctly
  (packet as Record<string, unknown>).flag_qr = !!(flags & QR_MASK);
  (packet as Record<string, unknown>).flag_aa = !!(flags & AUTHORITATIVE_ANSWER);
  (packet as Record<string, unknown>).flag_tc = !!(flags & TRUNCATED_RESPONSE);
  (packet as Record<string, unknown>).flag_rd = !!(flags & RECURSION_DESIRED);
  (packet as Record<string, unknown>).flag_ra = !!(flags & RECURSION_AVAILABLE);
  (packet as Record<string, unknown>).flag_z  = false;
  (packet as Record<string, unknown>).flag_ad = !!(flags & AUTHENTIC_DATA);
  (packet as Record<string, unknown>).flag_cd = !!(flags & CHECKING_DISABLED);

  return packet;
}

// ─────────────────────────────────────────────
// Public API – encoding-length
// ─────────────────────────────────────────────

/** Compute the encoded byte length of a packet without actually encoding it. */
export function encodingLength(packet: dnsPacket.Packet): number {
  let len = 12; // fixed header
  for (const q of packet.questions ?? []) {
    len += nameLen(q.name) + 4;
  }
  for (const section of [packet.answers, packet.authorities, packet.additionals]) {
    for (const rr of section ?? []) {
      const r = rr as unknown as RR;
      len += nameLen(r.name) + 10 + rdataLen(r.type, r.data);
    }
  }
  return len;
}

// ─────────────────────────────────────────────
// Public API – encode
// ─────────────────────────────────────────────

/** Encode a DNS packet object into wire-format bytes. */
export function encode(packet: dnsPacket.Packet): Buffer {
  const len = encodingLength(packet);
  const buf = Buffer.alloc(len);

  let flags = packet.flags ?? 0;
  if (packet.type === 'response') flags |= QR_MASK;
  else flags &= ~QR_MASK;

  buf.writeUInt16BE(packet.id ?? 0, 0);
  buf.writeUInt16BE(flags, 2);
  buf.writeUInt16BE((packet.questions ?? []).length, 4);
  buf.writeUInt16BE((packet.answers ?? []).length, 6);
  buf.writeUInt16BE((packet.authorities ?? []).length, 8);
  buf.writeUInt16BE((packet.additionals ?? []).length, 10);

  let off = 12;
  for (const q of packet.questions ?? []) {
    off += encodeName(buf, q.name, off);
    buf.writeUInt16BE(QTYPES[q.type] ?? 0, off); off += 2;
    buf.writeUInt16BE(QCLASSES[q.class ?? 'IN'] ?? 1, off); off += 2;
  }

  for (const section of [packet.answers, packet.authorities, packet.additionals]) {
    for (const rr of section ?? []) {
      const r = rr as unknown as RR;
      const rdl = rdataLen(r.type, r.data);
      off += encodeName(buf, r.name, off);
      buf.writeUInt16BE(QTYPES[r.type] ?? 0, off); off += 2;
      buf.writeUInt16BE(QCLASSES[r.class ?? 'IN'] ?? 1, off); off += 2;
      buf.writeUInt32BE(r.ttl ?? 0, off); off += 4;
      buf.writeUInt16BE(rdl, off); off += 2;
      off += encodeRdata(r.type, r.data, buf, off);
    }
  }

  return buf;
}

// ─────────────────────────────────────────────
// Public API – TCP stream framing
// ─────────────────────────────────────────────

/** Encode a packet with a 2-byte length prefix (DNS-over-TCP). */
export function streamEncode(packet: dnsPacket.Packet): Buffer {
  const body = encode(packet);
  const buf = Buffer.alloc(2 + body.length);
  buf.writeUInt16BE(body.length, 0);
  body.copy(buf, 2);
  return buf;
}

/** Decode a DNS-over-TCP message (skip 2-byte length prefix). */
export function streamDecode(buf: Buffer): dnsPacket.Packet {
  return decode(buf.subarray(2));
}
