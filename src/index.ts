import { ConsoleLogger } from "./common/logger";
import { DNSServer } from "./server";
import { DNSOverTCP, DNSOverUDP } from "./common/network";
import dnsPacket from 'dns-packet';
import { Handler } from "./server";
import { DNSRequest, DNSResponse, NextFunction } from "./server/types";
import { TrieStore } from "./common/store";

const logger = new ConsoleLogger(false, true);
const s = new DNSServer({
  networks: [new DNSOverTCP('0.0.0.0', 1053), new DNSOverUDP('0.0.0.0', 1053)],
  cache: {},
  logger: logger.handle.bind(logger),
});

const store = new TrieStore();
store.set('example.com', 'A', {
    name: 'example.com',
    type: 'A',
    class: 'IN',
    ttl: 300,
    data: '127.0.0.1'
});

store.set('example.com', 'MX', {
    name: 'example.com',
    type: 'MX',
    class: 'IN',
    ttl: 300,
    data: {
        preference: 10,
        exchange: 'mail.example.com',
    }
});

store.set('*.example.com', 'A', {
    name: '*.example.com',
    type: 'A',
    class: 'IN',
    ttl: 300,
    data: '127.0.0.2'
});

console.log(store.trie.resolve('example.com'));
console.log(store.trie.resolve('test.example.com'));
console.log(store.get('test.example.com', 'A'));
console.log(store.get('example.com', 'A'));

const block: ((list: string[]) => Handler) = (blockList: string[]): Handler => {
    return async (req, res, next) => {
        if(blockList.includes(req.packet.questions![0].name)) {
            return res.errors.nxDomain();
        }
        next();
    }
}

const forward: Handler = async (req, res, next) => {
    try {
        const response = await fetch(`https://cloudflare-dns.com/dns-query?dns=${dnsPacket.encode(req.packet).toString('base64')}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/dns-message',
            }
        });
        // data as buffer 
        const data = Buffer.from(await response.arrayBuffer());
        const responsePacket = dnsPacket.decode(data);
        if(responsePacket.answers && responsePacket.answers.length > 0) {
            return res.answer(responsePacket.answers);
        }

        return next();
    } catch (e) {
        console.error(e);
        return next(e);
    }
}



s.use(block(["example.dev"]));
s.use(store.handler)
// s.use(forward);

s.handle('example.net', (req, res) => {
    res.packet.answers?.push({
        type: "SOA",
        name: "example.com",
        data: {
            mname: "ns1.example.com",
            rname: "admin.example.com",
            serial: 2021101001,
            refresh: 3600,
            retry: 600,
            expire: 604800,
            minimum: 60,
        }
    });
    res.packet.answers?.push({
        type: "A",
        name: "example.com",
        data: "127.0.0.1",
    });
    res.resolve();
});

s.handle('example.com', (req, res, next) => {
    if (req.packet.questions![0].type === 'A') {
        return res.answer({
            type: 'A',
            name: 'example.com',
            data: '127.0.0.1',
        });
    }
    next();
});

s.handle('whatsmyip', (req, res) => {
    res.answer({
        type: 'A',
        name: 'whatsmyip',
        data: req.connection.remoteAddress,
    });
});

s.handle('*', (req, res) => {
    res.errors.notImplemented();
});

s.start(() => {
    console.log('Server started');
});
