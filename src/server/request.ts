import { Packet } from "../dns/dnslib";
import type {RemoteInfo} from 'dgram';

export enum ConnectionType {
    UDP = 'udp',
    TCP = 'tcp'
}

interface Connection {
    remoteAddress: string;
    remotePort: number;
    type: ConnectionType;
}
/**
 * Contains iformation about a DNS request and the connection it came from.
 */
export interface DNSRequest {
    packet: Packet;
    connection: Connection;
}

export function requestFromMessage(message: Buffer, rinfo: RemoteInfo): DNSRequest {
    const packet = Packet.fromBuffer(message);
    const connection: Connection = {
        remoteAddress: rinfo.address,
        remotePort: rinfo.port,
        type: rinfo.family === 'IPv6' ? ConnectionType.UDP : ConnectionType.TCP
    };
    return {
        packet,
        connection
    };
}