import { Serializer } from './serializers';
import type { Packet } from '../../types/dns';
import { encode, decode } from '../network/dns';

export class DNSPacketSerializer implements Serializer<Packet> {
  encode(packet: Packet): Buffer {
    return encode(packet);
  }

  decode(buffer: Buffer): Packet {
    return decode(buffer);
  }
}
