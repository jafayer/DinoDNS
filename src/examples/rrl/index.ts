import { RRL } from '../../plugins/handlers/rrl';
import { DefaultServer, DNSOverUDP } from '../../common';
import { DefaultStore } from '../../plugins/storage';

const server = new DefaultServer({
  networks: [
    new DNSOverUDP({
      address: '::',
      port: 1053,
    }),
  ],
});

server.use(new RRL({ limit: 10, interval: 1000 }).handler);

const store = new DefaultStore();
server.use(store.handler);

store.set('example.com', 'A', '127.0.0.1');

server.start(() => {
  console.log('Server started');
});
