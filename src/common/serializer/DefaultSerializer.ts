import { Serializer } from "./serializers";
import dnsPacket from "dns-packet";

export class DNSPacketSerializer implements Serializer<dnsPacket.Packet> {
    encode(packet: dnsPacket.Packet): Buffer {
      return dnsPacket.encode(packet);
    }
  
    decode(buffer: Buffer): dnsPacket.Packet {
      return dnsPacket.decode(buffer);
    }
  }
  