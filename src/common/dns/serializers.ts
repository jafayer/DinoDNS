import dnsPacket from 'dns-packet';

export interface Serializer<T> {
    encode(packet: T): Buffer;
    decode(buffer: Buffer): T;
}

export interface CanAnswer<X, Y> {
    toAnswer(packet: X): Y;
}

export class DNSPacketSerializer implements Serializer<dnsPacket.Packet>, CanAnswer<dnsPacket.Packet, dnsPacket.Packet> {
    encode(packet: dnsPacket.Packet): Buffer {
        return dnsPacket.encode(packet);
    }

    decode(buffer: Buffer): dnsPacket.Packet {
        return dnsPacket.decode(buffer);
    }

    toAnswer(packet: dnsPacket.Packet): dnsPacket.Packet {
        const answer: dnsPacket.Packet = {
            type: "response",
            id: packet.id,
            flags: packet.flags,
            questions: packet.questions,
            answers: [],
            authorities: [],
            additionals: []
        };

        return answer;
    }
}