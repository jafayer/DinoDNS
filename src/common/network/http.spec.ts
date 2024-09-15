import { DNSOverHTTP } from "./http";
import http from "http";
import { Serializer, DNSPacketSerializer } from "../dns";
import dnsPacket from "dns-packet";
import type { StringAnswer } from "dns-packet";


// NOTE: shit don't work but I'm moving on for now
describe("DNSOverHTTP Integration Tests", () => {
    let server: DNSOverHTTP;
    let client: http.ClientRequest;

    beforeEach(() => {
        server = new DNSOverHTTP("localhost", 8053, () => {});

        server.listen();

        client = http.request({ port: 8053, host: "localhost" });
    });

    afterEach(() => {
        server.close();
        client.end();
    });

    it("Should be able to parse incoming queries", (done) => {
        server.handler = (packet, res) => {
            console.log(packet);
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

        client.write(new Uint8Array(query));
    });

    it("Should be able to send responses", (done) => {
        server.handler = (packet, res) => {
            console.log(packet);
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

            res.write(new Uint8Array(response));
        }

        // Listen for response
        client.on("data", (data) => {
            const packet = dnsPacket.decode(data);
            expect(packet.answers![0].name).toBe("google.com");
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

        client.write(new Uint8Array(query));
    });
})