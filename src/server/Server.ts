import { DNSRequest, DNSResponse } from "./types";
import { Network } from "../common/network";
import { Handler } from "./types";
import { DefaultRouter, Router } from "../common/router";

export interface Server {
    networks: Network<any, any>[];
    cache?: any;

    default(req: DNSRequest, res: DNSResponse): void;

    handle(domain: string, handler: Handler): void;

    start(callback: Function): void;
    stop(): void;
}

type DNSServerProps = {
    networks: Network<any, any>[];
    cache: any;
    logger?: Handler;
    router?: Router
}

/**
 * DNSServer is the main server class.
 * 
 * It is responsible for handling incoming DNS requests
 * and routing them to the appropriate handler(s).
 * 
 * DNSServer is extensible and can be configured with
 * custom middlewares, handlers, routers, loggers, networks, and caches.
 */
export class DNSServer implements Server {
    public networks: Network<any, any>[] = [];
    public cache: any = {};
    private logger?: Handler;
    private router: Router;

    constructor(props: DNSServerProps) {
        this.networks = props.networks;
        this.cache = props.cache;
        this.logger = props.logger;
        this.router = props.router || new DefaultRouter();

        for(const network of this.networks) {
            network.handler = async (packet, connection) => {
                const req = new DNSRequest(packet, connection);
                const res: DNSResponse = req.toAnswer();
                
                return await new Promise<DNSResponse>((resolve, reject) => {
                    res.once("done", (t) => {
                        if(this.logger) {
                            this.logger(req, res, () => {});
                        }
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
        if(!name) {
            return res.errors.refused();
        }
        const handlers = this.router.match(name);
        return handlers(req, res, () => {});
    }

    default(req: DNSRequest, res: DNSResponse): void {
        // to be implemented
        res.errors.notImplemented();
    }

    handle(domain: string, handler: Handler): void {
        this.router.handle(domain, handler);
    }

    start(callback: Function): void {
        for(const network of this.networks) {
            network.listen(network.address, network.port, () => {
                console.log(`Listening over ${network.networkType} on ${network.address}:${network.port}`);
            });
        }

        callback();
    }

    stop(): void {
        for(const network of this.networks) {
            network.close();
        }
    }

    resolveWildcard(domain: string) {
        return domain.replace(/\*/g, '.*');
    }
}