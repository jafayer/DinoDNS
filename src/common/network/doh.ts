import http2 from 'http2';
import { Network, NetworkHandler, SupportedNetworkType, Connection } from './net';
import { EventEmitter } from 'events';
import { DNSPacketSerializer } from '../serializer';
import dnsPacket from 'dns-packet';
import { DNSRequest } from '../../types';

export interface SSLProps {
  key: string;
  cert: string;
}

export interface DoHProps {
  address: string;
  httpPort?: number;
  httpsPort?: number;
  ssl?: SSLProps;
}

/**
 * DNSOverHTTP is a network interface for handling DNS requests over HTTP(S).
 */
export class DNSOverHTTP extends EventEmitter implements Network<dnsPacket.Packet> {
  public httpServer?: http2.Http2Server;
  public httpsServer?: http2.Http2SecureServer;
  public serializer: DNSPacketSerializer = new DNSPacketSerializer();
  public networkType: SupportedNetworkType = SupportedNetworkType.HTTP;
  public handler?: NetworkHandler<dnsPacket.Packet>;

  constructor(public props: DoHProps) {
    super();

    if (props.httpPort) {
      this.httpServer = http2.createServer();
      setupServer(this.httpServer, this);
    }

    if (props.httpsPort) {
      if (!props.ssl) {
        throw new Error('SSL properties are required for HTTPS server');
      }
      this.httpsServer = http2.createSecureServer({
        key: props.ssl.key,
        cert: props.ssl.cert,
      });
      setupServer(this.httpsServer, this);
    }
  }

  async listen(callback?: () => void): Promise<void> {
    if (this.httpServer) {
      this.httpServer.listen(this.props.httpPort, this.props.address);
    }

    if (this.httpsServer) {
      this.httpsServer.listen(this.props.httpsPort, this.props.address);
    }

    if (callback) {
      callback();
    }
  }

  async close(): Promise<void> {
    if (this.httpServer) {
      this.httpServer.close();
    }

    if (this.httpsServer) {
      this.httpsServer.close();
    }
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
        request.metadata.ts.requestReceived = process.hrtime.bigint();
        const response = await doh.handler(packet, doh.toConnection(stream));
        const body = doh.serializer.encode(response.packet.raw);
        stream.respond({
          ':status': 200,
          'Content-Type': 'application/dns-message',
          'Content-Length': body.length,
        });
        stream.end(body);
        response.emit('sent', process.hrtime.bigint());
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
