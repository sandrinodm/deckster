/**
 * IPv4 loopback hostnames after WHATWG URL normalization.
 */
const IPV4_LOOPBACK_PATTERN = /^127(?:\.\d{1,3}){3}$/;

/**
 * Whether a URL is the local deck server: `http:` or `https:` on `localhost`, an address in
 * `127.0.0.0/8` or `[::1]`. Anything else (`file:`, whose origin is `"null"`, or another host)
 * would make the shell treat pages it does not control as its own.
 *
 * @param value - A URL that parses.
 */
export function isLoopbackHttpUrl(value: string): boolean {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return false;
  }

  const host = url.hostname;
  return host === 'localhost' || host === '[::1]' || IPV4_LOOPBACK_PATTERN.test(host);
}
