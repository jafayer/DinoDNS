import type dnsPacket from "dns-packet"
import { SupportedNetworkType as ConnectionType, Connection } from "../common/network";
import { DNSPacketSerializer } from "../common/dns";
import { CombineFlags, RCode } from "../common/core/utils"
import { EventEmitter } from "events";

export interface NextFunction {
    (err?: any): void;
}

export interface Handler {
    (req: DNSRequest, res: DNSResponse, next: NextFunction): void;
}

export class DNSResponse extends EventEmitter {
    packet: dnsPacket.Packet;
    connection: Connection;
    private fin: boolean = false;

    constructor(packet: dnsPacket.Packet, connection: Connection, private serializer: DNSPacketSerializer = new DNSPacketSerializer()) {
        super();
        this.packet = packet;
        this.connection = connection;
    }

    done(): void {
        this.emit('done', this.packet);
        this.fin = true;
    }

    get finished() {
        return this.fin;
    }

    answer(answer: dnsPacket.Answer | dnsPacket.Answer[]): void {
        if (Array.isArray(answer)) {
            this.packet.answers = answer;
        } else {
            this.packet.answers = [answer];
        }
        
        this.done();
    }

    resolve(): void {
        this.done();
    }

    errors = {
        nxDomain: () => {
            const flags = this.packet.flags || 0;
            this.packet.flags = CombineFlags([flags, RCode.NX_DOMAIN]);
            this.done();
        },
        serverFailure: () => {
            const flags = this.packet.flags || 0;
            this.packet.flags = CombineFlags([flags, RCode.SERVER_FAILURE]);
            this.done();
        },
        refused: () => {
            const flags = this.packet.flags || 0;
            this.packet.flags = CombineFlags([flags, RCode.FORMAT_ERROR]);
            this.done();
        },
        notImplemented: () => {
            const flags = this.packet.flags || 0;
            this.packet.flags = CombineFlags([flags, RCode.NOT_IMPLEMENTED]);
            this.done();
        }
    }
}

export class DNSRequest  {
    packet: dnsPacket.Packet;
    connection: Connection;

    constructor(packet: dnsPacket.Packet, connection: Connection, private serializer: DNSPacketSerializer = new DNSPacketSerializer()) {
        this.packet = packet;
        this.connection = connection;
    }

    toAnswer(): DNSResponse {
        return new DNSResponse(this.serializer.toAnswer(this.packet), this.connection);
    }
}