import { Network, NetworkHandler, SupportedNetworkType } from "./net";
import http from "http";
import { Serializer } from "../dns";
import dnsPacket from "dns-packet";
import type { Question, RecordType } from "dns-packet";
import { Connection } from "./net";


/**
 * Default serializer for the HTTP protocol. The `dns-packet` module's
 * `decode` and `encode` methods are passed directly through here.
 */
export class HTTPSerializer implements Serializer<dnsPacket.Packet> {
    decode(buffer: Buffer): dnsPacket.Packet {
        return dnsPacket.decode(buffer);
    }

    encode(packet: dnsPacket.Packet): Buffer {
        return dnsPacket.encode(packet);
    }
}

export class DNSOverHTTP implements Network<dnsPacket.Packet, http.ServerResponse> {
  serializer: Serializer<dnsPacket.Packet>;
  private server: http.Server;
  public networkType: SupportedNetworkType = SupportedNetworkType.HTTP;

    constructor(public address: string, public port: number, public handler?: NetworkHandler<dnsPacket.Packet>) {
        this.server = http.createServer();
        this.serializer = new HTTPSerializer();

    this.server.on('request', (req, res) => {
      if (!this.handler) {
        res.writeHead(501);
        res.end();
        return;
      }

      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });

      req.on('end', async () => {
        let packet: dnsPacket.Packet;
        switch (req.method) {
          // get request
          case 'GET':
            // get dns query param
            const query = req.url?.split('?')[1];
            const params = new URLSearchParams(query || '');
            const dnsParam = params.get('dns');
            const type: RecordType | null = params.get('type') as RecordType | null;
            const name = params.get('name');

            if (dnsParam) {
              packet = dnsPacket.decode(Buffer.from(dnsParam, 'base64'));
            } else if (type && name) {
              // we have to construct our own packet
              const question: Question = {
                type,
                name,
              };

              packet = {
                type: 'query',
                id: 1,
                flags: dnsPacket.RECURSION_DESIRED,
                questions: [question],
              };

              packet = dnsPacket.streamDecode(this.serializer.encode(packet));
            } else {
              res.writeHead(400);
              res.end();
              return;
            }
            break;
          // post request
          case 'POST':
            packet = dnsPacket.streamDecode(Buffer.from(data, 'base64'));
            break;
          default:
            res.writeHead(400);
            res.end();
            return;
        }

                if(!this.handler) {
                    res.writeHead(501);
                    res.end();
                    return;
                }
                
                const response = await this.handler(packet, this.toConnection(res));

        res.writeHead(200, {
          'Content-Type': 'application/dns-message',
        });

        res.end(dnsPacket.encode(response.packet));
      });
    });
  }

  /**
   * Listens for incoming DNS requests on /dns-query
   *
   * @param address
   * @param port
   * @param callback
   * @returns
   */
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

  private toConnection(res: http.ServerResponse): Connection {
    return {
      remoteAddress: res.socket?.remoteAddress || '',
      remotePort: res.socket?.remotePort || 0,
      type: SupportedNetworkType.HTTP,
      ts: Date.now(),
    };
  }
}
