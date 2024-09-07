import { Server } from "./server/Server";
import dns from 'dns';

const s = new Server();

s.use((req, res, next) => {
    console.log(`Request from ${req.connection.remoteAddress} for ${req.packet.questions![0].name} (${req.packet.questions![0].type})`);
    next();
});

// respond 127.0.0.2 for all requests to the below domains
const localDomains = [
    'example.com',
    'example.net',
    'example.org'
]

s.use(async (req, res, next) => {
    new Promise((resolve) => {
        setTimeout(() => {
            console.log('timeout');
            resolve(undefined);
        }, 1000);
    });

    next()
});

s.handle('*.com', (req, res) => {
    switch (req.packet.questions![0].type) {
        case 'A':
            res.answer({name: req.packet.questions![0].name, type: 'A', data: req.connection.remoteAddress, ttl: 300});
            break;
        case 'MX':
            res.answer({name: req.packet.questions![0].name, type: 'MX', data: {preference: 10, exchange: 'test'}, ttl: 300});
            break;
        case 'TXT':
            res.answer({name: req.packet.questions![0].name, type: 'TXT', data: ["hi", "there"], ttl: 300});
            break;
        case "NS":
            res.answer({name: req.packet.questions![0].name, type: 'NS', data: 'test.example.com', ttl: 300});
            break;
        case "SOA":
            res.answer<'SOA'>({
                type: 'SOA',
                name: req.packet.questions![0].name,
                data: {
                    mname: 'ns1.example.com',
                    rname: 'hostmaster.example.com',
                    serial: 20210101,
                    refresh: 3600,
                    retry: 600,
                    expire: 604800,
                    minimum: 300,
                },
            });
            break;
        default:
            // create a NOTIMP response
            res.packet.flags = 0x0004;
            res.resolve();
            return;
    }
});

s.listen(1053, () => {
    console.log('Server listening on port 1053');
});