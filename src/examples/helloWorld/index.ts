import { ConsoleLogger } from '../../plugins/loggers';
import { DefaultStore } from '../../plugins/storage';
import { DNSOverTCP, DNSOverUDP, DefaultServer } from '../../common';
import { DNSOverHTTP } from '../../common/network/doh';

const logger = new ConsoleLogger(true, true);

const st = new DefaultStore();
st.set('*', 'TXT', 'Hello, world!');

const s = new DefaultServer({
  networks: [
    new DNSOverTCP('localhost', 1054),
    new DNSOverUDP('localhost', 1054),
    new DNSOverHTTP({
      httpPort: 1080,
      address: 'localhost',
    }),
  ],
});

s.use(logger.handler.bind(logger));
s.use(st.handler);

s.start(() => {
  console.log('Server started');
});
