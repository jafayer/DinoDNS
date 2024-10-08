import { Handler } from '../../common/server';
import { ZoneData, SupportedRecordType } from '../../types/dns';

export abstract class Store {
  /**
   * Retrieve information about a zone in the database.
   * @param zone The name of the zone to retrieve
   * @param rType The record type to retrieve. If not provided, all records in the zone should be retrieved.
   */
  abstract get(zone: string, rType?: SupportedRecordType): Promise<ZoneData[keyof ZoneData] | ZoneData[keyof ZoneData][] | null>;

  /**
   * Set or update information about a zone in the database.
   * @param zone The name of the zone to set
   * @param rType The record type to set
   * @param data The data to set
   */
  abstract set(zone: string, rType: SupportedRecordType, data: ZoneData[keyof ZoneData] | ZoneData[keyof ZoneData][]): Promise<void>;

  /**
   * Append information about a zone in the database.
   * @param zone The name of the zone to append
   * @param rType The record type to append
   * @param data The data to append
   */
  abstract append(zone: string, rType: SupportedRecordType, data: ZoneData[keyof ZoneData]): Promise<void>;

  /**
   *
   * @param zone the zone to delete
   * @param rType the record type to delete. If not provided, all records in the zone should be deleted.
   * @param data the data to delete. If not provided, all records of the given type should be deleted.
   */
  abstract delete(zone: string, rType?: SupportedRecordType, rData?: ZoneData[keyof ZoneData]): Promise<void>;

  abstract handler: Handler;
}
