import {DefaultCache} from "./index";
import { ZoneData, SupportedAnswer, SupportedRecordType } from "../../../types/dns";

describe('DefaultCache', () => {
    let cache: DefaultCache;
    
    beforeEach(() => {
        cache = new DefaultCache();
    });
    
    describe('set', () => {
        it('should set a single record', () => {
            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'] = '127.0.0.1' ;
    
            cache.set(zone, rType, data);
    
            const result = cache.get(zone, rType);
            expect(result).toEqual([data]);
        });

        it('should set multiple records', () => {
            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'][] = ['127.0.0.1', '127.0.0.2'];
    
            cache.set(zone, rType, data);
    
            const result = cache.get(zone, rType);
            expect(result).toEqual(data);
        });

        it('should evict a random member when the cache is full', () => {
            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'][] = Array.from({ length: 10 }, (_, i) => `127.0.0.${i + 1}`);
            const domains = Array.from({ length: 10 }, (_, i) => `example${i}.com`);

            const pairs = domains.map((domain, i) => [domain, data[i]] as [string, ZoneData['A']]);

            pairs.forEach(([domain, record]) => cache.set(domain, rType, record));
            const results = pairs.map(([domain, _]) => cache.get(domain, rType));
            const filtered = results.filter(Boolean);
            expect(filtered.length).toBe(3);
            expect(cache.size).toBe(3);
        });

        it('should not set any records when cache size is 0', () => {
            cache = new DefaultCache({ maxEntries: 0 });

            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'] = '127.0.0.1';

            cache.set(zone, rType, data);

            const result = cache.get(zone, rType);

            expect(result).toBe(null);

            expect(cache.size).toBe(0);
        });
    });

    describe('append', () => {
        it('should append a single record', () => {
            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'] = '127.0.0.1';
    
            cache.append(zone, rType, data);
    
            const result = cache.get(zone, rType);
            expect(result).toEqual([data]);
        });

        it('should append multiple records', () => {
            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data1: ZoneData['A'] = '127.0.0.1';
            const data2: ZoneData['A'] = '127.0.0.2';
    
            cache.append(zone, rType, data1);
            cache.append(zone, rType, data2);
    
            const result = cache.get(zone, rType);
            expect(result).toEqual([data1, data2]);
        });

        it('should append to an existing record', () => {
            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data1: ZoneData['A'] = '127.0.0.1';
            const data2: ZoneData['A'] = '127.0.0.2';
    
            cache.set(zone, rType, data1);
            cache.append(zone, rType, data2);
    
            const result = cache.get(zone, rType);
            expect(result).toEqual([data1, data2]);
        });

        it('should append when the cache is full', () => {
            const domains = Array.from({ length: 4 }, (_, i) => `example${i}.com`);
            const data: ZoneData['A'][] = Array.from({ length: 4 }, (_, i) => `127.0.0.${i + 1}`);
            const rType: SupportedRecordType = 'A';
            const pairs = domains.map((domain, i) => [domain, data[i]] as [string, ZoneData['A']]);

            pairs.forEach(([domain, record]) => {
                cache.append(domain, rType, record);
                cache.append(domain, rType, record);
            });

            const results = pairs.map(([domain, _]) => cache.get(domain, rType));
            const filtered = results.filter(Boolean);
            expect(filtered.length).toBe(3);

            expect(filtered[0]!.length).toBe(2);
            expect(cache.size).toBe(3);
        });

        it('should not append any records when cache size is 0', () => {
            cache = new DefaultCache({ maxEntries: 0 });

            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'] = '127.0.0.1';

            cache.append(zone, rType, data);

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
            const data: ZoneData['A'] = '127.0.0.1';

            cache.set(zone, rType, data);

            const result = cache.get(zone, rType);
            expect(result).toEqual([data]);
        });

        it('Should get multiple records', () => {
            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'][] = ['127.0.0.1', '127.0.0.2'];

            cache.set(zone, rType, data);

            const result = cache.get(zone, rType);
            expect(result).toEqual(data);
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

            cache.set(zone, rType, '127.0.0.1');

            expect(cache.get(zone, 'A')).toEqual(['127.0.0.1']);
            expect(cache.get(zone, 'AAAA')).toBe(null);
        });
    });

    describe('delete', () => {
        it('should delete a single record', () => {
            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'] = '127.0.0.1';

            cache.set(zone, rType, data);
            expect(cache.get(zone, rType)).toEqual([data]);
            cache.delete(zone, rType, data);

            const result = cache.get(zone, rType);
            expect(result).toBe(null);
        });

        it('should delete multiple records', () => {
            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'][] = ['127.0.0.1', '127.0.0.2'];

            cache.set(zone, rType, data);
            expect(cache.get(zone, rType)).toEqual(data);
            cache.delete(zone, rType);
            expect(cache.get(zone, rType)).toBe(null);
        });

        it('should delete a specific record', () => {
            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'][] = ['127.0.0.1', '127.0.0.2'];

            cache.set(zone, rType, data);
            expect(cache.get(zone, rType)).toEqual(data);
            cache.delete(zone, rType, data[0]);
            expect(cache.get(zone, rType)).toEqual([data[1]]);
        });

        it('should handle deleting a record that does not exist', () => {
            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'] = '127.0.0.1'; 

            cache.set(zone, rType, data);
            expect(cache.get(zone, rType)).toEqual([data]);
            cache.delete(zone, rType, '127.0.0.2');

            const result = cache.get(zone, rType);
            expect(result).toEqual([data]);
        });

        it('should handle deleting a record from an empty zone', () => {
            const zone = 'example.com';
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'] = '127.0.0.1';

            cache.set(zone, rType, data);
            
            // don't throw an error deleting an empty zone
            expect(() => cache.delete('example2.com', rType, '127.0.0.2')).not.toThrow();
            
            expect(cache.get(zone, rType)).toEqual([data]);
        });

    });

    describe('eviction', () => {
        it('should evict a random member', () => {
            cache = new DefaultCache({ maxEntries: 1 });

            const zones = ['example1.com', 'example2.com'];
            const rType: SupportedRecordType = 'A';
            const data: ZoneData['A'][] = ['127.0.0.1', '127.0.0.2'];

            zones.forEach((zone, i) => cache.set(zone, rType, data[i]));

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
            const data: ZoneData['A'][] = Array.from({ length: 100 }, (_, i) => `127.0.0.${i + 1}`);

            zones.forEach((zone, i) => cache.set(zone, rType, data[i]));

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
            const data: ZoneData['A'][] = Array.from({ length: 100 }, (_, i) => `127.0.0.${i + 1}`);

            zones.forEach((zone, i) => cache.set(zone, rType, data[i]));

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