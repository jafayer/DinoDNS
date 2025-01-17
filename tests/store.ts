import { Store } from '../src/plugins/storage';
import { ZoneData, ZoneDataMap } from '../src/types';

export const DefaultStoreTestSuite = <T extends Store>(StoreClass: new () => T) => {
  let store: T;
  const ARecords: ZoneData['A'][] = ['127.0.0.1', '127.0.0.2'];
  const ARecordMap: Partial<ZoneDataMap> = { A: ARecords };
  const AAAARecords: ZoneData['AAAA'][] = ['::1', '::2'];
  const AAAARecordMap: Partial<ZoneDataMap> = { AAAA: AAAARecords };

  beforeEach(() => {
    store = new StoreClass();
  });

  describe('create', () => {
    it('should be able to create a new store', () => {
      const newStore = new StoreClass();
      expect(newStore).toBeInstanceOf(StoreClass);
    });
  });


  describe('get', () => {
    it('should be able to get data from an exact match', async () => {
      store.set('example.com', 'A', ARecords);
      store.set('example.com', 'AAAA', AAAARecords);

      expect(store.get('example.com', 'A')).toEqual(ARecordMap);
      expect(store.get('example.com', 'AAAA')).toEqual(AAAARecordMap);

      expect(store.get('example.com')).toEqual({...ARecordMap, ...AAAARecordMap});
    });

    it('should be able to get data from a wildcard match', async () => {
      store.set('*.example.com', 'A', ARecords);
      store.set('*.example.com', 'AAAA', AAAARecords);

      expect(store.get('test.example.com', 'A')).toEqual(ARecordMap);
      expect(store.get('test.example.com', 'AAAA')).toEqual(AAAARecordMap);

      expect(store.get('test.example.com')).toEqual({...ARecordMap, ...AAAARecordMap});
    });

    it('should be able to get a wildcard record with specific rType when the data does not exist', async () => {
      store.set('*.com', 'A', ARecords);

      expect(store.get('example.com', 'AAAA')).toEqual(null);
    });

    it('should be able to get data from a top-level wildcard', async () => {
      store.set('*', 'A', ARecords);
      store.set('*', 'AAAA', AAAARecords);

      expect(store.get('example.com', 'A')).toEqual(ARecordMap);
      expect(store.get('example.com', 'AAAA')).toEqual(AAAARecordMap);

      expect(store.get('example.com')).toEqual({...ARecordMap, ...AAAARecordMap});
    })
  });


  describe('set', () => {
    it('should be able to set a single record', async () => {
      store.set('example.com', 'A', ARecords[0]);

      expect(store.get('example.com', 'A')).toEqual({A: [ARecords[0]]});
    });

    it('should be able to set an array of records', async () => {
      store.set('example.com', 'A', ARecords);

      expect(store.get('example.com', 'A')).toEqual(ARecordMap);
    });
  });

  describe('append', () => {
    it('should be able to append a single record', async () => {
      store.set('example.com', 'A', ARecords[0]);
      store.append('example.com', 'A', ARecords[1]);

      expect(store.get('example.com', 'A')).toEqual(ARecordMap);
    });

    it('should be able to append an array of records', async () => {
      store.set('example.com', 'A', ARecords[0]);
      store.append('example.com', 'A', ARecords[1]);

      expect(store.get('example.com', 'A')).toEqual(ARecordMap);
    });

    it('should be able to append to an empty record', async () => {
      store.append('example.com', 'A', ARecords[0]);

      expect(store.get('example.com', 'A')).toEqual({A: [ARecords[0]]});
    });
  });

  describe('delete', () => {
    it('should be able to delete all data from the correct key', async () => {
      store.set('example.com', 'A', ARecords);
      store.delete('example.com');

      expect(store.get('example.com')).toEqual(null);
    });

    it('should be able to delete a single record from the correct key', async () => {
      store.set('example.com', 'A', ARecords);
      store.delete('example.com', 'A', ARecords[0]);

      expect(store.get('example.com', 'A')).toEqual({A: [ARecords[1]]});
    });

    it('should be able to delete a whole record', async () => {
      store.set('example.com', 'A', ARecords);
      store.delete('example.com');

      expect(store.get('example.com', 'A')).toEqual(null);
      expect(store.get('example.com')).toEqual(null);
    });

    it('should leave other records untouched', async () => {
      store.set('example.com', 'A', ARecords);
      store.set('example.com', 'AAAA', AAAARecords);
      store.delete('example.com', 'A', ARecords[0]);

      expect(store.get('example.com', 'A')).toEqual({A: [ARecords[1]]});
      expect(store.get('example.com', 'AAAA')).toEqual(AAAARecordMap);
    });

    it('should leave other record types untouched', async () => {
      store.set('example.com', 'A', ARecords);
      store.set('example.com', 'AAAA', AAAARecords);
      store.delete('example.com', 'A');

      expect(store.get('example.com', 'A')).toEqual(null);
      expect(store.get('example.com', 'AAAA')).toEqual(AAAARecordMap);
    });

    it('should be able to delete a specific record where its record type does not', async () => {
      store.set('example.com', 'A', ARecords);
      store.delete('example.com', 'AAAA', '::1');

      expect(store.get('example.com', 'A')).toEqual(ARecordMap);
      expect(store.get('example.com', 'AAAA')).toEqual(null);
    });

    it('should be able to delete a specific record when no records exist', async () => {
      store.delete('example.com', 'A', ARecords[0]);
      expect(store.get('example.com', 'A')).toEqual(null);
    });

    it('should clean up the key if no records are left', async () => {
      store.set('example.com', 'A', ARecords);
      store.delete('example.com', 'A', ARecords[0]);
      expect(store.get('example.com', 'A')).toEqual({A: [ARecords[1]]});
      store.delete('example.com', 'A', ARecords[1]);

      expect(store.get('example.com')).toEqual(null);
    });
  });
};
