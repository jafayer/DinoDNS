import { server, network, store, logging } from '../..';

const logger = new logging.ConsoleLogger(true, true);

const st = new store.DefaultStore();
st.set('*', 'TXT', {
  name: 'example.com',
  type: 'TXT',
  class: 'IN',
  ttl: 300,
  data: 'Hello, World!',
});

const s = new server.DefaultServer({
  networks: [new network.DNSOverTCP('localhost', 1054), new network.DNSOverUDP('localhost', 1054)],
});

s.use(logger.handler.bind(logger));
s.use(st.handler);

s.start(() => {
  console.log('Server started');
});
