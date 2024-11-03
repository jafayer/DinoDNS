import { ConsoleLogger } from '../../plugins/loggers';
import { DefaultStore } from '../../plugins/storage';
import { DNSOverTCP, DNSOverUDP, DefaultServer } from '../../common';
import { DNSOverHTTP } from '../../common/network/doh';
import fs from "fs";

const logger = new ConsoleLogger(true, true);

const st = new DefaultStore();
st.set('*', 'TXT', 'Hello, world!');

const s = new DefaultServer({
  networks: [
    new DNSOverTCP({address: 'localhost', port: 1054}),
    new DNSOverUDP({address: 'localhost', port: 1054}),
    new DNSOverHTTP({
      httpPort: 1080,
      httpsPort: 1443,
      address: 'localhost',
      ssl: {
        cert: fs.readFileSync('./ssl/cert.crt'), // obviously don't use the provided TLS certificate in prod
        key: fs.readFileSync('./ssl/key.pem'), // also this may expire in the future, so this demo might break
      }
    }),
  ],
});

s.use(logger.handler.bind(logger));
s.use(st.handler);

s.start(() => {
  console.log('Server started, using protocols:' + s.networks.map(n => n.networkType).join(', '));
});
