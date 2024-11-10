import http2 from 'http2';
import { Network, NetworkHandler, SupportedNetworkType, Connection, SSLConfig } from './net';
import { EventEmitter } from 'events';
import { DNSPacketSerializer } from '../serializer';
import dnsPacket from 'dns-packet';
import { DNSRequest } from '../../types';

export interface DoHProps {
  address: string;
  port: number;
  ssl?: SSLConfig;
}

/**
 * DNSOverHTTP is a network interface for handling DNS requests over HTTP(S).
 */
export class DNSOverHTTP extends EventEmitter implements Network<dnsPacket.Packet> {
  public address: string;
  public port: number;
  private ssl?: SSLConfig;
  public server: http2.Http2Server;
  public serializer: DNSPacketSerializer = new DNSPacketSerializer();
  public networkType: SupportedNetworkType.HTTP | SupportedNetworkType.HTTPS;
  public handler?: NetworkHandler;

  constructor({ address, port, ssl }: DoHProps) {
    super();

    this.address = address;
    this.port = port;
    this.ssl = ssl;
    this.server = ssl ? http2.createSecureServer({ key: ssl.key, cert: ssl.cert }) : http2.createServer();

    this.networkType = ssl ? SupportedNetworkType.HTTPS : SupportedNetworkType.HTTP;

    setupServer(this.server, this);
  }

  async listen(callback?: () => void): Promise<void> {
    this.server.listen(this.port, callback);
  }

  async close(): Promise<void> {
    this.server.close();
  }

  toConnection(stream: http2.Http2Stream): Connection {
    return {
      remoteAddress: stream.session?.socket.remoteAddress || '',
      remotePort: stream.session?.socket.remotePort || 0,
      type: SupportedNetworkType.HTTP,
    };
  }
}

function packetFromGET(headers: http2.IncomingHttpHeaders) {
  if (!headers[':path']) {
    return;
  }

  const queryString = new URLSearchParams(headers[':path'].split('?')[1]);
  return constructPacketFromQuery(queryString);
}

function constructPacketFromQuery(query: URLSearchParams): dnsPacket.Packet | undefined {
  const dns = query.get('dns');
  const name = query.get('name');
  const type = query.get('type');

  if (dns) {
    return dnsPacket.decode(Buffer.from(dns, 'base64'));
  } else if (name && type) {
    return {
      type: 'query',
      id: 0,
      flags: 0,
      questions: [
        {
          type: type as dnsPacket.RecordType,
          class: 'IN',
          name,
        },
      ],
    };
  } else {
    return;
  }
}

function setupServer(server: http2.Http2Server | http2.Http2SecureServer, doh: DNSOverHTTP) {
  server.on('error', (err) => {
    console.error(err);
  });

  server.on('stream', (stream, headers) => {
    const startTime = process.hrtime.bigint();
    const startTimeMs = Date.now();

    if (!doh.handler) {
      throw new Error('No handler defined for DNSOverHTTP');
    }

    let data = Buffer.alloc(0);
    stream.on('data', (chunk) => {
      data = Buffer.concat([data, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    });

    stream.on('end', async () => {
      if (!doh.handler) {
        throw new Error('No handler defined for DNSOverHTTP');
      }

      // respond only on /dns-query
      if (!headers[':path']?.startsWith('/dns-query')) {
        stream.respond({
          ':status': 404,
        });
        stream.end();
        return;
      }

      try {
        let packet: dnsPacket.Packet | undefined;
        switch (headers[':method']) {
          case 'GET': {
            packet = packetFromGET(headers);
            break;
          }
          case 'POST': {
            packet = doh.serializer.decode(data);
            break;
          }
          default: {
            // unsupported method
            break;
          }
        }

        if (!packet) {
          stream.respond({
            ':status': 400,
          });
          stream.end();
          return;
        }
        const request = new DNSRequest(packet, doh.toConnection(stream));
        request.metadata.ts.requestTimeNs = startTime;
        request.metadata.ts.requestTimeMs = startTimeMs;
        const response = await doh.handler(request);
        const body = doh.serializer.encode(response.packet.raw);
        stream.respond({
          ':status': 200,
          'Content-Type': 'application/dns-message',
          'Content-Length': body.length,
        });
        stream.end(body);
        response.metadata.ts.responseTimeNs = process.hrtime.bigint();
        response.metadata.ts.responseTimeMs = Date.now();
        response.emit('done', response);
        response.removeAllListeners(); // cleanup
      } catch (err) {
        console.error(err);
        stream.respond({
          ':status': 500,
        });
        stream.end();
      }
    });

    stream.on('error', (err) => {
      console.error(err);
      stream.end();
    });
  });
}
