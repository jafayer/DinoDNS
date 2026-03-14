import express from 'express';
import http from 'http';
import https from 'https';
import { Network, NetworkHandler, SupportedNetworkType, Connection, SSLConfig } from './net';
import { EventEmitter } from 'events';
import { DNSPacketSerializer } from '../serializer';
import dnsPacket from 'dns-packet';
import { DNSRequest } from '../../types';

export interface DNSOverHTTPProps {
  address: string;
  port: number;
  ssl?: SSLConfig;
  maxConnections?: number;
}

/**
 * DNSOverHTTP is a network interface for handling DNS requests over HTTP(S).
 *
 * It uses Express to handle incoming HTTP requests and route them to the
 * appropriate DNS handler.
 */
export class DNSOverHTTP extends EventEmitter implements Network<dnsPacket.Packet> {
  public address: string;
  public port: number;
  private ssl?: SSLConfig;
  public app: express.Application;
  public server: http.Server | https.Server;
  public serializer: DNSPacketSerializer = new DNSPacketSerializer();
  public networkType: SupportedNetworkType.HTTP | SupportedNetworkType.HTTPS;
  public handler?: NetworkHandler;
  public maxConnections: number;

  constructor({ address, port, ssl, maxConnections = Infinity }: DNSOverHTTPProps) {
    super();

    this.address = address;
    this.port = port;
    this.ssl = ssl;
    this.maxConnections = maxConnections;
    this.networkType = ssl ? SupportedNetworkType.HTTPS : SupportedNetworkType.HTTP;

    this.app = express();
    this.app.use('/dns-query', express.raw({ type: 'application/dns-message' }));

    this.server = ssl
      ? https.createServer({ key: ssl.key, cert: ssl.cert }, this.app)
      : http.createServer(this.app);

    if (isFinite(maxConnections)) {
      this.server.maxConnections = maxConnections;
    }

    setupRoutes(this.app, this);
  }

  async listen(callback?: () => void): Promise<void> {
    this.server.listen(this.port, this.address, callback);
  }

  async close(): Promise<void> {
    this.server.close();
  }

  toConnection(req: express.Request): Connection {
    return {
      remoteAddress: req.socket?.remoteAddress || req.ip || '',
      remotePort: req.socket?.remotePort || 0,
      type: this.networkType,
    };
  }
}

function packetFromGET(query: URLSearchParams): dnsPacket.Packet | undefined {
  const dns = query.get('dns');
  const name = query.get('name');
  const type = query.get('type');

  if (dns) {
    return dnsPacket.decode(Buffer.from(dns, 'base64url'));
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
  }

  return undefined;
}

function setupRoutes(app: express.Application, doh: DNSOverHTTP) {
  async function handleDNSRequest(
    req: express.Request,
    res: express.Response,
    packet: dnsPacket.Packet | undefined,
  ): Promise<void> {
    if (!doh.handler) {
      res.status(500).end();
      return;
    }

    if (!packet) {
      res.status(400).end();
      return;
    }

    const startTime = process.hrtime.bigint();
    const startTimeMs = Date.now();

    const request = new DNSRequest(packet, doh.toConnection(req));
    request.metadata.ts.requestTimeNs = startTime;
    request.metadata.ts.requestTimeMs = startTimeMs;

    const response = await doh.handler(request);
    const body = doh.serializer.encode(response.packet.raw);
    res.set('Content-Type', 'application/dns-message');
    res.set('Content-Length', String(body.length));
    res.status(200).send(body);

    response.metadata.ts.responseTimeNs = process.hrtime.bigint();
    response.metadata.ts.responseTimeMs = Date.now();
    response.emit('done', response);
    response.removeAllListeners();
  }

  app.get('/dns-query', async (req: express.Request, res: express.Response) => {
    if (!doh.handler) {
      res.status(500).end();
      return;
    }

    try {
      const query = new URLSearchParams(req.url.split('?')[1] ?? '');
      const packet = packetFromGET(query);
      await handleDNSRequest(req, res, packet);
    } catch (err) {
      console.error(err);
      res.status(500).end();
    }
  });

  app.post('/dns-query', async (req: express.Request, res: express.Response) => {
    if (!doh.handler) {
      res.status(500).end();
      return;
    }

    try {
      const body = req.body as Buffer;
      const packet = Buffer.isBuffer(body) ? doh.serializer.decode(body) : undefined;
      await handleDNSRequest(req, res, packet);
    } catch (err) {
      console.error(err);
      res.status(500).end();
    }
  });
}
