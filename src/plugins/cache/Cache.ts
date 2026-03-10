import { Handler } from '../../types/server';
import { SupportedRecordType, SupportedAnswer } from '../../types/dns';
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
   * @param rType the record type to get.
   */
  abstract get(zone: string, rType: SupportedRecordType): Awaitable<SupportedAnswer[] | null>;

  /**
   * Set or update information about a zone in the cache.
   *
   * @param zone the zone to set
   * @param rType the record type to set
   * @param data the answer or answers to set
   */
  abstract set(zone: string, rType: SupportedRecordType, data: SupportedAnswer | SupportedAnswer[]): Awaitable<void>;

  /**
   * Append information about a zone in the cache.
   *
   * @param zone the zone to append
   * @param rType the record type to append
   * @param data the answer to append
   */
  abstract append(zone: string, rType: SupportedRecordType, data: SupportedAnswer): Awaitable<void>;

  /**
   * Delete information about a zone in the cache.
   *
   * @param zone the zone to delete
   * @param rType the record type to delete. If not provided, all records in the zone should be deleted.
   * @param data the answer to delete. If not provided, all records of the given type should be deleted.
   */
  abstract delete(zone: string, rType: SupportedRecordType, data?: SupportedAnswer): Awaitable<void>;

  /**
   * Clear the cache.
   */
  abstract clear(): Awaitable<void>;

  abstract handler: Handler;
}
