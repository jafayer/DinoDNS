// ─────────────────────────────────────────────────────────────────────────────
// Native DNS type definitions.
//
// These types are defined here rather than borrowed from the `@types/dns-packet`
// package so that:
//   • They precisely match the field names and shapes produced/consumed by
//     DinoDNS's own zero-copy codec (e.g. `publicKey` not `key` for DNSKEY,
//     `types` not `rrtypes` for NSEC/NSEC3, `nextOwnerName` not `nextDomain`
//     for NSEC3).
//   • DinoDNS has zero external type-only dependencies at compile time.
// ─────────────────────────────────────────────────────────────────────────────

// ── Record class ─────────────────────────────────────────────────────────────

/** DNS record classes (RFC 1035 §3.2.4). */
export type RecordClass = 'IN' | 'CS' | 'CH' | 'HS' | 'ANY';

// ── Record type ──────────────────────────────────────────────────────────────

/**
 * All DNS record types whose RDATA is a plain domain-name string when decoded.
 * (RFC 1035 and friends.)
 */
export type StringRecordType = 'A' | 'AAAA' | 'CNAME' | 'DNAME' | 'NS' | 'PTR';

/**
 * Record types whose RDATA is returned as an opaque `Buffer` by the codec
 * (i.e. types we do not yet have a full structured decoder for).
 */
export type OtherRecordType =
  | 'AFSDB'
  | 'APL'
  | 'AXFR'
  | 'CDNSKEY'
  | 'CDS'
  | 'CERT'
  | 'DHCID'
  | 'DLV'
  | 'HIP'
  | 'IPSECKEY'
  | 'IXFR'
  | 'KEY'
  | 'KX'
  | 'LOC'
  | 'NSEC3PARAM'
  | 'NULL'
  | 'SIG'
  | 'TA'
  | 'TKEY'
  | 'TSIG'
  | 'URI';

/** Union of all supported DNS record type strings. */
export type RecordType =
  | StringRecordType
  | OtherRecordType
  | 'CAA'
  | 'DNSKEY'
  | 'DS'
  | 'HINFO'
  | 'MX'
  | 'NAPTR'
  | 'NS'
  | 'NSEC'
  | 'NSEC3'
  | 'OPT'
  | 'RP'
  | 'RRSIG'
  | 'SOA'
  | 'SRV'
  | 'SSHFP'
  | 'TLSA'
  | 'TXT';

// ── DNS question ─────────────────────────────────────────────────────────────

/** A DNS question section entry (RFC 1035 §4.1.2). */
export interface Question {
  type: RecordType;
  name: string;
  class?: RecordClass;
}

// ── RDATA interfaces ─────────────────────────────────────────────────────────

/** RDATA for a CAA record (RFC 8659). */
export interface CaaData {
  /** Flags byte (bit 0 = issuer critical). */
  flags?: number;
  /** Property tag, e.g. `"issue"`, `"issuewild"`, `"iodef"`. */
  tag: string;
  /** Property value. */
  value: string;
}

/**
 * RDATA for a DNSKEY record (RFC 4034 §2).
 *
 * Note: the public-key material is exposed as `publicKey` (not `key`) to
 * clearly distinguish it from the `flags` field and to match the field name
 * used by the DinoDNS codec.
 */
export interface DnskeyData {
  flags: number;
  protocol: number;
  algorithm: number;
  publicKey: Buffer;
}

/** RDATA for a DS record (RFC 4034 §5). */
export interface DsData {
  keyTag: number;
  algorithm: number;
  digestType: number;
  digest: Buffer;
}

/** RDATA for an HINFO record (RFC 1035 §3.3.2). */
export interface HInfoData {
  cpu: string;
  os: string;
}

/** RDATA for an MX record (RFC 1035 §3.3.9). */
export interface MxData {
  preference?: number;
  exchange: string;
}

/** RDATA for a NAPTR record (RFC 3403). */
export interface NaptrData {
  order: number;
  preference: number;
  flags: string;
  services: string;
  regexp: string;
  replacement: string;
}

/**
 * RDATA for an NSEC3 record (RFC 5155).
 *
 * Note: the next-owner hash is `nextOwnerName` (not `nextDomain`) and the
 * type-bitmap list is `types` (not `rrtypes`), matching the DinoDNS codec.
 */
export interface Nsec3Data {
  hashAlgorithm: number;
  flags: number;
  iterations: number;
  salt: Buffer;
  nextOwnerName: Buffer;
  types: string[];
}

/**
 * RDATA for an NSEC record (RFC 4034 §4).
 *
 * Note: the type-bitmap list is `types` (not `rrtypes`), matching the
 * DinoDNS codec.
 */
export interface NsecData {
  nextDomain: string;
  types: string[];
}

/** RDATA for an RP record (RFC 1183 §2.2). */
export interface RpData {
  mbox: string;
  txt: string;
}

/** RDATA for an RRSIG record (RFC 4034 §3). */
export interface RrsigData {
  typeCovered: string;
  algorithm: number;
  labels: number;
  originalTTL: number;
  expiration: number;
  inception: number;
  keyTag: number;
  signerName: string;
  signature: Buffer;
}

/** RDATA for a SOA record (RFC 1035 §3.3.13). */
export interface SoaData {
  mname: string;
  rname: string;
  serial: number;
  refresh: number;
  retry: number;
  expire: number;
  minimum: number;
}

