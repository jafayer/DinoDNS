import { DefaultServer, DNSOverUDP, DNSOverTCP, DNSOverHTTP } from '../../common';
import { DefaultStore } from '../../plugins/storage';
import process from 'process';

const store = new DefaultStore();
store.set('example.com', 'A', '127.0.0.1');
const server = new DefaultServer({
  networks: [
    new DNSOverUDP({
      address: '0.0.0.0',
      port: 1053,
    }),
    new DNSOverTCP({
      address: '0.0.0.0',
      port: 1053,
    }),
    new DNSOverHTTP({
      address: '0.0.0.0',
      port: 1080,
    }),
  ],
  multithreaded: true,
});

server.use((req, res, next) => {
  console.log(`[${process.pid}] ${req.packet.questions[0].name}`);
  next();
});
server.use(store.handler);

server.start(() => {
  console.log(`Server started in cluster mode on PID ${process.pid}`);
});
