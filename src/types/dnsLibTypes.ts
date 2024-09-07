import type { BaseAnswer, Answer } from 'dns-packet';
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
  OtherRecordType
} from 'dns-packet';

type ExtractDataType<T> = T extends BaseAnswer<any, infer D> ? D : never;
type ExpandUnion<T> = T extends infer U ? U : never;

export type ZoneData = {
    [T in StringRecordType]: string;
} & {
    [T in Exclude<OtherRecordType, StringRecordType>]: Buffer;
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

export type AnswerMap = {
  [T in Answer as ExtractDataType<T> extends never ? never : T['type']]: BaseAnswer<T['type'], ExtractDataType<T>>;
};

type AllowedRecordTypes = ExpandUnion<keyof AnswerMap>;
export type RecordAnswer<T extends AllowedRecordTypes> = AnswerMap[T];
