import { ConsoleLogger } from "./common/logger";
import { DNSServer } from "./server";
import { DNSOverTCP, DNSOverUDP } from "./common/network";
import dnsPacket from 'dns-packet';

const logger = new ConsoleLogger(false, true);
const s = new DNSServer({
  networks: [new DNSOverTCP('localhost', 1053), new DNSOverUDP('localhost', 1053)],
  cache: {},
  logger: logger.handle.bind(logger),
});

type MapToRecord = {[key: string]: dnsPacket.Answer | dnsPacket.Answer[]};

const domains: {[key: string]: MapToRecord} = {
    "example.com": {
        "A": [
            {
                type: "A",
                name: "example.com",
                data: "127.0.0.1"
            },
            {
                type: "A",
                name: "example.com",
                data: "127.0.0.2"
            },
        ],
        "SOA": {
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
        },
    }
}
s.use((req, res, next) => {
  console.log(req.packet.questions![0].name);
  next();
});

s.use((req, res, next) => {
  console.log("Middleware 2");
  next();
});

s.handle('example.net', (req, res) => {
  console.log("Handling request for example.com");
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

s.handle('example.com', (req, res) => {
    const records = domains[req.packet.questions![0].name];
    console.log(req.packet.questions![0].type);
    return res.answer(
        records[req.packet.questions![0].type as string]
    );
});

s.start()