import { Router, MatchedHandlers } from './router';
import { HandlerMatch } from '../core/domainToRegexp';
import { domainToRegexp } from '../core/domainToRegexp';
import { Handler } from '../../server';

export class DefaultRouter implements Router {
  private handlers: MatchedHandlers[] = [];
  private middleware: Handler[] = [];

  handle(domain: string, handler: Handler) {
    const match = domainToRegexp(domain);
    // search for existing handler
    const existing = this.handlers.find((h) => h.match.regexp.source === match.regexp.source);
    if (existing) {
      existing.handlers.push(handler);
      return;
    }

    this.handlers.push({
      match,
      handlers: [handler],
    });
  }

  use(handler: Handler) {
    this.middleware.push(handler);
  }

  match(domain: string) {
    const handlers: Handler[] = [];
    for (const h of this.handlers) {
      if (h.match.regexp.test(domain)) {
        handlers.push(...h.handlers);
      }
    }

    // wrap the handlers in a chain with the middleware
    return this.wrapHandlers([...this.middleware, ...handlers]);
  }

  private wrapHandlers(handlers: Handler[]): Handler {
    return (req, res) => {
      let i = 0;

      const nextHandler = () => {
        if (i >= handlers.length) {
          return;
        }
        const handler = handlers[i++];
        handler(req, res, nextHandler);
      };
      nextHandler();
    };
  }
}
