import { displayUrl } from '#links/link-target.ts';

/**
 * Query strings and fragments do not help an audience read an address aloud.
 */
const ADDRESS_SUFFIX_PATTERN = /[?#].*$/u;

/**
 * A validated web URL as a readable label, without query or fragment. Long paths end at the last
 * slash, dot or hyphen before the character cap (including the ellipsis). A host is never cut, even
 * when it exceeds the cap; a cap shorter than the host returns that host unchanged.
 *
 * @param url - The full web destination, validated by the sources contract.
 * @param max - The preferred maximum label length in characters, including the ellipsis.
 */
export function shortAddress(url: string, max: number): string {
  const address = displayUrl(url.replace(ADDRESS_SUFFIX_PATTERN, ''));
  if (address.length <= max) {
    return address;
  }

  const hostEnd = address.indexOf('/');
  const host = hostEnd < 0 ? address : address.slice(0, hostEnd);
  if (host.length >= max || hostEnd < 0) {
    return host;
  }

  const prefix = address.slice(0, max - 1);
  const boundary = Math.max(
    prefix.lastIndexOf('/'),
    prefix.lastIndexOf('.'),
    prefix.lastIndexOf('-'),
  );
  return `${address.slice(0, Math.max(host.length, boundary))}…`;
}
