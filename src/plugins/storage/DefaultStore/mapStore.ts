import { ZoneData, SupportedRecordType, SupportedAnswer } from '../../../types/dns';
import { Store } from '../Store';
import { EventEmitter } from 'events';
import { DNSRequest, DNSResponse, NextFunction } from '../../../types/server';

type TypedMap<K extends keyof T, T> = Map<K, T[K][]>;

export class MapStore extends EventEmitter implements Store {
  public shouldCache: boolean;
  constructor({ shouldCache = false }: { shouldCache?: boolean } = {}) {
    super();

    this.shouldCache = shouldCache;
  }
  data: Map<string, TypedMap<SupportedRecordType, ZoneData>> = new Map();

  async set<T extends SupportedRecordType>(domain: string, rType: T, data: ZoneData[T] | ZoneData[T][]): Promise<void> {
    const record = this.data.get(domain) || (new Map() as TypedMap<SupportedRecordType, ZoneData>);
    if (!Array.isArray(data)) {
      data = [data];
    }

    record.set(rType, data);
    this.data.set(domain, record);
  }

  async get<T extends SupportedRecordType>(
    domain: string,
    rType?: T,
    wildcards: boolean = true,
  ): Promise<ZoneData[T][] | ZoneData[keyof ZoneData][] | null> {
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

  async append<T extends SupportedRecordType>(domain: string, type: T, data: ZoneData[T]): Promise<void> {
    const record = this.data.get(domain) || (new Map() as TypedMap<SupportedRecordType, ZoneData>);
    const existing = record.get(type) || [];
    record.set(type, [...existing, data]);
    this.data.set(domain, record);
  }

  async delete<T extends SupportedRecordType>(domain: string, type?: T, data?: ZoneData[T]): Promise<void> {
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

    const newData = existing.filter((d) => d !== data);
    if (newData.length === 0) {
      record.delete(type);
      return;
    } else {
      record.set(type, newData);
    }
  }

  async handler(req: DNSRequest, res: DNSResponse, next: NextFunction) {
    const { questions } = req.packet;
    const { name, type } = questions![0];

    const records = await this.get(name, type);

    const answers: SupportedAnswer[] | undefined = records?.map((record) => {
      return {
        name,
        type,
        data: record,
      } as SupportedAnswer;
    });

    if (answers && answers.length > 0) {
      res.answer(answers);

      if (this.shouldCache) {
        this.emitCacheRequest(name, type, records as ZoneData[SupportedRecordType][]);
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
      )
    )
  }

  static fromString(str: string) {
    const obj = JSON.parse(str) as { [key: string]: { [key in SupportedRecordType]: ZoneData[key][] } };
    const store = new MapStore();

    for (const [domain, data] of Object.entries(obj)) {
      for (const [rType, records] of Object.entries(data)) {
        store.set(domain, rType as SupportedRecordType, records);
      }
    }

    return store;
  }
}
