/**
 * The brand modules `@deckster/vite-plugin` generates for the active deck. `virtual:deck/brand`
 * holds the resolved tokens, the URL of each logo variant and of each background layer file (keyed
 * by the path the brand writes); `virtual:deck/brand.css` holds the Tailwind entry, the brand's
 * custom properties and its `@font-face` rules.
 */
declare module 'virtual:deck/brand' {
  const tokens: import('#resolve/brand-tokens.ts').BrandTokens;
  export default tokens;
  export const logoUrls: Readonly<Record<string, string>>;
  export const backgroundUrls: Readonly<Record<string, string>>;
}

declare module 'virtual:deck/brand.css' {}
