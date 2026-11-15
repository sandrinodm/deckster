/**
 * The brands the suite compares, each served by its own dev server.
 */
export const BRANDS = ['default', 'nocturne'] as const;

/**
 * One of {@link BRANDS}.
 */
export type Brand = (typeof BRANDS)[number];

/**
 * The port of the first brand's server; each later brand takes the next port.
 */
const FIRST_PORT = 5321;

/**
 * The base URL of a brand's dev server, with a trailing slash.
 *
 * @param brand - The brand.
 */
export function brandUrl(brand: Brand): string {
  return `http://localhost:${brandPort(brand)}/`;
}

/**
 * The port a brand's dev server listens on.
 *
 * @param brand - The brand.
 */
export function brandPort(brand: Brand): number {
  return FIRST_PORT + BRANDS.indexOf(brand);
}
