import { DDNS } from '../../plugins/etc/ddns';
import { DefaultStore } from '../../plugins/storage';
import { DefaultServer, DNSOverUDP } from '../../common';

const store = new DefaultStore();
export const example = new DDNS(store, {
  name: 'example.com',
  type: 'A',
  queryCallback: async () => {
    return fetch('https://api.ipify.org?format=json')
      .then((res) => res.json())
      .then((json) => {
        return {
          A: [(json as unknown as { ip: string }).ip],
        };
      });
  },
});

const server = new DefaultServer({
  networks: [
    new DNSOverUDP({
      address: '::',
      port: 1053,
    }),
  ],
});

server.use(store.handler);

server.start(() => {
  console.log('Server started');
  example.start();
});
