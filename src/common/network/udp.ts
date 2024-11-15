import { Network, NetworkHandler, SupportedNetworkType, Connection } from './net';
import { Serializer } from '../serializer';
import dgram from 'dgram';
import dnsPacket, { TRUNCATED_RESPONSE } from 'dns-packet';
import { RCode, CombineFlags } from '../core/utils';
import { DNSRequest } from '../../types';

/**
 * Serializer for the UDP protocol. The `dns-packet` module's
 * `decode` and `encode` methods are passed directly through here.
 */
export class UDPSerializer implements Serializer<dnsPacket.Packet> {
  encode(packet: dnsPacket.Packet): Buffer {
    let packetSize = dnsPacket.encodingLength(packet);
    if (packetSize > 512) {
      // bitwise OR to include the truncated response flag
      const newFlags = (packet.flags || 0) | TRUNCATED_RESPONSE;
      packet.flags = newFlags;
    }

    while (packetSize > 512) {
      if (packet.additionals && packet.additionals.length) {
        packet.additionals = [];

        packetSize = dnsPacket.encodingLength(packet);
        continue;
      }

      if (packet.authorities && packet.authorities.length) {
        packet.authorities = [];

        packetSize = dnsPacket.encodingLength(packet);
        continue;
      }

      if (packet.answers && packet.answers.length) {
        packet.answers = packet.answers.slice(0, packet.answers.length - 1);

        packetSize = dnsPacket.encodingLength(packet);
        continue;
      }

      break;
    }

    return dnsPacket.encode(packet);
  }

  decode(buffer: Buffer): dnsPacket.Packet {
    return dnsPacket.decode(buffer);
  }
}

export interface DNSOverUDPProps {
  address: string;
  port: number;
  serializer?: UDPSerializer;
}

/**
 * DNSOverUDP is a network interface for handling DNS requests over UDP.
 */
export class DNSOverUDP implements Network<dnsPacket.Packet> {
  public address: string;
  public port: number;
  private server: dgram.Socket;
  public serializer: UDPSerializer;
  public networkType: SupportedNetworkType = SupportedNetworkType.UDP;
  public handler?: NetworkHandler;

  constructor({ address, port, serializer }: DNSOverUDPProps) {
    this.address = address;
    this.port = port;
    this.server = dgram.createSocket('udp4');
    this.serializer = serializer || new UDPSerializer();

    this.server.on('message', async (msg, rinfo) => {
      const startTime = process.hrtime.bigint();
      const startTimeMs = Date.now();
      if (!this.handler) {
        const response = dnsPacket.encode({
          type: 'response',
          id: 0,
          flags: CombineFlags([RCode.NOT_IMPLEMENTED]),
          questions: [],
          answers: [],
          authorities: [],
          additionals: [],
        });

        return this.server.send(new Uint8Array(response), rinfo.port, rinfo.address);
      }

      const packet = this.serializer.decode(msg);
      const request = new DNSRequest(packet, this.toConnection(rinfo));
      request.metadata.ts.requestTimeNs = startTime;
      request.metadata.ts.requestTimeMs = startTimeMs;
      this.handler(request)
        .then((resp) => {
          this.server.send(new Uint8Array(this.serializer.encode(resp.packet.raw)), rinfo.port, rinfo.address);
          return resp;
        })
        .then((resp) => {
          const endTime = process.hrtime.bigint();
          const endTimeMs = Date.now();
          resp.metadata.ts.responseTimeNs = endTime;
          resp.metadata.ts.responseTimeMs = endTimeMs;
          resp.emit('done', resp);
          resp.removeAllListeners(); // cleanup
        })
        .catch((err) => {
          console.error(err);
        });
    });

    this.server.on('error', (err) => {
      console.error(err);
    });
  }

  async listen(callback?: () => void): Promise<void> {
    this.server.bind(this.port, this.address, callback);

    return;
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
      type: SupportedNetworkType.UDP,
    };
  }
}
