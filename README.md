# DinoDNS 🦕

A pure TypeScript, modular DNS server inspired by [Express](https://expressjs.com/), [Nest.js](https://nestjs.com/), and [CoreDNS](https://coredns.io).

⚠️ **WARNING:** this framework is under active development and is in its very early days. There may be changes to the core APIs and right now no guarantees are made about its stability.

![Building](https://github.com/jafayer/DinoDNS/actions/workflows/build.yaml/badge.svg)
![Formatted](https://github.com/jafayer/DinoDNS/actions/workflows/format.yaml/badge.svg)
![Linted](https://github.com/jafayer/DinoDNS/actions/workflows/lint.yaml/badge.svg)
![Tests](https://github.com/jafayer/DinoDNS/actions/workflows/tests.yaml/badge.svg)
![Typecheck](https://github.com/jafayer/DinoDNS/actions/workflows/typecheck.yaml/badge.svg)

## Installation

`npm i --save dinodns`

## Philosophy

DinoDNS aims to be to Express what CoreDNS is to Caddy. CoreDNS made, in our view, some delightful decisions in bringing modern web server design practices to DNS software. DinoDNS aims to provide a similar experience for developers accustomed to the lightweight abstractions provided by Express APIs.

End users and plugin authors alike can simply declare a simple TypeScript route handler with the familiar `(req, res, next) => void` signature. The library handles building a plugin chain to match incoming requests to their handlers, executing those plugins (including middleware) in sequence, and returning the response to the client.

We also aim to bring to the framework the niceties of dependency injection as made popular in the TypeScript web framework world by Nest.js. DinoDNS aims to be extremely modular and extensible, allowing you to swap out everything from the network interfaces to the internal router and data serializers.

DinoDNS is not meant to be a drop-in replacement for any DNS server application; we recognize the limitations of building this type of software with a runtime like Node.js backing it. However, by some initial tests (benchmarks forthcoming), an event-driven framework like this achieves good performance in an I/O heavy use case, while allowing end users to create bespoke functionality and optimizations that end up being clunky or downright impossible with other software in this space. Additionally, DinoDNS strives to make it easy to build integrations with your backend of choice, making it easier to scale horizontally as a stateless app.

## Usage

Rather than creating a custom DSL for a declarative configuration file, DinoDNS embraces the Express-style declarative software abstraction for defining your application. You simply build the core server by passing in the parameters needed to define the infrastructure, and the rest is handled by your middleware and handlers.

Middleware are registered using a familiar syntax:

```typescript
server.use((req, res, next) => {...});
```

And handlers are registered similarly, the server's `handle` method. For handlers, you must also pass in the domain string you wish to match against. Wildcards are supported, and match the entire leftmost portion of the domain (that is, `*.test.com` will match any level subdomain):

```typescript
server.handle('example.com', (req, res) => {...})
```

A complete, working hello world application is defined below:

```typescript
import { DNSServer, DNSOverTCP, DNSOverUDP } from 'dinodns';

const server = new DNSServer({
  networks: [new DNSOverTCP('0.0.0.0', 1053), new DNSOverUDP('0.0.0.0', 1053)],
});

server.handle('example.com', (req, res) => {
  switch (req.packet.questions![0].type) {
    case 'TXT':
      return res.answer({
        name: 'example.com',
        type: 'TXT',
        class: 'IN',
        ttl: 300,
        data: 'Hello, World!',
      });
    default:
      return res.errors.notImplemented();
  }
});

server.start(() => {
  console.log('Server started');
});
```

## Unsupported features

### Answer types

* OPT answers are currently unsupported

# Roadmap

- [ ] Full documentation site up
- [ ] Construct and run benchmarks
- [ ] Build higher-level abstractions using base class
