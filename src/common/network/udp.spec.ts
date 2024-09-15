import dgram from "dgram";
import dnsPacket from "dns-packet";
import { DNSOverUDP } from "./udp";
import { NetworkHandler } from "./net";
import type { StringAnswer } from "dns-packet";

describe("DNSOverTCP Integration Tests", () => {
    let server: DNSOverUDP;
    let client: dgram.Socket;

    beforeEach(() => {
        server = new DNSOverUDP("localhost", 8053, () => {});

        server.listen();

        client = dgram.createSocket("udp4");
    });

    afterEach(() => {
        server.close();
        client.close();
    });

    it("Should be able to parse incoming queries", (done) => {
        server.handler = (packet, rinfo) => {
            expect(packet.questions![0].name).toBe("google.com");
            expect(packet.questions![0].type).toBe("A");
            expect(packet.questions![0].class).toBe("IN");
            done();
        };

        const query = dnsPacket.encode({
            type: "query",
            id: 1,
            flags: dnsPacket.RECURSION_DESIRED,
            questions: [
                {
                    type: "A",
                    name: "google.com",
                },
            ],
        });

        client.send(new Uint8Array(query), 8053, "localhost");
    });

    it("Should be able to send responses", (done) => {
        server.handler = (packet, rinfo) => {
            const response = dnsPacket.encode({
                type: "response",
                id: packet.id,
                flags: dnsPacket.RECURSION_DESIRED,
                questions: packet.questions,
                answers: [
                    {
                        type: "A",
                        name: "google.com",
                        data: "127.0.0.1",
                        ttl: 60,
                    },
                ],
            });

            client.send(new Uint8Array(response), rinfo.port, rinfo.address);
        }

        // Listen for response
        client.on("message", (data) => {
            console.log(data);
            const packet = dnsPacket.decode(data);
            expect(packet.answers!.length).toBe(1);
            expect((packet.answers![0] as StringAnswer).name).toBe("google.com");
            expect((packet.answers![0] as StringAnswer).data).toBe("127.0.0.1");
            done();
        });

        // Send query
        const query = dnsPacket.encode({
            type: "query",
            id: 1,
            flags: dnsPacket.RECURSION_DESIRED,
            questions: [
                {
                    type: "A",
                    name: "google.com",
                },
            ],
        });

        client.send(new Uint8Array(query), 8053, "localhost");
    });
});