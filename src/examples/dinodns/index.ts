import { DinoDNS } from '../../';
import { DefaultCache } from '../../plugins/cache';
import { ConsoleLogger } from '../../plugins/loggers';
import { DefaultStore } from '../../plugins/storage';
import { DNSOverTCP, DNSOverUDP } from '../../common';

const cache = new DefaultCache({
  maxEntries: 2,
});
const logger = new ConsoleLogger();
const store = new DefaultStore();

store.set('example.com', 'A', '127.0.0.1');
store.set('example.com', 'AAAA', '::1');
store.set('example.com', 'TXT', 'Hello, World!');

const server = new DinoDNS({
  cache,
  logger,
  storage: store,
  networks: [new DNSOverTCP({ address: '0.0.0.0', port: 1053 }), new DNSOverUDP({ address: '0.0.0.0', port: 1053 })],
});

server.use((req, res, next) => {
  console.log(`Cache has ${cache.size} entries`);

  next();
});

server.start(() => {
  console.log('Server started');
});
