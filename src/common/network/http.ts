import { Network, NetworkHandler, SupportedNetworkType } from "./net";
import http from "http";
import { DNSPacketSerializer, Serializer } from "../dns";
import dnsPacket from "dns-packet";
import type { Question, RecordType } from "dns-packet";

export class DNSOverHTTP implements Network<dnsPacket.Packet, http.ServerResponse> {
    private server: http.Server;
    private serializer: Serializer<dnsPacket.Packet>;
    public networkType: SupportedNetworkType = SupportedNetworkType.HTTP;

    constructor(public address: string, public port: number, public handler: NetworkHandler<dnsPacket.Packet, http.ServerResponse>) {
        this.server = http.createServer();
        this.serializer = new DNSPacketSerializer();

        this.server.on("request", (req, res) => {
            let data = "";
            req.on("data", (chunk) => {
                data += chunk;
            });

            req.on("end", () => {
                let packet: dnsPacket.Packet;
                switch (req.method) {
                    // get request
                    case "GET":
                        // get dns query param
                        const query = req.url?.split("?")[1];
                        const params = new URLSearchParams(query || "");
                        const dnsParam = params.get("dns");
                        const type: RecordType | null = params.get("type") as RecordType | null;
                        const name = params.get("name");
                        if (!dnsParam || !type || !name) {
                            res.writeHead(400);
                            res.end();
                            return;
                        }

                        if (dnsParam) {
                            packet = this.serializer.decode(Buffer.from(dnsParam, "base64"));
                        } else {
                            // we have to construct our own packet
                            const question: Question = {
                                type,
                                name,
                            }

                            packet = {
                                type: "query",
                                id: 1,
                                flags: dnsPacket.RECURSION_DESIRED,
                                questions: [question],
                            }

                            packet = this.serializer.decode(this.serializer.encode(packet));
                        }
                        break;
                    // post request
                    case "POST":
                        packet = this.serializer.decode(Buffer.from(data, "base64"));
                        break;
                    default:
                        res.writeHead(400);
                        res.end();
                        return;
                }

                this.handler(packet, res);
            });
        });
    }

    /**
     * Listens for incoming DNS requests on /dns-query
     * 
     * @param address 
     * @param port 
     * @param callback 
     * @returns 
     */
    async listen(address?: string, port?: number, callback?: () => void): Promise<void> {
        this.server.listen(port || this.port, address || this.address, callback);

        return
    }

    async close(): Promise<void> {
        this.server.close();
    }

    on(event: string, listener: () => void): void {
        this.server.on(event, listener);
    }

    off(event: string, listener: () => void): void {
        this.server.off(event, listener);
    }
}