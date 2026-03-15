/**
 * DinoDNS load-test server entry point.
 *
 * Environment variables:
 *   RECORDS_FILE   Path to the newline-delimited records file.
 *                  Each line: "<fqdn> <type> <value>"
 *                  Default: /etc/dinodns/dinodns-records.txt
 *   DNS_PORT       UDP/TCP port to listen on. Default: 53
 *   CLUSTER_MODE   Set to "true" to enable Node.js cluster mode (one worker
 *                  per logical CPU). Default: false
 */

import { DefaultServer } from '../../../src/common/server';
import { DefaultStore } from '../../../src/plugins/storage';
import { DNSOverUDP, DNSOverTCP } from '../../../src/common/network';
import * as fs from 'fs';

const recordsFile = process.env.RECORDS_FILE ?? '/etc/dinodns/dinodns-records.txt';
const port = parseInt(process.env.DNS_PORT ?? '53', 10);
const clusterMode = process.env.CLUSTER_MODE === 'true';

const store = new DefaultStore();

// ---------------------------------------------------------------------------
// Load records from file
// ---------------------------------------------------------------------------
if (fs.existsSync(recordsFile)) {
  const lines = fs.readFileSync(recordsFile, 'utf-8').split('\n');
  let loaded = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const [name, type, ...rest] = parts;
    const value = rest.join(' ');
    store.set(name, type as Parameters<typeof store.set>[1], value);
    loaded++;
  }
  console.log(`[dinodns] Loaded ${loaded} record(s) from ${recordsFile}`);
} else {
  console.warn(`[dinodns] Records file not found: ${recordsFile}. Starting with no records.`);
}

// ---------------------------------------------------------------------------
// Create and start the server
// ---------------------------------------------------------------------------
const server = new DefaultServer({
  networks: [
    new DNSOverUDP({ address: '0.0.0.0', port }),
    new DNSOverTCP({ address: '0.0.0.0', port }),
  ],
  multithreaded: clusterMode,
});

server.use(store.handler);

server.start(() => {
  console.log(`[dinodns] Listening on port ${port} (cluster=${clusterMode})`);
});
