import express from 'express';
import { Router } from './router';
import { Handler, DNSRequest, DNSResponse, NextFunction } from '../../types/server';
import { domainToRegexp } from '../core/domainToRegexp';

/**
 * ExpressRouter leverages express.Router() as the handler chain execution engine,
 * providing a battle-tested middleware pipeline for DNS request processing.
 *
 * Middleware registered via `use()` runs for every request. Handlers registered
 * via `handle()` run only when the incoming query name matches the given domain pattern.
 */
export class ExpressRouter implements Router {
  private router: express.Router;

  constructor() {
    this.router = express.Router();
  }

  use(handler: Handler): void {
    this.router.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      const dnsNext: NextFunction = (err?: Error) => {
        if (err) {
          console.error(err);
        }
        next();
      };
      try {
        handler(this.extractDNSRequest(req), this.extractDNSResponse(res), dnsNext);
      } catch (e) {
        console.error(e);
        next();
      }
    });
  }

  handle(domain: string, handler: Handler): void {
    const match = domainToRegexp(domain);
    this.router.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      const dnsReq = this.extractDNSRequest(req);
      const name = dnsReq?.packet?.questions?.[0]?.name;
      if (name && match.regexp.test(name)) {
        const dnsNext: NextFunction = (err?: Error) => {
          if (err) {
            console.error(err);
          }
          next();
        };
        try {
          handler(dnsReq, this.extractDNSResponse(res), dnsNext);
        } catch (e) {
          console.error(e);
          next();
        }
      } else {
        next();
      }
    });
  }

  /**
   * Returns a Handler that pipes the DNS request through the full Express middleware stack.
   *
   * The `domain` parameter is not used here because each handler registered via `handle()`
   * already performs its own domain matching. The Express router runs all layers in order,
   * and individual domain handlers skip themselves when the query name does not match.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  match(_domain: string): Handler {
    return (req: DNSRequest, res: DNSResponse, next: NextFunction) => {
      const expressReq = this.toExpressRequest(req);
      const expressRes = this.toExpressResponse(res);
      this.router(expressReq, expressRes, next as unknown as express.NextFunction);
    };
  }

  private extractDNSRequest(req: express.Request): DNSRequest {
    return (req as unknown as { __dnsRequest: DNSRequest }).__dnsRequest;
  }

  private extractDNSResponse(res: express.Response): DNSResponse {
    return (res as unknown as { __dnsResponse: DNSResponse }).__dnsResponse;
  }

  private toExpressRequest(dnsReq: DNSRequest): express.Request {
    return {
      url: '/',
      method: 'GET',
      headers: {},
      __dnsRequest: dnsReq,
    } as unknown as express.Request;
  }

  private toExpressResponse(dnsRes: DNSResponse): express.Response {
    return {
      __dnsResponse: dnsRes,
    } as unknown as express.Response;
  }
}
