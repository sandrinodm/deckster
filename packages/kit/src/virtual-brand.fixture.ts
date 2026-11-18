/**
 * Stands in for `virtual:deck/brand` in unit tests, where no Vite plugin serves it: no logos, no
 * background files and no tokens. Tests that render brand-aware components must not reach this
 * module.
 */
export const logoUrls: Readonly<Record<string, string>> = {};

/**
 * No background layer files.
 */
export const backgroundUrls: Readonly<Record<string, string>> = {};

/**
 * Empty tokens, with no brand layouts; reading any other token in a test is a mistake the test
 * should surface.
 */
const tokens = { layouts: [] };

export default tokens;
