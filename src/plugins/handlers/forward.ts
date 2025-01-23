import { Handler, SupportedAnswer } from '../../types';
import { SupportedNetworkType } from '../../common';
import dnsPacket from 'dns-packet';
import dgram from 'dgram';
import net from 'net';
import tls from 'tls';

/** Configuration for the Forward plugin */
export interface ForwardConfig {
  /** The address of the upstream server.
   *
   * If the protocol is UDP or TCP, this should be the IP address or hostname of the upstream server.
   *
   * Example: `127.0.0.1`.
   *
   * If the protocol is HTTP or HTTPS, this should be the host and path without the protocol or port.
   *
   * Example: `example.com/dns-query`.
   *
   * If a port is not specified, the default port for the protocol will be used.
   */
  address: string;

  /** The port of the upstream server */
  port?: number;

  /** The protocol to use for forwarding */
  protocol: SupportedNetworkType;
}

/**
 * Forward Handler.
 *
 * The Forward plugin forwards all requests to an upstream server.
 */
export class Forwarder {
  private address: string;
  private port: number;
  private protocol: SupportedNetworkType;

  constructor({ address, port, protocol }: ForwardConfig) {
    if (!port) {
      switch (protocol) {
        case SupportedNetworkType.UDP:
          port = 53;
          break;
        case SupportedNetworkType.TCP:
          port = 53;
          break;
        case SupportedNetworkType.HTTP:
          port = 80;
          break;
        case SupportedNetworkType.HTTPS:
          port = 443;
          break;
        case SupportedNetworkType.TLS:
          port = 853;
          break;
        default:
          throw new Error(`Unsupported protocol: ${protocol}`);
      }
    }

    this.address = address;
    this.port = port;
    this.protocol = protocol;
    this.handler = this.handler.bind(this);
  }

  handler: Handler = async (req, res, next) => {
    try {
      const response = await this.doRequest(req.packet.raw);
      res.answer(response.answers as SupportedAnswer[]);
      next();
    } catch (err) {
      console.error('Forwarder error:', err);
      next(err as unknown as Error);
    }
  };

  doRequest = async (req: dnsPacket.Packet): Promise<dnsPacket.Packet> => {
    switch (this.protocol) {
      case SupportedNetworkType.UDP:
        return this.doUDPRequest(req);
      case SupportedNetworkType.TCP:
        return this.doTCPRequest(req);
      case SupportedNetworkType.HTTP:
      case SupportedNetworkType.HTTPS:
        return this.doDoHRequest(req);
      case SupportedNetworkType.TLS:
        return this.doTLSQuery(req);
      default:
        throw new Error(`Unsupported protocol: ${this.protocol}`);
    }
  };

  doUDPRequest = async (req: dnsPacket.Packet): Promise<dnsPacket.Packet> => {
    const message = dnsPacket.encode(req);
    return new Promise((resolve, reject) => {
      const client = dgram.createSocket('udp4');
      client.send(message, this.port, this.address, (err) => {
        if (err) {
          reject(err);
        }
      });
      client.on('message', (msg) => {
        const packet = dnsPacket.decode(msg);
        resolve(packet);
        client.close();
      });

      client.on('error', (err) => {
        reject(err);
        client.close();
      });
    });
  };

  doTCPRequest = async (req: dnsPacket.Packet): Promise<dnsPacket.Packet> => {
    console.log('doTCPRequest');
    const message = dnsPacket.streamEncode(req);
    return new Promise((resolve, reject) => {
      const client = net.createConnection(this.port, this.address, () => {
        console.log('TCP connection established');
        client.write(message);
      });
      client.on('data', (data) => {
        console.log('Received TCP data');
        const packet = dnsPacket.streamDecode(data);
        resolve(packet);
        client.end();
      });

      client.on('error', (err) => {
        console.error('TCP error:', err);
        reject(err);
        client.end();
      });
    });
  };

  doDoHRequest = async (req: dnsPacket.Packet): Promise<dnsPacket.Packet> => {
    console.log('doDoHRequest');
    const protocol = this.protocol === SupportedNetworkType.HTTP ? 'http' : 'https';
    const uri = new URL(`${protocol}://${this.address}`);
    uri.port = this.port.toString();
    const reqUrl = uri.toString();

    console.log('Sending DoH request to', reqUrl);

    const message = dnsPacket.encode(req);
    return fetch(reqUrl, {
      method: 'POST',
      body: message,
      headers: {
        'Content-Type': 'application/dns-message',
      },
    })
      .then((res) => {
        console.log('Received DoH response');
        return res.arrayBuffer();
      })
      .then((buffer) => Buffer.from(buffer))
      .then((buffer) => dnsPacket.decode(buffer))
      .catch((err) => {
        console.error('DoH error:', err);
        throw err;
      });
  };

  doTLSQuery = async (req: dnsPacket.Packet): Promise<dnsPacket.Packet> => {
    console.log('doTLSQuery');
    const message = dnsPacket.streamEncode(req);
    return new Promise((resolve, reject) => {
      const client = tls.connect(
        {
          host: this.address,
          port: this.port,
        },
        () => {
          console.log('TLS connection established');
          client.write(message);
        },
      );
      client.on('data', (data) => {
        console.log('Received TLS data');
        const packet = dnsPacket.streamDecode(data);
        resolve(packet);
        client.end();
      });

      client.on('error', (err) => {
        console.error('TLS error:', err);
        reject(err);
        client.end();
      });
    });
  };
}
