import { DefaultServer } from '../src/common/server';
import { DNSOverTCP, DNSOverUDP, SupportedNetworkType } from '../src/common/network';
import { DefaultStore } from '../src/plugins/storage';
import { PacketWrapper, DNSRequest } from '../src/types';
import { DuplicateAnswerForRequest } from '../src/types';
import dns from 'node:dns';

describe('server', () => {
  it('Should log an error when it tries to respond twice to the same request', async () => {

    jest.spyOn(console, 'error').mockImplementation(() => {});

    const tcp = new DNSOverTCP({ address: 'localhost', port: 8053 });
    const udp = new DNSOverUDP({ address: 'localhost', port: 8053 });
    const server = new DefaultServer({
      networks: [tcp, udp],
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

    // mock a DNS request
    const request = new DNSRequest(
      {
        id: 0,
        questions: [
          {
            name: 'example.com',
            type: 'A',
            class: 'IN',
          },
        ],
        answers: [],
        additionals: [],
        authorities: [],
      },
      {
        remoteAddress: '127.0.0.1',
        remotePort: 0,
        type: SupportedNetworkType.TCP,
      },
    );
    const result = await tcp.handler!(request);
    const records = result.packet.answers.map((answer) => answer.data);

    expect(records).toEqual(['127.0.0.1']);
    expect(console.error).toHaveBeenCalledWith(expect.any(DuplicateAnswerForRequest));
  });
});
