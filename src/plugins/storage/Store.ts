import { Handler } from '../../common/server';
import { ZoneData, SupportedRecordType } from '../../types/dns';
import { EventEmitter } from 'events';
import { Awaitable } from '../../common/core/utils';

export abstract class Store extends EventEmitter {
  /**
   * Retrieve information about a zone in the database.
   * @param zone The name of the zone to retrieve
   * @param rType The record type to retrieve. If not provided, all records in the zone should be retrieved.
   */
  abstract get<T extends SupportedRecordType>(
    zone: string,
    rType?: T,
  ): Awaitable<ZoneData[T][] | ZoneData[keyof ZoneData][] | null>;

  /**
   * Set or update information about a zone in the database.
   * @param zone The name of the zone to set
   * @param rType The record type to set
   * @param data The data to set
   */
  abstract set<T extends SupportedRecordType>(
    zone: string,
    rType: T,
    data: ZoneData[T] | ZoneData[T][],
  ): Awaitable<void>;

  /**
   * Append information about a zone in the database.
   * @param zone The name of the zone to append
   * @param rType The record type to append
   * @param data The data to append
   */
  abstract append<T extends SupportedRecordType>(zone: string, rType: T, data: ZoneData[T]): Awaitable<void>;

  /**
   *
   * @param zone the zone to delete
   * @param rType the record type to delete. If not provided, all records in the zone should be deleted.
   * @param data the data to delete. If not provided, all records of the given type should be deleted.
   */
  abstract delete<T extends SupportedRecordType>(zone: string, rType?: T, rData?: ZoneData[T]): Awaitable<void>;

  abstract handler: Handler;
}
