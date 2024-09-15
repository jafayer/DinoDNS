// /**
//  *  # Server

//     The server module provides an Express-like API for creating a DNS server,
//     complete with middleware and handlers. You can define handlers by
//     declaring a `server.handle` route handler where you can read data from the request, and write data to the response.

//     There are also helper methods that abstract away the raw request / response, such as `response.answer()`, which is shorthand for setting `response.answers = [answer]`;

//     ## Usage

//     ```ts
//     // Creates a server
//     const server = new Server();

//     // registers logging middleware
//     server.use(dnstap());

//     // creates a handler
//     server.handle('*.example.com', (req, res) => {
//         res.answer('1270.0.1');
//     });
//     ```
//  */

// import { Packet } from "../dns/dnslib";
// import { requestFromMessage } from "./request";
// import dgram from 'dgram';
// import { EventEmitter } from "events";
// import { DNSRequest } from "./request";
// import { RouteTrie } from "../trie/RouteTrie";
// import { RecordAnswer, AnswerMap } from "../types/dnsLibTypes";

// export type DNSHandler = (req: DNSRequest, res: DNSResponse, next: Function) => void;

// export class DNSResponse extends EventEmitter {
//     private finished: boolean = false;
//     constructor(public packet: Packet) {
//         super();
//     }

//     answer<T extends keyof AnswerMap>(data: RecordAnswer<T>) {
//         this.packet.answers?.push(data);

//         this.finished = true;

//         this.emit('finish');
//     }

//     resolve() {
//         this.finished = true;
//         this.emit('finish');
//     }
// }

// export class Server extends EventEmitter {
//     private server: dgram.Socket;
//     private middleware: DNSHandler[] = [];
//     private handlers: RouteTrie = new RouteTrie();

//     constructor() {
//         super();
//         this.server = dgram.createSocket('udp4');
//         this.server.on('message', (message, rinfo) => {
//             const req = requestFromMessage(message, rinfo);
//             const res = req.packet.responseFromQuestion();
//             this.handleRequest(req, new DNSResponse(res));
//         });
//     }

//     resolveWildcard(domain: string) {
//         return domain.replace(/\*/g, '.*');
//     }

//     /**
//      * Register a handler for a given domain.
//      * @param domain The domain to handle
//      * @param handler The handler to call when the domain is matched
//      */
//     handle(domain: string, handler: DNSHandler) {
//         this.handlers.insert(domain, handler);
//     }

//     /**
//      * Handle a request and call the appropriate handler.
//      * @param req The request to handle
//      * @param res The response to write to
//      */
//     async handleRequest(req: DNSRequest, res: DNSResponse) {
//         const domain = req.packet.questions?.at(0)?.name;
//         if (!domain) {
//             throw new Error('No domain found in request');
//         }
        
//         // assemble handler chain
//         const handlerChain = this.handlers.search(domain);
        
//         if (!handlerChain) {
//             res.packet.packet.flags = 0x0003;
//             res.resolve();
//             return;
//         }
//         console.log(handlerChain[0].toString());

//         // add middleware to handler chain
//         handlerChain.unshift(...this.middleware);

//         const wrapHandler = (req: DNSRequest, res: DNSResponse) => {
//             let index = 0;
//             const next = () => {
//                 if (index < handlerChain.length) {
//                     handlerChain[index++](req, res, next);
//                 }
//             };
//             next();
//         };

//         res.on('finish', () => {
//             console.log("sending response");
//             this.server.send(new Uint8Array(res.packet.encode()), req.connection.remotePort, req.connection.remoteAddress);
//         });


//         wrapHandler(req, res);
//     }

//     /**
//      * Use a middleware for all requests.
//      * @param handler The middleware to use
//      */
//     use(handler: DNSHandler) {
//         this.middleware.push(handler);
//     }

//     /**
//      * Start the server listening on a given port.
//      * @param port The port to listen on
//      */
//     listen(port: number, cb?: Function) {
//         this.server.bind(port);
//         this.server.on('listening', () => {
//             if (cb) {
//                 cb();
//             }
//         });
//     }
// }

// export function dnstap() {
//     return (req: DNSRequest, res: DNSResponse, next: Function) => {
//         console.log(`Request from ${req.connection.remoteAddress}`);
//         next();
//     };
// }