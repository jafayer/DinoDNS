import { DNSRecord } from '../types/dns';
import { DNSHandler } from '../server/Server';
import type { AnswerMap, ZoneData } from "../types/dnsLibTypes";

export abstract class ZoneStore {
  /**
   * Retrieve information about a zone in the database.
   * @param zone The name of the zone to retrieve
   * @param rType The record type to retrieve. If not provided, all records in the zone should be retrieved.
   */
  abstract get<T extends keyof ZoneData>(zone: string, rType?: T): Promise<ZoneData[T] | ZoneData[T][] | null>;

  /**
   * Set or update information about a zone in the database.
   * @param zone The name of the zone to set
   * @param rType The record type to set
   * @param data The data to set
   */
  abstract set<T extends keyof ZoneData>(zone: string, rType: T, data: ZoneData[T][]): Promise<void>;

  /**
   * Append information about a zone in the database.
   * @param zone The name of the zone to append
   * @param rType The record type to append
   * @param data The data to append
   */
  abstract append<T extends keyof ZoneData>(zone: string, rType: T, data: ZoneData[T]): Promise<void>;

  /**
   *
   * @param zone the zone to delete
   * @param rType the record type to delete. If not provided, all records in the zone should be deleted.
   * @param data the data to delete. If not provided, all records of the given type should be deleted.
   */
  abstract delete<T extends keyof ZoneData>(zone: string, rType?: T, rData?: ZoneData[T]): Promise<void>;

  
  /**
   * Request handler for the store
   */
  abstract handler: DNSHandler;
}
