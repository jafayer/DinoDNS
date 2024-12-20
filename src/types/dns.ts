import type {
  DsData,
  MxData,
  RpData,
  CaaData,
  SoaData,
  SrvData,
  TxtData,
  NsecData,
  TlsaData,
  HInfoData,
  NaptrData,
  Nsec3Data,
  RrsigData,
  SshfpData,
  DnskeyData,
  StringRecordType,
  OtherRecordType,
  Answer,
  OptAnswer,
  RecordType,
  Question,
} from 'dns-packet';

/**
 * The dns-packet type definitions provide robust Answer and Type definitions, but do not provide
 * Any means of expressing "Any kind of Data". This type definition is a union of all possible
 * data types that can be returned in a DNS response.
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
