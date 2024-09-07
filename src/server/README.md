# Server

The server module provides an Express-like API for creating a DNS server,
complete with middleware and handlers. You can define handlers by
declaring a `server.handle` route handler where you can read data from the request, and write data to the response.

There are also helper methods that abstract away the raw request / response, such as `response.answer()`, which is shorthand for setting `response.answers = [answer]`;

## Usage

```ts
// Creates a server
const server = new Server();

// registers logging middleware
server.use(dnstap());

// creates a handler
server.handle('*.example.com', (req, res) => {
    res.answer('1270.0.1');
});
```
