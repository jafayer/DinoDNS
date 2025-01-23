import { SupportedAnswer, SupportedRecordType, ZoneData } from '../../types';

/**
 * `record` is a tag template literal function that takes a template string and parses it
 * into a SupportedAnswer.
 *
 * You may use either spaces or tabs to separate the fields in the template string.
 *
 * As per the DNS spec, the TTL field is optional. If omitted, it will default to 300.
 *
 * Example:
 *  record`example.com. 300 IN A 127.0.0.1` => { name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '127.0.0.1' }
 *  record`example.com. IN A 127.0.0.1` => { name: 'example.com', type: 'A', class: 'IN', ttl: 300, data: '127.0.0.1' }
 *  record`example.com. 300 IN MX 10 mail.example.com.` => { name: 'example.com', type: 'MX', class: 'IN', ttl: 300, data: { priority: 10, exchange: 'mail.example.com' } }
 */
export function record(strings: TemplateStringsArray, ...values: string[]): SupportedAnswer | undefined {
  const [name, ttl, qclass, type, data] = parseRecord(strings, values);
  if (!data) {
    return undefined;
  }

  return { name, type, class: qclass, ttl, data } as SupportedAnswer;
}

export function parseRecord(
  strings: TemplateStringsArray,
  values: string[],
): [string, number, string, SupportedRecordType, ZoneData[keyof ZoneData] | undefined] {
  // Combine strings and values to form the full template string
  let fullString = strings[0];
  for (let i = 0; i < values.length; i++) {
    fullString += values[i] + strings[i + 1];
  }

  const parts = fullString.split(/\s+/);
  const name = parts[0];
  let ttl = 300;
  let typeIndex = 1;

  if (!isNaN(parseInt(parts[1]))) {
    ttl = parseInt(parts[1]);
    typeIndex = 2;
  }

  const qclass = parts[typeIndex];
  const type = parts[typeIndex + 1] as SupportedRecordType;
  const data = parts.slice(typeIndex + 2).join(' ');

  return [name, ttl, qclass, type, parseData(type, data)];
}

export function parseData(type: SupportedRecordType, data: string): ZoneData[keyof ZoneData] | undefined {
  switch (type) {
    case 'A':
    case 'AAAA':
    case 'CNAME':
    case 'PTR':
    case 'TXT':
      return data;
    case 'MX': {
      const [priority, exchange] = data.split(/\s+/);
      if (!exchange || !priority || isNaN(parseInt(priority))) {
        return undefined;
      }
      return { priority: parseInt(priority), exchange };
    }
    case 'SRV': {
      const [priority, weight, port, target] = data.split(/\s+/);
      return { priority: parseInt(priority), weight: parseInt(weight), port: parseInt(port), target };
    }
    case 'SOA': {
      const [mname, rname, serial, refresh, retry, expire, minimum] = data.split(/\s+/);
      return {
        mname,
        rname,
        serial: parseInt(serial),
        refresh: parseInt(refresh),
        retry: parseInt(retry),
        expire: parseInt(expire),
        minimum: parseInt(minimum),
      };
    }
    // case 'NAPTR': {
    //   const [order, preference, flags, service, regexp, replacement] = data.split(/\s+/);
    //   return { order: parseInt(order), preference: parseInt(preference), flags, service, regexp, replacement };
    // }
    default:
      return data;
  }
}
