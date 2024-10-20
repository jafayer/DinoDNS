import { Cache } from '../Cache';
import { Handler } from '../../../types/server';
import { ZoneData, SupportedRecordType, SupportedAnswer } from '../../../types/dns';
import { isEqual as _isEqual } from 'lodash';

export type DefaultCacheOptions = {
  maxEntries?: number;
};

export class DefaultCache extends Cache {
  cache: Map<string, ZoneData[keyof ZoneData][]> = new Map();
  maxEntries: number | undefined;

  constructor(options?: DefaultCacheOptions) {
    super();
    this.maxEntries = options?.maxEntries;
  }

  get<T extends SupportedRecordType>(zone: string, rType: T): ZoneData[T][] | ZoneData[keyof ZoneData][] | null {
    const key = DefaultCache.getKey(zone, rType);
    return this.cache.get(key) || null;
  }

  set<T extends SupportedRecordType>(zone: string, rType: T, data: ZoneData[T] | ZoneData[keyof ZoneData][]) {
    if (this.maxEntries === 0) return;

    if (!Array.isArray(data)) {
      data = [data];
    }

    if (this.maxEntries && this.cache.size >= this.maxEntries) {
      this.evictRandomMember();
    }

    const key = DefaultCache.getKey(zone, rType);
    this.cache.set(key, data);
  }

  append(zone: string, rType: SupportedRecordType, data: ZoneData[SupportedRecordType]) {
    if (this.maxEntries === 0) return;

    const key = DefaultCache.getKey(zone, rType);
    const existing = this.cache.get(key) || [];
    this.cache.set(key, [...existing, data]);

    if (this.maxEntries && this.cache.size > this.maxEntries) {
      this.evictRandomMember();
    }
  }

  delete(zone: string, rType: SupportedRecordType, data?: ZoneData[SupportedRecordType]) {
    const key = DefaultCache.getKey(zone, rType);

    if (data) {
      const existing = this.cache.get(key) || [];
      const newRecords = existing.filter((d) => !_isEqual(d, data));
      if (newRecords.length === 0) {
        this.cache.delete(key);
      } else {
        this.cache.set(key, newRecords);
      }
    } else {
      this.cache.delete(key);
    }
  }

  get size() {
    return this.cache.size;
  }

  clear() {
    this.cache.clear();
  }

  handler: Handler = async (req, res, next) => {
    if (res.finished) {
      return next();
    }

    const { name, type } = req.packet.questions[0];
    const data = this.get(name, type);

    const answers: SupportedAnswer[] | undefined = data?.map(
      (d) =>
        ({
          name,
          type,
          data: d,
        }) as SupportedAnswer,
    );

    if (answers) {
      res.answer(answers);
    }

    next();
  };

  evictRandomMember() {
    const key = Array.from(this.cache.keys())[Math.floor(Math.random() * this.cache.size)];
    this.cache.delete(key);
  }

  static getKey(zone: string, rType: SupportedRecordType) {
    return `${zone}:${rType}`;
  }
}
