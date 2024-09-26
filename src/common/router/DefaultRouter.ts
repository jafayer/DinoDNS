import { Router, MatchedHandlers } from './router';
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
    return (req, res, next) => {
      let i = 0;

      const nextHandler = (err?: unknown) => {
        if (i >= handlers.length) {
          return next(err);
        }
        const handler = handlers[i++];
        try {
          handler(req, res, nextHandler);
        } catch (e: unknown) {
          if (e instanceof Error) {
            nextHandler(e);
          } else {
            nextHandler(new Error('Unknown error'));
          }
        }
      };

      nextHandler();
    };
  }
}
