import { DNSRequest, DNSResponse, NextFunction } from '../../types/server';
import { Network } from '../network';
import { Handler } from '../../types/server';
import { DefaultRouter, Router } from '../router';
import dnsPacket from 'dns-packet';
import cluster from 'cluster';
import os from 'os';

export interface DNSServer<PacketType> {
  networks: Network<PacketType>[];

  default(req: DNSRequest, res: DNSResponse, next: NextFunction): void;

  handle(domain: string, handler: Handler): void;
  use(handler: Handler): void;

  start(callback: () => void): void;
  stop(): void;
}

export type DefaultServerProps<PacketType> = {
  /** Defines one or more network interfaces for the DNS Server */
  networks: Network<PacketType>[];

  /** Defines the router used by the DNS Server to resolve qnames to a handler chain */
  router?: Router;

  /** The default handler used if no handler answers the query. Default behavior is NXDOMAIN response. */
  defaultHandler?: Handler;

  /** Whether the server should run multithreaded in cluster mode.
   *
   * For more information, see the nodejs docs on [cluster mode](https://nodejs.org/api/cluster.html)
   */
  multithreaded?: boolean;
};

/**
 * DefaultServer is the main server class.
 *
 * It is responsible for handling incoming DNS requests
 * and routing them to the appropriate handler(s).
 *
 * DefaultServer is extensible and can be configured with
 * custom middlewares, handlers, routers, loggers, networks, and caches.
 */
export class DefaultServer implements DNSServer<dnsPacket.Packet> {
  public networks: Network<dnsPacket.Packet>[] = [];
  private router: Router;
  public multithreaded: boolean;

  constructor({
    networks,
    router = new DefaultRouter(),
    multithreaded = false,
    defaultHandler,
  }: DefaultServerProps<dnsPacket.Packet>) {
    this.networks = networks;
    this.router = router;
    this.multithreaded = multithreaded;

    if (defaultHandler) {
      this.default = defaultHandler;
    }

    for (const network of this.networks) {
      network.handler = async (req) => {
        const res: DNSResponse = req.toAnswer();
        return await new Promise<DNSResponse>((resolve) => {
          res.once('answer', (res) => {
            resolve(res);
          });

          this.handleQueries(req, res);
        });
      };
    }
  }

  use(handler: Handler) {
    this.router.use(handler);
  }

  /**
   * HandleQueries is the main route handler. It first connects all middleware functions,
   * and any functions that match the domain name in the request to a chain of handlers.
   *
   * It does so by creating a function that calls each middleware with the next middleware
   * set as the current middleware's next function. This allows each middleware to call the
   * next middleware in the chain.
   *
   * It then creates a chain of handlers that match the domain name in the request. Finally,
   * it connects the middleware chain to the handler chain by setting the last middleware's
   * next function to the first handler in the handler chain.
   *
   * If no handlers match the domain name in the request, the default handler is called.
   *
   * @param req
   * @param res
   * @returns
   */
  handleQueries(req: DNSRequest, res: DNSResponse): void {
    const name = req.packet.questions?.[0]?.name;
    if (!name) {
      return res.errors.refused();
    }
    const handlers = this.router.match(name);

    handlers(req, res, (err?: Error) => {
      if (err) {
        console.error(err);
      }

      if (!res.finished) {
        this.default(req, res, (err) => {
          if (err) {
            console.error(err);
          }
        });
      }
    });

    // unsure if this is really a consideration, but
    // make sure all subscribers to res are removed
    // so it can be garbage collected properly
    res.removeAllListeners();
  }

  default(req: DNSRequest, res: DNSResponse, next: NextFunction): void {
    res.errors.nxDomain();

    next(); // typically used for error handling
  }

  handle(domain: string, handler: Handler): void {
    this.router.handle(domain, handler);
  }

  start(callback?: () => void): void {
    if (this.multithreaded && cluster.isPrimary) {
      const numCpus = os.cpus().length;

      for (let i = 0; i < numCpus; i++) {
        cluster.fork();
      }

      cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died, exiting with code ${code} and signal ${signal}`);
        console.log('respawning worker...');
        cluster.fork(); // respawn worker
      });
    } else {
      for (const network of this.networks) {
        network.listen();
      }

      if (callback) {
        callback();
      }
    }
  }

  stop(): void {
    for (const network of this.networks) {
      network.close();
    }
  }

  resolveWildcard(domain: string) {
    return domain.replace(/\*/g, '.*');
  }
}
