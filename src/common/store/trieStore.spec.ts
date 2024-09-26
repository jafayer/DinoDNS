import { AnswerTrie, TrieStore } from './trieStore';
import { DNSRequest } from '../../server';
import { Answer, Packet } from 'dns-packet';
import { Connection } from '../network';

const records: Answer[] = [
  {
    name: 'example.com',
    type: 'A',
    class: 'IN',
    ttl: 300,
    data: '127.0.0.1',
  },
  {
    name: 'example.com',
    type: 'A',
    class: 'IN',
    ttl: 300,
    data: '127.0.0.2',
  },
];

describe('AnswerTrie', () => {
  let trie: AnswerTrie;

  beforeEach(() => {
    trie = new AnswerTrie();
  });

  it('should add and get data', () => {
    trie.add('example.com', 'A', [records[0]]);
    expect(trie.get('example.com', 'A')).toEqual([records[0]]);
  });

  it('should be able to get data of a specific type', () => {
    const mx: Answer[] = [
      {
        name: 'example.com',
        type: 'MX',
        class: 'IN',
        ttl: 300,
        data: {
          preference: 10,
          exchange: 'mail.example.com',
        },
      },
    ];
    trie.add('example.com', 'A', records);
    trie.add('example.com', 'MX', mx);
    expect(trie.get('example.com', 'A')).toEqual(records);
    expect(trie.get('example.com', 'MX')).toEqual(mx);
  });

  it('should add and get data with multiple records', () => {
    trie.add('example.com', 'A', records);
    expect(trie.get('example.com', 'A')).toEqual(records);
  });

  it('should append data', () => {
    trie.add('example.com', 'A', [records[0]]);
    trie.append('example.com', 'A', records[1]);
    expect(trie.get('example.com', 'A')).toEqual(records);
  });

  it('should delete data', () => {
    trie.add('example.com', 'A', records);
    trie.delete('example.com', 'A', records[0]);
    expect(trie.get('example.com', 'A')).toEqual([records[1]]);
  });

  it('should delete all data of a zone', () => {
    trie.add('example.com', 'A', records);
    trie.delete('example.com');
    expect(trie.get('example.com', 'A')).toBeNull();
  });

  it('should delete all data of a zone and type', () => {
    trie.add('example.com', 'A', records);
    trie.delete('example.com', 'A');
    expect(trie.get('example.com', 'A')).toBeNull();
  });

  it('should be able to override data with a set call', () => {
    trie.add('example.com', 'A', records);
    trie.add('example.com', 'A', [records[0]]);
    expect(trie.get('example.com', 'A')).toEqual([records[0]]);
  });

  it('Should be able to resolve wildcard queries', () => {
    trie.add('*.example.com', 'A', records);
    const subRecords = records.map((record) => {
      return {
        ...record,
        name: 'sub.example.com',
      };
    });
    expect(trie.get('sub.example.com', 'A')).toEqual(subRecords);
  });

  it('Should be able to resolve wildcard queries with multiple labels', () => {
    trie.add('*.example.com', 'A', records);
    const subRecords = records.map((record) => {
      return {
        ...record,
        name: 'sub.sub.example.com',
      };
    });
    expect(trie.get('sub.sub.example.com', 'A')).toEqual(subRecords);
  });

  it('Should be able to resolve the domain name from the trie', () => {
    trie.add('example.com', 'A', records);
    expect(trie.resolve('example.com')).toEqual('example.com');

    trie.add('*.example.com', 'A', records);
    expect(trie.resolve('sub.example.com')).toEqual('*.example.com');
    expect(trie.resolve('sub.sub.example.com')).toEqual('*.example.com');

    trie.add('*.sub.example.com', 'A', records);
    expect(trie.resolve('sub.example.com')).toEqual('*.example.com');
  });

  it('Should be able to deserialie and serialize the trie', () => {
    trie.add('example.com', 'A', records);
    trie.add('*.example.com', 'A', records);
    trie.add('*.sub.example.com', 'A', records);

    const serialized = trie.toString();
    const deserialized = AnswerTrie.fromString(serialized);

    const subRecords = records.map((record) => {
      return {
        ...record,
        name: 'foo.example.com',
      };
    });

    const subSubRecords = records.map((record) => {
      return {
        ...record,
        name: 'foo.bar.example.com',
      };
    });

    expect(deserialized.get('example.com', 'A')).toEqual(records);
    expect(deserialized.get('foo.example.com', 'A')).toEqual(subRecords);
    expect(deserialized.get('foo.bar.example.com', 'A')).toEqual(subSubRecords);
  });

  // THIS TEST IS DEPRECATED FOR NOW
  // We've commented out the explicit cacheRequest behavior in the TriesStore class for now, but
  // it probably will come back at some point

  // it('Should emit a cacheRequest event whenever it successfully resolves a request', (done) => {
  //   const store = new TrieStore();
  //   store.set('example.com', 'A', records);

  //   // jest should listen for the cacheRequest event
  //   const listener = jest.fn();
  //   store.on('cacheRequest', listener);

  //   store.on('cacheRequest', (req) => {
  //     expect(req.zoneName).toEqual('example.com');
  //     done();
  //   });

  //   const req = new DNSRequest(
  //     {
  //       questions: [
  //         {
  //           name: 'example.com',
  //           type: 'A',
  //           class: 'IN',
  //         },
  //       ],
  //     } as Packet,
  //     {} as Connection,
  //   );

  //   const res = req.toAnswer();

  //   store.handler(req, res, () => {});
  // });
});
