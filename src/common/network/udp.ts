import { Network, NetworkHandler, SupportedNetworkType, Connection } from './net';
import { Serializer } from '../serializer';
import dgram from 'dgram';
import dnsPacket from 'dns-packet';
import { RCode, CombineFlags } from '../core/utils';

export class UDPSerializer implements Serializer<dnsPacket.Packet> {
  encode(packet: dnsPacket.Packet): Buffer {
    return dnsPacket.encode(packet);
  }

  decode(buffer: Buffer): dnsPacket.Packet {
    return dnsPacket.decode(buffer);
  }
}

/**
 * Serializer for the UDP protocol. The `dns-packet` module's
 * `decode` and `encode` methods are passed directly through here.
 */
export class DNSOverUDP implements Network<dnsPacket.Packet> {
  private server: dgram.Socket;
  public serializer: Serializer<dnsPacket.Packet>;
  public networkType: SupportedNetworkType = SupportedNetworkType.UDP;

  constructor(
    public address: string,
    public port: number,
    public handler?: NetworkHandler<dnsPacket.Packet>,
  ) {
    this.server = dgram.createSocket('udp4');
    this.serializer = new UDPSerializer();

    this.server.on('message', async (msg, rinfo) => {
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
      this.handler(packet, this.toConnection(rinfo))
      .then((resp) => {
        this.server.send(new Uint8Array(this.serializer.encode(resp.packet.raw)), rinfo.port, rinfo.address);
      })
      .catch((err) => {
        console.error(err);
      });
    });

    this.server.on('error', (err) => {
      console.error(err);
    });
  }

  async listen(address?: string, port?: number, callback?: () => void): Promise<void> {
    this.server.bind(port || this.port, address || this.address, callback);

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
      ts: Date.now(),
    };
  }
}
