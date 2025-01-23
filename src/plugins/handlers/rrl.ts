import { Handler } from '../../types';

/** Configuration for the RRL plugin */
export interface RRLConfig {
  /** The maximum number of requests a client can send in the window */
  limit: number;
  /** The window in milliseconds */
  interval: number;
}

/**
 * Response Rate Limiter.
 *
 * The RRL plugin takes two parameters, `limit` and `interval`, which define
 * the maximum number of requests that can be made in the given interval of time in milliseconds.
 *
 * The RRL plugin will window the requests and if the limit is exceeded, the plugin will
 * respond with a REFUSED response.
 */
export class RRL {
  private ips = new Map<string, number>();
  private limit: number;
  private interval: number;

  constructor({ limit = 10, interval = 1000 }: RRLConfig) {
    this.limit = limit;
    this.interval = interval;
    this.handler = this.handler.bind(this);
  }

  increment(ip: string) {
    const count = this.ips.get(ip) || 0;
    this.ips.set(ip, count + 1);
  }

  decrement(ip: string) {
    const count = this.ips.get(ip) || 0;
    if (count > 0) {
      this.ips.set(ip, count - 1);
    }
  }

  handler: Handler = async (req, res, next) => {
    const ip = req.connection.remoteAddress;
    this.increment(ip);

    setTimeout(() => {
      this.decrement(ip);
    }, this.interval);

    const count = this.ips.get(ip) || 0;
    if (count > this.limit) {
      res.errors.refused();
    }

    next();
  };
}
