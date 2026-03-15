import { Serializer } from './serializers';
import type * as dnsPacket from 'dns-packet';
import { encode, decode } from '../network/dns';

export class DNSPacketSerializer implements Serializer<dnsPacket.Packet> {
  encode(packet: dnsPacket.Packet): Buffer {
    return encode(packet);
  }

  decode(buffer: Buffer): dnsPacket.Packet {
    return decode(buffer);
  }
}
