export type HandlerMatch = {
  regexp: RegExp;
};
/**
 * Allows route handlers to use wildcards and specify one or more
 * records in the domain name.
 *
 * Example:
 *  - `*.example.com` matches all subdomains of `example.com`
 *  - `example.com` matches only `example.com`
 *  - `example.com/SOA` matches only the SOA record for `example.com`
 *  - `*.example.com/A` matches all A records for subdomains
 *      of `example.com`
 *  - `example.com/A|MX` matches all A and MX records for `example.com`
 *
 * Domains can be specified with wildcards in the form of `*.example.com`.
 * This function converts a domain with a wildcard to a regular expression
 * that can be used to match domain names.
 *
 * @param domain
 */
export function domainToRegexp(domain: string): HandlerMatch {
  const parts = domain.split('/');
  const domainPattern = parts[0].replace(/\./g, '\\.');
  const type = parts[1];
  let regexp = domainPattern.replace(/\*/g, '.*');
  regexp = `^${regexp}$`;
  return {
    regexp: new RegExp(regexp),
  };
}

export function match(domain: string, handler: HandlerMatch): boolean {
  return handler.regexp.test(domain);
}
