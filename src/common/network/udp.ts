import { Network, NetworkHandler, SupportedNetworkType, Connection } from "./net";
import { Serializer, DNSPacketSerializer } from "../dns";
import dgram from "dgram";
import dnsPacket from "dns-packet";
import { RCode, CombineFlags } from "../core/utils";

export class DNSOverUDP implements Network<dnsPacket.Packet, dgram.RemoteInfo> {
    private server: dgram.Socket;
    public serializer: Serializer<dnsPacket.Packet>;
    public networkType: SupportedNetworkType = SupportedNetworkType.UDP;

    constructor(public address: string, public port: number, public handler?: NetworkHandler<dnsPacket.Packet>) {
        this.server = dgram.createSocket("udp4");
        this.serializer = new DNSPacketSerializer();

        this.server.on("message", async (msg, rinfo) => {
            if (!this.handler) {
                const response = dnsPacket.encode({
                    type: 'response',
                    id: 0,
                    flags: CombineFlags([RCode.NOT_IMPLEMENTED]),
                    questions: [],
                    answers: [],
                    authorities: [],
                    additionals: []
                });

                return this.server.send(new Uint8Array(response), rinfo.port, rinfo.address);
            }

            const packet = this.serializer.decode(msg);
            const resp = await this.handler(packet, this.toConnection(rinfo));
            this.server.send(new Uint8Array(this.serializer.encode(resp.packet)), rinfo.port, rinfo.address);
        });
    }

    async listen(address?: string, port?: number, callback?: () => void): Promise<void> {
        this.server.bind(port || this.port, address || this.address, callback);

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

    private toConnection(rinfo: dgram.RemoteInfo): Connection {
        return {
            remoteAddress: rinfo.address,
            remotePort: rinfo.port,
            type: SupportedNetworkType.UDP
        }
    }
}