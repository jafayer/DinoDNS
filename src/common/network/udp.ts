import { Network, NetworkHandler, SupportedNetworkType, Connection } from './net';
import { Serializer } from '../serializer';
import dgram from 'dgram';
import type { Packet } from '../../types/dns';
import { encode, decode, encodingLength, TRUNCATED_RESPONSE } from './dns';
import { RCode, CombineFlags } from '../core/utils';
import { DNSRequest } from '../../types';
import { isIPv6 } from 'net';

/**
 * Serializer for the UDP protocol.  Uses the built-in zero-copy DNS codec –
 * no third-party runtime dependency required.
 */
export class UDPSerializer implements Serializer<Packet> {
  encode(packet: Packet): Buffer {
    let packetSize = encodingLength(packet);
    if (packetSize > 512) {
      // bitwise OR to include the truncated response flag
      const newFlags = (packet.flags || 0) | TRUNCATED_RESPONSE;
      packet.flags = newFlags;
    }

    while (packetSize > 512) {
      if (packet.additionals && packet.additionals.length) {
        packet.additionals = [];

        packetSize = encodingLength(packet);
        continue;
      }

      if (packet.authorities && packet.authorities.length) {
        packet.authorities = [];

        packetSize = encodingLength(packet);
        continue;
      }

      if (packet.answers && packet.answers.length) {
        packet.answers = packet.answers.slice(0, packet.answers.length - 1);

        packetSize = encodingLength(packet);
        continue;
      }

      break;
    }

    return encode(packet);
  }

  decode(buffer: Buffer): Packet {
    // Kept for compatibility; network handler now uses the raw buffer directly.
    return decode(buffer);
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
export class DNSOverUDP implements Network<Packet> {
  public address: string;
  public port: number;
  private server: dgram.Socket;
  public serializer: UDPSerializer;
  public networkType: SupportedNetworkType = SupportedNetworkType.UDP;
  public handler?: NetworkHandler;

  constructor({ address, port, serializer }: DNSOverUDPProps) {
    this.address = address;
    this.port = port;
    this.server = dgram.createSocket(isIPv6(this.address) ? 'udp6' : 'udp4');
    this.serializer = serializer || new UDPSerializer();

    this.server.on('message', async (msg, rinfo) => {
      const startTime = process.hrtime.bigint();
      const startTimeMs = Date.now();
      if (!this.handler) {
        const response = encode({
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

      // Zero-copy path: pass the raw buffer directly to DNSRequest.
      // PacketWrapper will read header fields from the buffer without a full decode.
      const request = new DNSRequest(msg, this.toConnection(rinfo));
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
