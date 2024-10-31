import { DefaultStore } from '.';
import { ZoneData } from '../../../types/dns';

describe('MapStore', () => {
  let store: DefaultStore;
  const ARecords: ZoneData['A'][] = ['127.0.0.1', '127.0.0.2'];
  const AAAARecords: ZoneData['AAAA'][] = ['::1', '::2'];

  beforeEach(() => {
    store = new DefaultStore();
  });

  describe('create', () => {
    it('should be able to create a new store', () => {
      const newStore = new DefaultStore();
      expect(newStore).toBeInstanceOf(DefaultStore);
    });
  });

  describe('get', () => {
    it('should be able to get data from an exact match', async () => {
      store.set('example.com', 'A', ARecords);
      store.set('example.com', 'AAAA', AAAARecords);

      expect(store.get('example.com', 'A')).toEqual(ARecords);
      expect(store.get('example.com', 'AAAA')).toEqual(AAAARecords);

      expect(store.get('example.com')).toEqual([...ARecords, ...AAAARecords]);
    });

    it('should not return data if wildcards are disabled', async () => {
      store.set('*.example.com', 'A', ARecords);

      expect(store.get('example.com', 'A', false)).toEqual(null);
    });

    it('should be able to get data from a wildcard match', async () => {
      store.set('*.example.com', 'A', ARecords);
      store.set('*.example.com', 'AAAA', AAAARecords);

      expect(store.get('test.example.com', 'A')).toEqual(ARecords);
      expect(store.get('test.example.com', 'AAAA')).toEqual(AAAARecords);

      expect(store.get('test.example.com')).toEqual([...ARecords, ...AAAARecords]);
    });

    it('should be able to get a wildcard record with specific rType when the data does not exist', async () => {
      store.set('*.com', 'A', ARecords);

      expect(store.get('example.com', 'AAAA')).toEqual(null);
    });
  });

  describe('set', () => {
    it('should be able to set a single record', async () => {
      store.set('example.com', 'A', ARecords[0]);

      expect(store.get('example.com', 'A')).toEqual([ARecords[0]]);
    });

    it('should be able to set an array of records', async () => {
      store.set('example.com', 'A', ARecords);

      expect(store.get('example.com', 'A')).toEqual(ARecords);
    });
  });

  describe('append', () => {
    it('should be able to append a single record', async () => {
      store.set('example.com', 'A', ARecords[0]);
      store.append('example.com', 'A', ARecords[1]);

      expect(store.get('example.com', 'A')).toEqual(ARecords);
    });

    it('should be able to append an array of records', async () => {
      store.set('example.com', 'A', ARecords[0]);
      store.append('example.com', 'A', ARecords[1]);

      expect(store.get('example.com', 'A')).toEqual(ARecords);
    });

    it('should be able to append to an empty record', async () => {
      store.append('example.com', 'A', ARecords[0]);

      expect(store.get('example.com', 'A')).toEqual([ARecords[0]]);
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

      expect(store.get('example.com', 'A')).toEqual([ARecords[1]]);
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

      expect(store.get('example.com', 'A')).toEqual([ARecords[1]]);
      expect(store.get('example.com', 'AAAA')).toEqual(AAAARecords);
    });

    it('should leave other record types untouched', async () => {
      store.set('example.com', 'A', ARecords);
      store.set('example.com', 'AAAA', AAAARecords);
      store.delete('example.com', 'A');

      expect(store.get('example.com', 'A')).toEqual(null);
      expect(store.get('example.com', 'AAAA')).toEqual(AAAARecords);
    });

    it('should be able to delete a specific record where its record type does not', async () => {
      store.set('example.com', 'A', ARecords);
      store.delete('example.com', 'AAAA', '::1');

      expect(store.get('example.com', 'A')).toEqual(ARecords);
      expect(store.get('example.com', 'AAAA')).toEqual(null);
    });

    it('should be able to delete a specific record when no records exist', async () => {
      store.delete('example.com', 'A', ARecords[0]);
      expect(store.get('example.com', 'A')).toEqual(null);
    });

    it('should clean up the key if no records are left', async () => {
      store.set('example.com', 'A', ARecords);
      store.delete('example.com', 'A', ARecords[0]);
      expect(store.get('example.com', 'A')).toEqual([ARecords[1]]);
      store.delete('example.com', 'A', ARecords[1]);

      expect(store.get('example.com')).toEqual(null);
    });
  });

  describe('Cache request', () => {
    it('should be able to emit a cache request', (done) => {
      store.on('cacheRequest', () => {
        done();
      });

      store.emitCacheRequest('example.com', 'A', ARecords);
    });
  });

  describe('toString', () => {
    it('should be able to stringify the store', async () => {
      store.set('example.com', 'A', ARecords);
      store.set('example.com', 'AAAA', AAAARecords);

      expect(store.toString()).toEqual(
        JSON.stringify({
          'example.com': {
            A: ARecords,
            AAAA: AAAARecords,
          },
        }),
      );
    });

    it('should be able to stringify an empty store', () => {
      expect(store.toString()).toEqual(JSON.stringify({}));
    });

    it('should handle null values', async () => {
      store.set('example.com', 'A', ARecords);
      store.set('example.com', 'AAAA', AAAARecords);

      store.delete('example.com', 'A');

      expect(store.toString()).toEqual(
        JSON.stringify({
          'example.com': {
            AAAA: AAAARecords,
          },
        }),
      );
    });
  });

  describe('fromString', () => {
    it('should be able to create a store from a string', () => {
      const str = JSON.stringify({
        'example.com': {
          A: ARecords,
          AAAA: AAAARecords,
        },
      });

      const newStore = DefaultStore.fromString(str);
      expect(newStore).toBeInstanceOf(DefaultStore);
      expect(newStore.toString()).toEqual(str);
    });

    it('should be able to create an empty store from a string', () => {
      const str = JSON.stringify({});

      const newStore = DefaultStore.fromString(str);
      expect(newStore).toBeInstanceOf(DefaultStore);
      expect(newStore.toString()).toEqual(str);
    });
  });
});
