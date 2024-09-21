export enum SupportedRecordType {
  A = 1,
  AAAA = 28,
  CNAME = 5,
  MX = 15,
  NS = 2,
  SOA = 6,
  TXT = 16,
}

export enum SupportedRecordClass {
  IN = 1,
}

export type Question = {
  type: SupportedRecordType;
  class: SupportedRecordClass;
  name: string;
};

export enum DNSPacketType {
  QUERY = 'query',
  RESPONSE = 'response',
}

export enum RCode {
  NOERROR = 0,
  FORMERR = 1,
  SERVFAIL = 2,
  NXDOMAIN = 3,
  NOTIMP = 4,
  REFUSED = 5,
}

export enum DNSFlag {
  QR = 0,
  OPCODE = 1,
  AA = 2,
  TC = 3,
  RD = 4,
  RA = 5,
  Z = 6,
  AD = 7,
  CD = 8,
  RCODE = 9,
}

export interface DNSPacket<T extends DNSPacketType> {
  type: T;
  id: number;
  flags: DNSFlag[];
  questions: Question[];
  answers: T extends DNSPacketType.RESPONSE ? Answer[] : never;
  authorities: T extends DNSPacketType.RESPONSE ? Answer[] : never;
  additionals: T extends DNSPacketType.RESPONSE ? Answer[] : never;
}

/**
 * RECORD DATA
 */
export type A = {
  data: string;
};

export type AAAA = {
  data: string;
};

export type CNAME = {
  data: string;
};

export type MX = {
  data: {
    preference: number;
    exchange: string;
  };
};

export type NS = {
  data: string;
};

export type SOA = {
  data: {
    mname: string;
    rname: string;
    serial: number;
    refresh: number;
    retry: number;
    expire: number;
    minimum: number;
  };
};

/**
 * When encoding, scalar values are converted to an array and strings are converted to UTF-8 encoded Buffers.
 *
 * When decoding, the return value will always be an array of Buffer.
 */
export type TXT = {
  data: string | string[];
};

export type DNSRecord = A | AAAA | CNAME | MX | NS | SOA | TXT;

export type Answer =
  | ({ type: SupportedRecordType.A; class: SupportedRecordClass.IN; name: string; ttl: number } & A)
  | ({ type: SupportedRecordType.AAAA; class: SupportedRecordClass.IN; name: string; ttl: number } & AAAA)
  | ({ type: SupportedRecordType.CNAME; class: SupportedRecordClass.IN; name: string; ttl: number } & CNAME)
  | ({ type: SupportedRecordType.MX; class: SupportedRecordClass.IN; name: string; ttl: number } & MX)
  | ({ type: SupportedRecordType.NS; class: SupportedRecordClass.IN; name: string; ttl: number } & NS)
  | ({ type: SupportedRecordType.SOA; class: SupportedRecordClass.IN; name: string; ttl: number } & SOA)
  | ({ type: SupportedRecordType.TXT; class: SupportedRecordClass.IN; name: string; ttl: number } & TXT);