/** RDATA for a SRV record (RFC 2782). */
export interface SrvData {
  priority?: number;
  weight?: number;
  port: number;
  target: string;
}

/** RDATA for an SSHFP record (RFC 4255). */
export interface SshfpData {
  algorithm: number;
  fingerprint_type: number;
  fingerprint: Buffer;
}

/** RDATA for a TLSA record (RFC 6698). */
export interface TlsaData {
  usage: number;
  selector: number;
  matchingType: number;
  certificate: Buffer;
}

/** RDATA for a TXT record.  Accepts a single string/Buffer or an array of either; the codec normalises to an array of character-string buffers on the wire (RFC 1035 §3.3.14). */
export type TxtData = string | Buffer | string[] | Buffer[];

// ── Answer types ─────────────────────────────────────────────────────────────

/** Shared fields present on every DNS resource record. */
interface BaseAnswer<T extends RecordType> {
  type: T;
  name: string;
  ttl?: number;
  class?: RecordClass;
}

/** Resource record whose RDATA is a plain domain-name / address string. */
export interface StringAnswer extends BaseAnswer<StringRecordType> {
  data: string;
}
/** Resource record whose RDATA is an opaque Buffer. */
export interface BufferAnswer extends BaseAnswer<OtherRecordType> {
  data: Buffer;
}

export interface CaaAnswer extends BaseAnswer<'CAA'> {
  data: CaaData;
}
export interface DnskeyAnswer extends BaseAnswer<'DNSKEY'> {
  data: DnskeyData;
}
export interface DSAnswer extends BaseAnswer<'DS'> {
  data: DsData;
}
export interface HInfoAnswer extends BaseAnswer<'HINFO'> {
  data: HInfoData;
}
export interface MxAnswer extends BaseAnswer<'MX'> {
  data: MxData;
}
export interface NaptrAnswer extends BaseAnswer<'NAPTR'> {
  data: NaptrData;
}
export interface Nsec3Answer extends BaseAnswer<'NSEC3'> {
  data: Nsec3Data;
}
export interface NsecAnswer extends BaseAnswer<'NSEC'> {
  data: NsecData;
}
/** OPT pseudo-record used by EDNS (RFC 6891). Not a real resource record. */
export interface OptAnswer extends BaseAnswer<'OPT'> {
  data?: Buffer;
}
export interface RpAnswer extends BaseAnswer<'RP'> {
  data: RpData;
}
export interface RrsigAnswer extends BaseAnswer<'RRSIG'> {
  data: RrsigData;
}
export interface SoaAnswer extends BaseAnswer<'SOA'> {
  data: SoaData;
}
export interface SrvAnswer extends BaseAnswer<'SRV'> {
  data: SrvData;
}
export interface SshfpAnswer extends BaseAnswer<'SSHFP'> {
  data: SshfpData;
}
export interface TlsaAnswer extends BaseAnswer<'TLSA'> {
  data: TlsaData;
}
export interface TxtAnswer extends BaseAnswer<'TXT'> {
  data: TxtData;
}

/** Union of all possible DNS resource record types. */
export type Answer =
  | StringAnswer
  | BufferAnswer
  | CaaAnswer
  | DnskeyAnswer
  | DSAnswer
  | HInfoAnswer
  | MxAnswer
  | NaptrAnswer
  | Nsec3Answer
  | NsecAnswer
  | OptAnswer
  | RpAnswer
  | RrsigAnswer
  | SoaAnswer
  | SrvAnswer
  | SshfpAnswer
  | TlsaAnswer
  | TxtAnswer;

// ── Packet ───────────────────────────────────────────────────────────────────

/** A DNS packet (RFC 1035 §4). */
export interface Packet {
  type?: 'query' | 'response';
  id?: number;
  flags?: number;
  questions?: Question[];
  answers?: Answer[];
  additionals?: Answer[];
  authorities?: Answer[];
}

/**
 * A fully decoded DNS packet with individual flag booleans.
 * Returned by the codec's `decode()` function.
 */
export interface DecodedPacket extends Packet {
  flag_qr: boolean;
  flag_aa: boolean;
  flag_tc: boolean;
  flag_rd: boolean;
  flag_ra: boolean;
  flag_z: boolean;
  flag_ad: boolean;
  flag_cd: boolean;
}

// ── DinoDNS-specific derived types ───────────────────────────────────────────

/**
 * All supported DNS record data types, keyed by record type.
 * Provides a type-safe mapping from record type → data shape.
 */
export type ZoneData = {
  [T in StringRecordType]: string;
} & {
  [T in OtherRecordType]: Buffer;
} & {
  CAA: CaaData;
  DNSKEY: DnskeyData;
  DS: DsData;
  HINFO: HInfoData;
  MX: MxData;
  NAPTR: NaptrData;
  NSEC3: Nsec3Data;
  NSEC: NsecData;
  RP: RpData;
  RRSIG: RrsigData;
  SOA: SoaData;
  SRV: SrvData;
  SSHFP: SshfpData;
  TLSA: TlsaData;
  TXT: TxtData;
};

/**
 * Defines a map of all possible data that can be returned in a DNS response.
 * Each key is a record type, and each value is an array of data associated with
 * that value.
 */
export type ZoneDataMap = {
  [T in keyof ZoneData]: ZoneData[T][];
};

export type SupportedAnswer = Exclude<Answer, OptAnswer>;
export type SupportedRecordType = Exclude<RecordType, 'OPT'>;
export type SupportedQuestion = Question & { type: SupportedRecordType };
