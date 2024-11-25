import { ConsoleLogger } from '../../plugins/loggers';
import { DefaultStore } from '../../plugins/storage';
import { DNSOverTCP, DNSOverUDP, DefaultServer, DNSOverHTTP } from '../../common';
import fs from 'fs';

const logger = new ConsoleLogger(true, true);

const st = new DefaultStore();
st.set('*', 'TXT', 'Hello, world!');
const sslConfig = {
  cert: fs.readFileSync('./ssl/cert.crt'), // obviously don't use the provided TLS certificate in prod
  key: fs.readFileSync('./ssl/key.pem'), // also this may expire in the future, so this demo might break
};
const s = new DefaultServer({
  networks: [
    new DNSOverTCP({ address: '0.0.0.0', port: 1054 }),
    new DNSOverUDP({ address: '0.0.0.0', port: 1054 }),
    new DNSOverTCP({ address: '0.0.0.0', port: 1853, ssl: sslConfig }),
    new DNSOverHTTP({ address: '0.0.0.0', port: 1080 }),
    new DNSOverHTTP({ address: '0.0.0.0', port: 1443, ssl: sslConfig }),
  ],
});

s.use(logger.handler.bind(logger));
s.use(st.handler);

s.start(() => {
  s.networks.map((n) => {
    console.log(`Listening over ${n.networkType} on ${n.address}:${n.port}`);
  });
});
