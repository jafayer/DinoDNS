import { ZoneData, SupportedRecordType, SupportedAnswer } from '../../../types/dns';
import { Store } from '../Store';
import { EventEmitter } from 'events';
import { DNSRequest, DNSResponse, NextFunction } from '../../../types/server';
import { isEqual as _isEqual } from 'lodash';

type TypedMap<K extends keyof T, T> = Map<K, T[K][]>;

/**
 * A simple in-memory store that stores data in a Map.
 */
export class DefaultStore extends EventEmitter implements Store {
  public shouldCache: boolean;
  constructor({ shouldCache = false }: { shouldCache?: boolean } = {}) {
    super();

    this.shouldCache = shouldCache;
    this.handler = this.handler.bind(this);
  }
  data: Map<string, TypedMap<SupportedRecordType, ZoneData>> = new Map();

  /**
   * Set or update information about a zone in the database.
   * @param domain The domain to set
   * @param rType The record type to set
   * @param data The data to set
   */
  set<T extends SupportedRecordType>(domain: string, rType: T, data: ZoneData[T] | ZoneData[T][]): void {
    const record = this.data.get(domain) || (new Map() as TypedMap<SupportedRecordType, ZoneData>);
    if (!Array.isArray(data)) {
      data = [data];
    }

    record.set(rType, data);
    this.data.set(domain, record);
  }

  /**
   * Retrieve information about a zone in the database.
   * 
   * @param domain The domain to get
   * @param rType The record type to get
   * @param wildcards Whether to resolve wildcard records
   * @returns The data for the given domain and record type, or null if no data is found 
   */
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

  /**
   * Append information about a zone in the database.
   * 
   * @param domain The domain to append data for
   * @param type The record type to append
   * @param data The data to append
   */
  append<T extends SupportedRecordType>(domain: string, type: T, data: ZoneData[T]): void {
    const record = this.data.get(domain) || (new Map() as TypedMap<SupportedRecordType, ZoneData>);
    const existing = record.get(type) || [];
    record.set(type, [...existing, data]);
    this.data.set(domain, record);
  }

  /**
   * Delete information about a zone in the database.
   * 
   * If no type is provided, all data for the domain should be deleted.
   * If no data is provided, all data of the given type should be deleted.
   * 
   * @param domain The domain to delete data from
   * @param type Optional. The record type to delete
   * @param data Optional. The data to delete
   * @returns 
   */
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

  /**
   * The handler for the store, used in the framework to answer queries.
   */
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

  /**
   * Emit a cache request event.
   * 
   * This event is emitted when the store asks any consumers to cache data.
   * 
   * This event will be fired if the `shouldCache` option is set to true.
   * 
   * @param zone The zone to cache the record for
   * @param rType The record type to cache
   * @param records The records to cache
   */
  async emitCacheRequest<T extends SupportedRecordType>(zone: string, rType: T, records: ZoneData[T][]) {
    this.emit('cacheRequest', {
      zoneName: zone,
      recordType: rType,
      records: records,
    });
  }

  /**
   * Serialize the store to a string. This is useful for persisting the store to disk.
   * 
   * @returns The serialized store
   */
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

  /**
   * Deserialize a store from a string.
   * 
   * @param str The string to deserialize
   * @returns The deserialized store
   */
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
