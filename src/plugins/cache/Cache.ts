import { Handler } from '../../types/server';
import { ZoneData, SupportedRecordType } from '../../types/dns';
import { Awaitable } from '../../common/core/utils';

/**
 * A cache is a database that stores information about zones.
 * 
 * Caches differ from stores in that they are designed to be relatively ephemeral, and 
 * they do not make attempts to resolve wildcard records. All cache lookups should be
 * O(1) operations and should be as fast as possible.
 */
export abstract class Cache {
  /**
   * Get information about a zone in the cache.
   *
   * @param zone the zone to get
   * @param rType the record type to get. If not provided, all records in the zone should be retrieved.
   */
  abstract get<T extends SupportedRecordType>(
    zone: string,
    rType: T,
  ): Awaitable<ZoneData[T][] | ZoneData[keyof ZoneData][] | null>;

  /**
   * Set or update information about a zone in the cache.
   *
   * @param zone the zone to set
   * @param rType the record type to set
   * @param data the data to set
   */
  abstract set<T extends SupportedRecordType>(
    zone: string,
    rType: T,
    data: ZoneData[T] | ZoneData[T][],
  ): Awaitable<void>;

  /**
   * Append information about a zone in the cache.
   *
   * @param zone the zone to append
   * @param rType the record type to append
   * @param data the data to append
   */
  abstract append<T extends SupportedRecordType>(zone: string, rType: T, data: ZoneData[T]): Awaitable<void>;

  /**
   * Delete information about a zone in the cache.
   *
   * @param zone the zone to delete
   * @param rType the record type to delete. If not provided, all records in the zone should be deleted.
   * @param data the data to delete. If not provided, all records of the given type should be deleted.
   */
  abstract delete<T extends SupportedRecordType>(zone: string, rType: T, data?: ZoneData[T]): Awaitable<void>;

  /**
   * Clear the cache.
   */
  abstract clear(): Awaitable<void>;

  abstract handler: Handler;
}
