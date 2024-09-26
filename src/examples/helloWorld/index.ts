import { server, network, store, logging } from '../..';

const logger = new logging.ConsoleLogger(true, true);

const st = new store.TrieStore();
st.set('*', 'TXT', {
  name: 'example.com',
  type: 'TXT',
  class: 'IN',
  ttl: 300,
  data: 'Hello, World!',
});

const s = new server.DNSServer({
  networks: [new network.DNSOverTCP('localhost', 1054), new network.DNSOverUDP('localhost', 1054)],
});

s.use(st.handler);

s.start(() => {
  console.log('Server started');
});
