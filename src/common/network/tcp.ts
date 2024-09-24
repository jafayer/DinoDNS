import net from "net";
import { Serializer } from "../dns";
import dnsPacket from "dns-packet";
import { Network, NetworkHandler, SupportedNetworkType, Connection} from "./net";


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


export class DNSOverTCP implements Network<dnsPacket.Packet, net.Socket> {
    private server: net.Server;
    public serializer: TCPSerializer;
    public networkType: SupportedNetworkType = SupportedNetworkType.TCP;

    constructor(public address: string, public port: number, public handler?: NetworkHandler<dnsPacket.Packet>) {
        this.server = net.createServer();
        this.serializer = new TCPSerializer();

    this.server.on('connection', (socket) => {
      if (!this.handler) {
        throw new Error('No handler defined for DNSOverTCP');
      }

      socket.on('data', async (data) => {
        if (!this.handler) {
          throw new Error('No handler defined for DNSOverTCP');
        }
        const packet = dnsPacket.streamDecode(data);
        const resp = await this.handler(packet, this.toConnection(socket));
        socket.write(new Uint8Array(this.serializer.encode(resp.packet)));
      });

      socket.on('end', () => {
        socket.end();
      });
    });
  }

  async listen(address?: string, port?: number, callback?: () => void): Promise<void> {
    this.server.listen(port || this.port, address || this.address, callback);

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
      ts: Date.now(),
    };
  }
}
