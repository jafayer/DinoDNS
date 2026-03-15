#!/usr/bin/env node
/**
 * generate-domains.js
 *
 * Generates random domain names and associated records for load testing.
 *
 * Usage:
 *   node generate-domains.js [--count 100] [--output-dir ./output]
 *
 * Outputs (written to --output-dir):
 *   dinodns-records.txt  - "name A ip" lines loaded into DinoDNS at boot
 *   db.example.com       - RFC 1035 zone file for CoreDNS
 *   Corefile             - CoreDNS Corefile referencing the zone file
 *   dnsperf.txt          - DNSperf query file (50 % NOERROR + 50 % NXDOMAIN)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function argValue(flag, defaultValue) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : defaultValue;
}

const count = parseInt(argValue('--count', '100'), 10);
const outputDir = argValue('--output-dir', './output');

if (!Number.isInteger(count) || count < 1) {
  console.error('--count must be a positive integer');
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function randomLabel() {
  return crypto.randomBytes(8).toString('hex');
}

function randomDomain() {
  return `${randomLabel()}.example.com`;
}

function randomIP() {
  // Use 10.x.x.x range so addresses are clearly synthetic
  const b = () => Math.floor(Math.random() * 256);
  return `10.${b()}.${b()}.${b()}`;
}

// ---------------------------------------------------------------------------
// Generate records
// ---------------------------------------------------------------------------
const validDomains = Array.from({ length: count }, () => ({
  name: randomDomain(),
  ip: randomIP(),
}));

// Extra domains that will NOT be added to any server → 100 % NXDOMAIN rate
const nxDomains = Array.from({ length: count }, () => randomDomain());

// ---------------------------------------------------------------------------
// Write DinoDNS records file
// One record per line: "<fqdn> A <ip>"
// ---------------------------------------------------------------------------
const dinoLines = validDomains.map(({ name, ip }) => `${name} A ${ip}`);
fs.writeFileSync(path.join(outputDir, 'dinodns-records.txt'), dinoLines.join('\n') + '\n');

// ---------------------------------------------------------------------------
// Write CoreDNS zone file  (RFC 1035 format)
// ---------------------------------------------------------------------------
let zoneFile =
  `$ORIGIN example.com.\n` +
  `$TTL 60\n` +
  `@ IN SOA ns1.example.com. admin.example.com. 2024010101 3600 900 604800 60\n` +
  `@ IN NS ns1.example.com.\n` +
  `ns1 IN A 127.0.0.1\n`;

for (const { name, ip } of validDomains) {
  // name is already "label.example.com" — strip the zone suffix
  const label = name.replace(/\.example\.com$/, '');
  zoneFile += `${label} IN A ${ip}\n`;
}

fs.writeFileSync(path.join(outputDir, 'db.example.com'), zoneFile);

// ---------------------------------------------------------------------------
// Write CoreDNS Corefile
// ---------------------------------------------------------------------------
const corefile = `example.com {
    file /etc/coredns/db.example.com
    log
    errors
}

. {
    forward . 8.8.8.8 8.8.4.4
    log
    errors
}
`;
fs.writeFileSync(path.join(outputDir, 'Corefile'), corefile);

// ---------------------------------------------------------------------------
// Write DNSperf query file
// Interleave valid (NOERROR) and invalid (NXDOMAIN) queries → 50 / 50 split
// Each line: "<fqdn> <qtype>"
// ---------------------------------------------------------------------------
const dnsperfLines = [];
for (let i = 0; i < count; i++) {
  dnsperfLines.push(`${validDomains[i].name} A`);
  dnsperfLines.push(`${nxDomains[i]} A`);
}
fs.writeFileSync(path.join(outputDir, 'dnsperf.txt'), dnsperfLines.join('\n') + '\n');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`Generated ${count} NOERROR + ${count} NXDOMAIN queries.`);
console.log(`Output written to: ${outputDir}/`);
console.log(`  dinodns-records.txt  (${validDomains.length} A records)`);
console.log(`  db.example.com       (CoreDNS zone file)`);
console.log(`  Corefile             (CoreDNS configuration)`);
console.log(`  dnsperf.txt          (${dnsperfLines.length} query lines)`);
