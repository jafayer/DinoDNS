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
  let regexp = domainPattern.replace(/\*/g, '.*');
  regexp = `^${regexp}$`;
  return {
    regexp: new RegExp(regexp),
  };
}

export function match(domain: string, handler: HandlerMatch): boolean {
  return handler.regexp.test(domain);
}

/**
 * When presented with a domain name that contains a wildcard, and a label want to apply to it,
 * this function will handle replacing the wildcard with the label and return the full domain name.
 * 
 * Example:
 * - `resolveWildcards('sub', '*.example.com')` returns `sub.example.com`
 * - `resolveWildcards('sub', 'example.com')` returns `example.com`
 * - `resolveWildcards('second.sub', '*.example.com')` returns `second.sub.example.com`
 * 
 * Note that by convention, wildcards are only supported on the first label of the domain. Any other
 * wildcards will be treated as a literal `*` character.
 * 
 * Example:
 * - `resolveWildcards('sub', '*.example.*.com')` returns `sub.example.*.com`
 * 
 * Also note that this function will attempt to correct for any leading separators, likely due to
 * attempting to replace a wildcard with an empty string. Since each domain label is expected to be
 * non-empty, this function will consider an empty label to be equivalent to removal of the subdomain
 * altogether.
 * 
 * @param incomingLabel 
 * @param domainWildcard 
 */
export function resolveWildcards(
  incomingLabel: string,
  domainWildcard: string
) {
  const parts = domainWildcard.split('.');
  if (parts[0] === '*') {
    if (incomingLabel === '') {
      parts.shift();
    } else {
      parts[0] = incomingLabel;
    }
  }
  return parts.join('.');
}