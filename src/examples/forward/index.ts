import { DefaultServer, DNSOverUDP, SupportedNetworkType } from "../../common";
import { Forwarder } from "../../plugins/handlers/forward";

const forwarder = new Forwarder({
    address: "dns.google",
    protocol: SupportedNetworkType.UDP,
});

const server = new DefaultServer({
    networks: [new DNSOverUDP({ address: '::', port: 1053 })],
});

server.use(forwarder.handler);

server.start(() => {
    console.log('Server started');
})