import net from 'net';
import tls from 'tls';
import { Serializer } from '../serializer';
import type { Packet } from '../../types/dns';
import { Network, NetworkHandler, SupportedNetworkType, Connection, SSLConfig } from './net';
import { DNSRequest } from '../../types';
import { encode, streamEncode, streamDecode } from './dns';

/**
 * Serializer for the TCP protocol.  Uses the built-in zero-copy DNS codec.
 */
export class TCPSerializer implements Serializer<Packet> {
  encode(packet: Packet): Buffer {
    return streamEncode(packet);
  }

  decode(buffer: Buffer): Packet {
    return streamDecode(buffer);
  }
}

export interface DNSOverTCPProps {
  address: string;
  port: number;
  ssl?: SSLConfig;
  serializer?: TCPSerializer;
  maxConnections?: number;
  keepAlive?: boolean;
  timeout?: number;
}

/**
 * DNSOverTCP is a network interface for handling DNS requests over TCP.
 */
export class DNSOverTCP implements Network<Packet> {
  public address: string;
  public port: number;
  public server: net.Server | tls.Server;
  private ssl?: SSLConfig;
  public serializer: TCPSerializer;
  public networkType: SupportedNetworkType.TCP | SupportedNetworkType.TLS;
  public handler?: NetworkHandler;
  public maxConnections: number;
  public keepAlive: boolean;
  public timeout: number;

  constructor({
    address,
    port,
    ssl,
    serializer,
    maxConnections = Infinity,
    keepAlive = true,
    timeout = 1000,
  }: DNSOverTCPProps) {
    this.address = address;
    this.port = port;
    this.maxConnections = maxConnections;
    this.keepAlive = keepAlive;
    this.timeout = timeout;

    this.server = ssl ? tls.createServer({ key: ssl.key, cert: ssl.cert }) : net.createServer();
    this.serializer = serializer || new TCPSerializer();
    this.networkType = ssl ? SupportedNetworkType.TLS : SupportedNetworkType.TCP;
    this.server.maxConnections = this.maxConnections;
    this.server.on(ssl ? 'secureConnection' : 'connection', (socket: net.Socket) => {
      const startTime = process.hrtime.bigint();
      const startTimeMs = Date.now();
      socket.setNoDelay(true);
      socket.setKeepAlive(this.keepAlive);
      socket.setTimeout(this.timeout);
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

          // Zero-copy path: skip the 2-byte length prefix, then pass the raw DNS buffer
          // directly to DNSRequest so PacketWrapper can read the header lazily.
          const dnsBuffer = data.subarray(2);
          const request = new DNSRequest(dnsBuffer, this.toConnection(socket));
          request.metadata.ts.requestTimeNs = startTime; // override the request time with the time the request was received
          request.metadata.ts.requestTimeMs = startTimeMs; // override the request time with the time the request was received
          const response = await this.handler(request);
          if (!socketEnded) {
            socket.write(new Uint8Array(this.serializer.encode(response.packet.raw)), (err) => {
              if (err) {
                endSocket(err);
              }
              response.metadata.ts.responseTimeNs = process.hrtime.bigint();
              response.metadata.ts.responseTimeMs = Date.now();
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
    });
  }

  async listen(callback?: () => void): Promise<void> {
    this.server.listen(this.port, this.address, callback);
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
