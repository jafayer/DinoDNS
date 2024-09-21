import { Handler } from '../../server';
import { Answer } from 'dns-packet';

export abstract class Store {
  /**
   * Retrieve information about a zone in the database.
   * @param zone The name of the zone to retrieve
   * @param rType The record type to retrieve. If not provided, all records in the zone should be retrieved.
   */
  abstract get(zone: string, rType?: string): Promise<Answer | Answer[] | null>;

  /**
   * Set or update information about a zone in the database.
   * @param zone The name of the zone to set
   * @param rType The record type to set
   * @param data The data to set
   */
  abstract set(zone: string, rType: string, data: Answer | Answer[]): Promise<void>;

  /**
   * Append information about a zone in the database.
   * @param zone The name of the zone to append
   * @param rType The record type to append
   * @param data The data to append
   */
  abstract append(zone: string, rType: string, data: Answer): Promise<void>;

  /**
   *
   * @param zone the zone to delete
   * @param rType the record type to delete. If not provided, all records in the zone should be deleted.
   * @param data the data to delete. If not provided, all records of the given type should be deleted.
   */
  abstract delete(zone: string, rType?: string, rData?: Answer): Promise<void>;

  abstract handler: Handler;
}
