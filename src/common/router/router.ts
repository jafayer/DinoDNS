import { HandlerMatch } from "../core/domainToRegexp";
import { Handler } from "../../server";


export interface MatchedHandlers {
    handlers: Handler[];
    match: HandlerMatch;
}
/**
 * Routers are responsible for matching requests to the request handler
 * chain and returning the matched handlers.
 * 
 * They are the internal manager of request handlers and middleware.
 */
export interface Router {
    
    /**
     * Registers a handler for a domain name
     */
    handle(domain: string, handler: Handler): void;

    /**
     * Registers a middleware function
     */
    use(handler: Handler): void;

    /**
     * Returns the handler chain for a given domain name
     */
    match(domain: string): Handler;
}