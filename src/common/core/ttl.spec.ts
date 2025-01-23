import { record, parseData } from './ttl';

describe('parseData', () => {
  it('should parse A record data correctly', () => {
    const result = parseData('A', '127.0.0.1');
    expect(result).toBe('127.0.0.1');
  });

  it('should parse AAAA record data correctly', () => {
    const result = parseData('AAAA', '::1');
    expect(result).toBe('::1');
  });

  it('should parse CNAME record data correctly', () => {
    const result = parseData('CNAME', 'example.com');
    expect(result).toBe('example.com');
  });

  it('should parse PTR record data correctly', () => {
    const result = parseData('PTR', 'example.com');
    expect(result).toBe('example.com');
  });

  it('should parse TXT record data correctly', () => {
    const result = parseData('TXT', 'v=spf1 include:_spf.example.com ~all');
    expect(result).toBe('v=spf1 include:_spf.example.com ~all');
  });

  it('should parse MX record data correctly', () => {
    const result = parseData('MX', '10 mail.example.com');
    expect(result).toEqual({ priority: 10, exchange: 'mail.example.com' });
  });

  it('should parse SRV record data correctly', () => {
    const result = parseData('SRV', '10 20 80 example.com');
    expect(result).toEqual({ priority: 10, weight: 20, port: 80, target: 'example.com' });
  });

  it('should parse SOA record data correctly', () => {
    const result = parseData('SOA', 'ns.example.com hostmaster.example.com 2021010101 7200 3600 1209600 3600');
    expect(result).toEqual({
      mname: 'ns.example.com',
      rname: 'hostmaster.example.com',
      serial: 2021010101,
      refresh: 7200,
      retry: 3600,
      expire: 1209600,
      minimum: 3600,
    });
  });

  // it('should parse NAPTR record data correctly', () => {
  //   const result = parseData('NAPTR', '100 10 "U" "E2U+sip" "!^.*$!sip:customer-service@example.com!" .');
  //   expect(result).toEqual({
  //     order: 100,
  //     preference: 10,
  //     flags: '"U"',
  //     service: '"E2U+sip"',
  //     regexp: '"!^.*$!sip:customer-service@example.com!"',
  //     replacement: '.',
  //   });
  // });
});

describe('record', () => {
  it('parses a record with TTL', () => {
    const result = record`example.com. 300 IN A 127.0.0.1`;
    expect(result).toEqual({
      name: 'example.com.',
      type: 'A',
      class: 'IN',
      ttl: 300,
      data: '127.0.0.1',
    });
  });

  it('parses a record without TTL', () => {
    const result = record`example.com. IN A 127.0.0.1`;
    expect(result).toEqual({
      name: 'example.com.',
      type: 'A',
      class: 'IN',
      ttl: 300,
      data: '127.0.0.1',
    });
  });

  it('parses an MX record', () => {
    const result = record`example.com. 300 IN MX 10 mail.example.com.`;
    expect(result).toEqual({
      name: 'example.com.',
      type: 'MX',
      class: 'IN',
      ttl: 300,
      data: {
        priority: 10,
        exchange: 'mail.example.com.',
      },
    });
  });

  it('parses an SRV record', () => {
    const result = record`example.com. 300 IN SRV 10 20 30 target.example.com.`;
    expect(result).toEqual({
      name: 'example.com.',
      type: 'SRV',
      class: 'IN',
      ttl: 300,
      data: {
        priority: 10,
        weight: 20,
        port: 30,
        target: 'target.example.com.',
      },
    });
  });

  it('parses a SOA record', () => {
    const result = record`example.com. 300 IN SOA ns.example.com. hostmaster.example.com. 2021010101 3600 1800 1209600 300`;
    expect(result).toEqual({
      name: 'example.com.',
      type: 'SOA',
      class: 'IN',
      ttl: 300,
      data: {
        mname: 'ns.example.com.',
        rname: 'hostmaster.example.com.',
        serial: 2021010101,
        refresh: 3600,
        retry: 1800,
        expire: 1209600,
        minimum: 300,
      },
    });
  });

  it('parses a record with tab-delimited data', () => {
    const result = record`example.com.\t300\tIN\tA\t127.0.0.1`;
    expect(result).toEqual({
      name: 'example.com.',
      type: 'A',
      class: 'IN',
      ttl: 300,
      data: '127.0.0.1',
    });
  });

  it('parses a line inserted into a template string', () => {
    const line = 'example.com. 300 IN A 127.0.0.1';
    const result = record`${line}`;
    expect(result).toEqual({
      name: 'example.com.',
      type: 'A',
      class: 'IN',
      ttl: 300,
      data: '127.0.0.1',
    });
  });

  it('parses many records from a newline-delimited zonefile', () => {
    const zonefile = `
            example.com. 300 IN A 127.0.0.1
            example.com. 300 IN MX 10 mail.example.com.
            example.com. 300 IN SRV 10 20 30 target.example.com.
            example.com. 300 IN SOA ns.example.com. hostmaster.example.com. 2021010101 3600 1800 1209600 300`;
    const results = zonefile
      .split('\n')
      .map((i) => i.trim())
      .filter((line) => line)
      .map((line) => record`${line}`);
    expect(results).toEqual([
      {
        name: 'example.com.',
        type: 'A',
        class: 'IN',
        ttl: 300,
        data: '127.0.0.1',
      },
      {
        name: 'example.com.',
        type: 'MX',
        class: 'IN',
        ttl: 300,
        data: {
          priority: 10,
          exchange: 'mail.example.com.',
        },
      },
      {
        name: 'example.com.',
        type: 'SRV',
        class: 'IN',
        ttl: 300,
        data: {
          priority: 10,
          weight: 20,
          port: 30,
          target: 'target.example.com.',
        },
      },
      {
        name: 'example.com.',
        type: 'SOA',
        class: 'IN',
        ttl: 300,
        data: {
          mname: 'ns.example.com.',
          rname: 'hostmaster.example.com.',
          serial: 2021010101,
          refresh: 3600,
          retry: 1800,
          expire: 1209600,
          minimum: 300,
        },
      },
    ]);
  });
});
