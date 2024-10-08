import { ConsoleLogger } from './plugins/loggers';
import { DefaultServer } from './common/server';
import { DNSOverTCP, DNSOverUDP } from './common/network';
import { Handler } from './common/server';
import { DefaultStore } from './plugins/storage';

export * as network from './common/network';
export * as logging from './plugins/loggers';
export * as server from './common/server';
export * as store from './plugins/storage';

export { SupportedAnswer } from './types/dns';

export {
  DNSOverTCP,
  DNSOverUDP,
  Connection,
  Network,
  NetworkHandler,
  SupportedNetworkType,
  TCPSerializer,
  UDPSerializer,
} from './common/network';
export { ConsoleLogger, Logger } from './plugins/loggers';
export { DNSServer, DNSRequest, DNSResponse, Handler, NextFunction } from './common/server';
export { DefaultStore, Store } from './plugins/storage';
export { DefaultRouter, Router } from './common/router';

const logger = new ConsoleLogger(true, true);
const s = new DefaultServer({
  networks: [new DNSOverTCP('localhost', 1053), new DNSOverUDP('localhost', 1053)],
  defaultHandler: (req, res) => {
    res.errors.nxDomain();
  },
});

const store = new DefaultStore();
store.set('example.com', 'A', '127.0.0.1');

store.set('example.com', 'MX', {exchange: 'mail.example.com', preference: 10});

store.set('example.net', 'A', '127.0.0.1');

store.set('*.example.com', 'A', '127.0.0.2');

const block: (list: string[]) => Handler = (blockList: string[]): Handler => {
  return async (req, res, next) => {
    if (blockList.includes(req.packet.questions![0].name)) {
      return res.errors.nxDomain();
    }
    next();
  };
};

// const forward: Handler = async (req, res, next) => {
//   try {
//     const response = await fetch(
//       `https://cloudflare-dns.com/dns-query?dns=${dnsPacket.encode(req.packet).toString('base64')}`,
//       {
//         method: 'GET',
//         headers: {
//           Accept: 'application/dns-message',
//         },
//       },
//     );
//     // data as buffer
//     const data = Buffer.from(await response.arrayBuffer());
//     const responsePacket = dnsPacket.decode(data);
//     if (responsePacket.answers && responsePacket.answers.length > 0) {
//       return res.answer(responsePacket.answers);
//     }

//     return next();
//   } catch (e) {
//     console.error(e);
//     return next(e);
//   }
// };

s.use(logger.handler.bind(logger));

s.use(block(['example.dev']));
s.use(store.handler);
// s.use(forward);

s.handle('example.net', (req, res) => {
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

// s.handle('example.com', (req, res, next) => {
//   if (req.packet.questions![0].type === 'A') {
//     return res.answer({
//       type: 'A',
//       name: 'example.com',
//       data: '127.0.0.1',
//     });
//   }
//   next();
// });

s.handle('whatsmyip', (req, res) => {
  res.answer({
    type: 'A',
    name: 'whatsmyip',
    data: req.connection.remoteAddress,
  });
});

s.start(() => {
  console.log('Server started');
});
