import net from 'net';
import tls from 'tls';
import { Serializer } from '../serializer';
import dnsPacket from 'dns-packet';
import { Network, NetworkHandler, SupportedNetworkType, Connection, SSLConfig } from './net';
import { DNSRequest } from '../../types';

/**
 * Serializer for the TCP protocol. The `dns-packet` module's
 * `streamDecode` and `streamEncode` methods are passed directly through here.
 */
export class TCPSerializer implements Serializer<dnsPacket.Packet> {
  encode(packet: dnsPacket.Packet): Buffer {
    return dnsPacket.streamEncode(packet);
  }

  decode(buffer: Buffer): dnsPacket.Packet {
    return dnsPacket.streamDecode(buffer);
  }
}

export interface DNSOverTCPProps {
  address: string;
  port: number;
  ssl?: SSLConfig;
  serializer?: TCPSerializer;
}

/**
 * DNSOverTCP is a network interface for handling DNS requests over TCP.
 */
export class DNSOverTCP implements Network<dnsPacket.Packet> {
  public address: string;
  public port: number;
  public server: net.Server | tls.Server;
  private ssl?: SSLConfig;
  public serializer: TCPSerializer;
  public networkType: SupportedNetworkType.TCP | SupportedNetworkType.TLS;
  public handler?: NetworkHandler;

  constructor({ address, port, ssl, serializer }: DNSOverTCPProps) {
    this.address = address;
    this.port = port;

    this.server = ssl ? tls.createServer({ key: ssl.key, cert: ssl.cert }) : net.createServer();
    this.serializer = serializer || new TCPSerializer();
    this.networkType = ssl ? SupportedNetworkType.TLS : SupportedNetworkType.TCP;

    this.server.on(ssl ? 'secureConnection' : 'connection', (socket: net.Socket) => {
      const startTime = process.hrtime.bigint();
      const startTimeMs = Date.now();
      let socketEnded = false;

      const endSocket = (err?: Error) => {
        if (!socketEnded) {
          socketEnded = true;
          if (err) {
            console.error(err);
          }
          socket.end();
        }
      };

      if (!this.handler) {
        const err = new Error('No handler defined for DNSOverTCP');
        endSocket(err);
      }

      socket.on('data', async (data: Buffer) => {
        try {
          if (!this.handler) {
            return endSocket(new Error('No handler defined for DNSOverTCP'));
          }

          const packet = dnsPacket.streamDecode(data);
          const request = new DNSRequest(packet, this.toConnection(socket));
          request.metadata.ts.requestTimeNs = startTime; // override the request time with the time the request was received
          request.metadata.ts.requestTimeMs = startTimeMs; // override the request time with the time the request was received
          const response = await this.handler(request);
          if (!socketEnded) {
            socket.write(new Uint8Array(this.serializer.encode(response.packet.raw)), (err) => {
              endSocket(err);
              response.emit('done', response);
              response.removeAllListeners(); // cleanup
            });
          }
        } catch (err) {
          endSocket(err as Error);
        }
      });

      socket.on('error', (err) => {
        endSocket(err);
      });

      socket.on('end', () => {
        endSocket();
      });
    });
  }

  async listen(callback?: () => void): Promise<void> {
    this.server.listen(this.port, this.address, 1000, callback);

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

  private toConnection(socket: net.Socket): Connection {
    return {
      remoteAddress: socket.remoteAddress || '',
      remotePort: socket.remotePort || 0,
      type: SupportedNetworkType.TCP,
    };
  }
}
