import { Cache } from '../Cache';
import { Handler } from '../../../types/server';
import { ZoneData, SupportedRecordType, SupportedAnswer } from '../../../types/dns';
import { isEqual as _isEqual } from 'lodash';

export type DefaultCacheOptions = {
  /** The maximum number of entries to store in the cache. */
  maxEntries?: number;
};

/**
 * A simple in-memory cache that stores data in a Map.
 *
 * The default cache is a simple map that stores domain/record type pairs as keys and
 * the corresponding data as values.
 *
 * The cache makes no attempt to implement an LRU eviction policy, as these can be
 * computationally expensive to manage and may not necessarily provide a significant benefit
 * over a simple random eviction policy. Domains that are queried often will naturally get
 * inserted into the cache quickly after being evicted.
 */
export class DefaultCache extends Cache {
  /** The internal cache data structure */
  cache: Map<string, ZoneData[keyof ZoneData][]> = new Map();

  /** The maximum number of entries the cache should accept before discarding an entry. */
  maxEntries: number | undefined;

  constructor(options?: DefaultCacheOptions) {
    super();
    this.maxEntries = options?.maxEntries;

    this.handler = this.handler.bind(this);
  }

  /**
   * Get information about a zone/record type pair in the cache.
   *
   * @param zone The zone to get data for
   * @param rType The record type to get data for.
   * @returns The data for the given zone and record type, or null if no data is found.
   */
  get<T extends SupportedRecordType>(zone: string, rType: T): ZoneData[T][] | ZoneData[keyof ZoneData][] | null {
    const key = DefaultCache.getKey(zone, rType);
    return this.cache.get(key) || null;
  }

  /**
   * Set or update information about a zone in the cache.
   *
   * @param zone The zone to set
   * @param rType The record type to set
   * @param data The data to set
   */
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

  /**
   * Append information about a zone in the cache.
   *
   * @param zone The zone to append
   * @param rType The record type to append
   * @param data The data to append
   */
  append(zone: string, rType: SupportedRecordType, data: ZoneData[SupportedRecordType]) {
    if (this.maxEntries === 0) return;

    const key = DefaultCache.getKey(zone, rType);
    const existing = this.cache.get(key) || [];
    this.cache.set(key, [...existing, data]);

    if (this.maxEntries && this.cache.size > this.maxEntries) {
      this.evictRandomMember();
    }
  }

  /**
   * Delete information about a zone in the cache.
   *
   * @param zone The zone to delete
   * @param rType The record type to delete
   * @param data The data to delete
   */
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

  /**
   * Get the current size of the cache.
   *
   * Note that this refers to the number of unique zone/record type pairs in the cache,
   * not the total number of records stored, as each zone/record type pair can store
   * one or more records.
   *
   * @returns The number of unique zone/record type pairs in the cache.
   */
  get size() {
    return this.cache.size;
  }

  /**
   * Clear the cache.
   */
  clear() {
    this.cache.clear();
  }

  /**
   * The cache handler function that is used to answer queries.
   */
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

  /**
   * Evict a random member from the cache.
   */
  evictRandomMember() {
    const key = Array.from(this.cache.keys())[Math.floor(Math.random() * this.cache.size)];
    this.cache.delete(key);
  }

  /**
   * Get the key for a given zone and record type.
   *
   * The default key format is `zone:rType`.
   *
   * @param zone The zone to get the key for
   * @param rType The record type to get the key for
   * @returns
   */
  static getKey(zone: string, rType: SupportedRecordType) {
    return `${zone}:${rType}`;
  }
}
