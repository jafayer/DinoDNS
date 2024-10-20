import { ZoneData, SupportedRecordType, SupportedAnswer } from '../../../types/dns';
import { Store } from '../Store';
import { EventEmitter } from 'events';
import { DNSRequest, DNSResponse, NextFunction } from '../../../types/server';
import { isEqual as _isEqual } from 'lodash';

type TypedMap<K extends keyof T, T> = Map<K, T[K][]>;

export class DefaultStore extends EventEmitter implements Store {
  public shouldCache: boolean;
  constructor({ shouldCache = false }: { shouldCache?: boolean } = {}) {
    super();

    this.shouldCache = shouldCache;
    this.handler = this.handler.bind(this);
  }
  data: Map<string, TypedMap<SupportedRecordType, ZoneData>> = new Map();

  set<T extends SupportedRecordType>(domain: string, rType: T, data: ZoneData[T] | ZoneData[T][]): void {
    const record = this.data.get(domain) || (new Map() as TypedMap<SupportedRecordType, ZoneData>);
    if (!Array.isArray(data)) {
      data = [data];
    }

    record.set(rType, data);
    this.data.set(domain, record);
  }

  get<T extends SupportedRecordType>(
    domain: string,
    rType?: T,
    wildcards: boolean = true,
  ): ZoneData[T][] | ZoneData[keyof ZoneData][] | null {
    if (rType) {
      const record = this.data.get(domain);
      if (record && record.size > 0) {
        return record.get(rType) || null;
      }
    } else {
      const record = this.data.get(domain);
      if (record && record.size > 0) {
        return Array.from(record.values()).flat();
      }
    }

    if (!wildcards) {
      return null;
    }

    let labels = domain.split('.').toSpliced(0, 0, '*');

    while (labels.length > 1) {
      labels = labels.toSpliced(0, 2).toSpliced(0, 0, '*');

      const wildcardDomain = labels.join('.');

      if (rType) {
        const record = this.data.get(wildcardDomain);
        if (record && record.size > 0) {
          return record.get(rType) || null;
        }
      } else {
        const record = this.data.get(wildcardDomain);
        if (record && record.size > 0) {
          return Array.from(record.values()).flat();
        }
      }
    }

    return null;
  }

  append<T extends SupportedRecordType>(domain: string, type: T, data: ZoneData[T]): void {
    const record = this.data.get(domain) || (new Map() as TypedMap<SupportedRecordType, ZoneData>);
    const existing = record.get(type) || [];
    record.set(type, [...existing, data]);
    this.data.set(domain, record);
  }

  delete<T extends SupportedRecordType>(domain: string, type?: T, data?: ZoneData[T]): void {
    if (!type) {
      this.data.delete(domain);
      return;
    }

    const record = this.data.get(domain);
    if (!record) {
      return;
    }

    if (!data) {
      record.delete(type);
      return;
    }

    const existing = record.get(type);
    if (!existing) {
      return;
    }

    const newData = existing.filter((d) => !_isEqual(d, data));
    if (newData.length === 0) {
      record.delete(type);
      return;
    } else {
      record.set(type, newData);
    }
  }

  handler(req: DNSRequest, res: DNSResponse, next: NextFunction) {
    if (res.finished) {
      return next();
    }

    const { questions } = req.packet;
    const { name, type } = questions![0];

    const records = this.get(name, type);

    const answers: SupportedAnswer[] | undefined = records?.map((record) => {
      return {
        name,
        type,
        data: record,
      } as SupportedAnswer;
    });

    if (records && answers && answers.length > 0) {
      res.answer(answers);

      if (this.shouldCache) {
        this.emitCacheRequest(name, type, records);
      }
    }

    next();
  }

  async emitCacheRequest<T extends SupportedRecordType>(zone: string, rType: T, records: ZoneData[T][]) {
    this.emit('cacheRequest', {
      zoneName: zone,
      recordType: rType,
      records: records,
    });
  }

  toString() {
    return JSON.stringify(
      Object.fromEntries(
        Array.from(this.data.entries()).map(([domain, records]) => {
          return [
            domain,
            Object.fromEntries(
              Array.from(records.entries()).map(([rType, data]) => {
                return [rType, data];
              }),
            ),
          ];
        }),
      ),
    );
  }

  static fromString(str: string) {
    const obj = JSON.parse(str) as { [key: string]: { [key in SupportedRecordType]: ZoneData[key][] } };
    const store = new DefaultStore();

    for (const [domain, data] of Object.entries(obj)) {
      for (const [rType, records] of Object.entries(data)) {
        store.set(domain, rType as SupportedRecordType, records);
      }
    }

    return store;
  }
}
