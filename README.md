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

## Docs

Docs are available at [dinodns.dev](https://dinodns.dev). API documentation will be made available separately soon, though we are still working on finalizing the API so exact specifications are subject to change. If you want the API spec sooner, you can clone this repo and run `npm run docs:build && npm run docs:serve` to generate and serve the API docs.

## Purpose

DinoDNS is an event-based, pure-TypeScript DNS server authoring framework.

Unlike most other DNS servers, it is not a standalone application — instead, it is meant to provide a convenient, familiar API to lower the bar for authoring efficient, scalable, bespoke DNS servers.

If you're comfortable with the Express API, you should feel right at home with DinoDNS.

## Usage

DinoDNS embraces the Express-style method of defining handlers for your application. You simply create a server, define your network interfaces and handlers, and the rest is handled by the router.

Middleware are registered using a familiar syntax:

```typescript
server.use((req, res, next) => {...});
```

And handlers are registered similarly, the server's `handle` method. For handlers, you must also pass in the domain string you wish to match against. Wildcards are supported, and match the entire leftmost portion of the domain (that is, `*.test.com` will match any level subdomain).

```typescript
server.handle('example.com', (req, res) => {...})
```

A complete, working "hello world" application is defined below:

```typescript
import { DefaultServer, DNSOverTCP, DNSOverUDP } from 'dinodns';

const server = new DefaultServer({
  networks: [new DNSOverTCP('0.0.0.0', 1053), new DNSOverUDP('0.0.0.0', 1053)],
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

### Answer types

- OPT answers are currently unsupported
