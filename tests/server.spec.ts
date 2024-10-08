import { DefaultServer } from '../src/common/server';
import { DNSOverTCP, DNSOverUDP } from '../src/common/network';
import { DefaultStore } from '../src/plugins/storage';
import dns from 'node:dns';

describe('server', () => {
  it('Should throw an error when it tries to respond twice to the same request', async () => {
    const server = new DefaultServer({
      networks: [new DNSOverTCP('localhost', 8053), new DNSOverUDP('localhost', 8053)],
      defaultHandler: (req, res) => {
        res.errors.nxDomain();
      },
    });

    const store = new DefaultStore();
    store.set('example.com', 'A', '127.0.0.1');

    store.set('example.com', 'MX', { exchange: 'mail.example.com', preference: 10 });

    server.use(store.handler);

    server.handle('example.com', (req, res) => {
      res.packet.answers = [
        ...res.packet.answers,
        {
          type: 'SOA',
          name: 'example.net',
          data: {
            mname: 'ns1.example.com',
            rname: 'admin.example.com',
            serial: 2021101001,
            refresh: 3600,
            retry: 600,
            expire: 604800,
            minimum: 60,
          },
        },
      ];
      res.packet.answers = [
        ...res.packet.answers,
        {
          type: 'A',
          name: 'example.net',
          data: '127.0.0.1',
        },
      ];
      res.resolve();
    });

    server.handle('example.com', (req, res) => {
      res.answer({
        name: 'example.com',
        type: 'A',
        class: 'IN',
        ttl: 300,
        data: '127.0.0.2',
      });
    });

    server.start(() => {
      console.log('Server started');
    });

    // query localhost:8053 for example.com
    const resolver = new dns.promises.Resolver();

    resolver.setServers(['127.0.0.1:8053']);

    const result = await resolver.resolve('example.com');

    expect(result).toEqual(['127.0.0.1']);
  });
});
