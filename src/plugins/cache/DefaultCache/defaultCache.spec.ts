import { DefaultCache } from './index';
import { SupportedAnswer, SupportedRecordType } from '../../../types/dns';

describe('DefaultCache', () => {
  let cache: DefaultCache;

  beforeEach(() => {
    cache = new DefaultCache();
  });

  describe('set', () => {
    it('should set a single record', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answer: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.1' };

      cache.set(zone, rType, answer);

      const result = cache.get(zone, rType);
      expect(result).toEqual([answer]);
    });

    it('should set multiple records', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answers: SupportedAnswer[] = [
        { name: zone, type: rType, data: '127.0.0.1' },
        { name: zone, type: rType, data: '127.0.0.2' },
      ];

      cache.set(zone, rType, answers);

      const result = cache.get(zone, rType);
      expect(result).toEqual(answers);
    });

    it('should evict a random member when the cache is full', () => {
      cache = new DefaultCache({ maxEntries: 3 });
      const rType: SupportedRecordType = 'A';
      const domains = Array.from({ length: 10 }, (_, i) => `example${i}.com`);

      const pairs: [string, SupportedAnswer][] = domains.map((domain, i) => [
        domain,
        { name: domain, type: rType, data: `127.0.0.${i + 1}` },
      ]);

      pairs.forEach(([domain, answer]) => cache.set(domain, rType, answer));
      const results = pairs.map(([domain]) => cache.get(domain, rType));
      const filtered = results.filter(Boolean);
      expect(filtered.length).toBe(3);
      expect(cache.size).toBe(3);
    });

    it('should not set any records when cache size is 0', () => {
      cache = new DefaultCache({ maxEntries: 0 });

      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answer: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.1' };

      cache.set(zone, rType, answer);

      const result = cache.get(zone, rType);

      expect(result).toBe(null);

      expect(cache.size).toBe(0);
    });
  });

  describe('append', () => {
    it('should append a single record', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answer: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.1' };

      cache.append(zone, rType, answer);

      const result = cache.get(zone, rType);
      expect(result).toEqual([answer]);
    });

    it('should append multiple records', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answer1: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.1' };
      const answer2: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.2' };

      cache.append(zone, rType, answer1);
      cache.append(zone, rType, answer2);

      const result = cache.get(zone, rType);
      expect(result).toEqual([answer1, answer2]);
    });

    it('should append to an existing record', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answer1: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.1' };
      const answer2: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.2' };

      cache.set(zone, rType, answer1);
      cache.append(zone, rType, answer2);

      const result = cache.get(zone, rType);
      expect(result).toEqual([answer1, answer2]);
    });

    it('should append when the cache is full', () => {
      const domains = Array.from({ length: 4 }, (_, i) => `example${i}.com`);
      const rType: SupportedRecordType = 'A';
      const pairs: [string, SupportedAnswer][] = domains.map((domain, i) => [
        domain,
        { name: domain, type: rType, data: `127.0.0.${i + 1}` },
      ]);

      pairs.forEach(([domain, answer]) => {
        cache.append(domain, rType, answer);
        cache.append(domain, rType, answer);
      });

      const results = pairs.map(([domain]) => cache.get(domain, rType));
      const filtered = results.filter(Boolean);
      expect(filtered.length).toBe(4);

      expect(filtered[0]!.length).toBe(2);
      expect(cache.size).toBe(4);
    });

    it('should not append any records when cache size is 0', () => {
      cache = new DefaultCache({ maxEntries: 0 });

      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answer: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.1' };

      cache.append(zone, rType, answer);

      const result = cache.get(zone, rType);

      console.log(cache.cache);

      expect(result).toBe(null);

      expect(cache.size).toBe(0);
    });
  });

  describe('get', () => {
    it('Should get a single record', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answer: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.1' };

      cache.set(zone, rType, answer);

      const result = cache.get(zone, rType);
      expect(result).toEqual([answer]);
    });

    it('Should get multiple records', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answers: SupportedAnswer[] = [
        { name: zone, type: rType, data: '127.0.0.1' },
        { name: zone, type: rType, data: '127.0.0.2' },
      ];

      cache.set(zone, rType, answers);

      const result = cache.get(zone, rType);
      expect(result).toEqual(answers);
    });

    it('should return null when the zone does not exist', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';

      const result = cache.get(zone, rType);
      expect(result).toBe(null);
    });

    it('should return null when the record type does not exist', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answer: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.1' };

      cache.set(zone, rType, answer);

      expect(cache.get(zone, 'A')).toEqual([answer]);
      expect(cache.get(zone, 'AAAA')).toBe(null);
    });
  });

  describe('delete', () => {
    it('should delete a single record', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answer: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.1' };

      cache.set(zone, rType, answer);
      expect(cache.get(zone, rType)).toEqual([answer]);
      cache.delete(zone, rType, answer);

      const result = cache.get(zone, rType);
      expect(result).toBe(null);
    });

    it('should delete multiple records', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answers: SupportedAnswer[] = [
        { name: zone, type: rType, data: '127.0.0.1' },
        { name: zone, type: rType, data: '127.0.0.2' },
      ];

      cache.set(zone, rType, answers);
      expect(cache.get(zone, rType)).toEqual(answers);
      cache.delete(zone, rType);
      expect(cache.get(zone, rType)).toBe(null);
    });

    it('should delete a specific record', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answers: SupportedAnswer[] = [
        { name: zone, type: rType, data: '127.0.0.1' },
        { name: zone, type: rType, data: '127.0.0.2' },
      ];

      cache.set(zone, rType, answers);
      expect(cache.get(zone, rType)).toEqual(answers);
      cache.delete(zone, rType, answers[0]);
      expect(cache.get(zone, rType)).toEqual([answers[1]]);
    });

    it('should handle deleting a record that does not exist', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answer: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.1' };
      const otherAnswer: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.2' };

      cache.set(zone, rType, answer);
      expect(cache.get(zone, rType)).toEqual([answer]);
      cache.delete(zone, rType, otherAnswer);

      const result = cache.get(zone, rType);
      expect(result).toEqual([answer]);
    });

    it('should handle deleting a record from an empty zone', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';
      const answer: SupportedAnswer = { name: zone, type: rType, data: '127.0.0.1' };
      const otherAnswer: SupportedAnswer = { name: 'example2.com', type: rType, data: '127.0.0.2' };

      cache.set(zone, rType, answer);

      // don't throw an error deleting an empty zone
      expect(() => cache.delete('example2.com', rType, otherAnswer)).not.toThrow();

      expect(cache.get(zone, rType)).toEqual([answer]);
    });
  });

  describe('eviction', () => {
    it('should evict a random member', () => {
      cache = new DefaultCache({ maxEntries: 1 });

      const zones = ['example1.com', 'example2.com'];
      const rType: SupportedRecordType = 'A';
      const answers: SupportedAnswer[] = zones.map((zone, i) => ({
        name: zone,
        type: rType,
        data: `127.0.0.${i + 1}`,
      }));

      zones.forEach((zone, i) => cache.set(zone, rType, answers[i]));

      expect(cache.size).toBe(1);

      const results = zones.map((zone) => cache.get(zone, rType));

      expect(results.every(Boolean)).toBe(false);

      cache.evictRandomMember();

      expect(cache.size).toBe(0);
    });

    it('should evict until empty', () => {
      cache = new DefaultCache({ maxEntries: 100 });

      const zones = Array.from({ length: 100 }, (_, i) => `example${i}.com`);
      const rType: SupportedRecordType = 'A';
      const answers: SupportedAnswer[] = zones.map((zone, i) => ({
        name: zone,
        type: rType,
        data: `127.0.0.${i + 1}`,
      }));

      zones.forEach((zone, i) => cache.set(zone, rType, answers[i]));

      expect(cache.size).toBe(100);

      for (let i = 0; i < 100; i++) {
        cache.evictRandomMember();

        expect(cache.size).toBe(100 - i - 1);
      }
    });

    it('should not error when evicting from an empty cache', () => {
      cache = new DefaultCache({ maxEntries: 0 });

      expect(() => cache.evictRandomMember()).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear the cache', () => {
      cache = new DefaultCache({ maxEntries: 100 });
      const zones = Array.from({ length: 100 }, (_, i) => `example${i}.com`);
      const rType: SupportedRecordType = 'A';
      const answers: SupportedAnswer[] = zones.map((zone, i) => ({
        name: zone,
        type: rType,
        data: `127.0.0.${i + 1}`,
      }));

      zones.forEach((zone, i) => cache.set(zone, rType, answers[i]));

      expect(cache.size).toBe(100);

      cache.clear();

      expect(cache.size).toBe(0);
    });
  });

  describe('getKey', () => {
    it('should return the key for a zone and record type', () => {
      const zone = 'example.com';
      const rType: SupportedRecordType = 'A';

      expect(DefaultCache.getKey(zone, rType)).toBe('example.com:A');
    });
  });
});
