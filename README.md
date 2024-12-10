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

## Purpose

DinoDNS is an event-based, pure-TypeScript DNS server framework.

Unlike most other DNS servers, it is not a standalone application — instead, it is meant to provide a convenient, familiar API to lower the bar for authoring efficient, scalable, bespoke DNS servers.

If you're comfortable with the Express API, you should feel right at home with DinoDNS.

## Docs

Docs are available at [dinodns.dev](https://dinodns.dev). [API documentation](https://api.dinodns.dev) is also separately available.

## Usage

DinoDNS embraces the Express-style method of defining handlers for your application. You simply create a server, define your middleware and handlers, and the rest is handled by the router.

Middleware are registered using a familiar syntax:

```typescript
server.use((req, res, next) => {...});
```

And handlers are registered similarly, the server's `handle` method. For handlers, you must also pass in the domain string you wish to match against. Wildcards are supported, and match in accordance with [RFC 1034](https://datatracker.ietf.org/doc/html/rfc1034#section-4.3.3).

```typescript
server.handle('example.com', (req, res) => {...})
```

A complete, working "hello world" application is defined below:

```typescript
import { DefaultServer, DNSOverTCP, DNSOverUDP } from 'dinodns/common';

const server = new DefaultServer({
  networks: [new DNSOverTCP({ address: '0.0.0.0', port: 1053 }), new DNSOverUDP({ address: '0.0.0.0', port: 1053 })],
});

server.handle('example.com', (req, res) => {
  const { type } = req.packet.questions[0];
  switch (type) {
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

- EDNS
- TCP packet fragmentation
