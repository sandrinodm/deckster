/**
 * Components whose children are literal text that the kit's typographic plugin must leave exactly
 * as written: commands and their output, code, and components that read their children as values.
 * Add a component here when it reads its children as data; a single element can also opt out with a
 * `literal` attribute (`<Callout literal>"as typed"</Callout>`).
 */
export const LITERAL_TEXT_COMPONENTS: ReadonlySet<string> = new Set([
  'Cmd',
  'Out',
  'Terminal',
  'Code',
  'CodeMove',
  'CodeStep',
  'Button',
  'LinkCard',
  'QR',
  'Notes',
  'code',
  'pre',
  'kbd',
  'samp',
]);

/**
 * The attribute that opts one JSX element and everything inside it out of typographic quotes.
 */
export const LITERAL_ATTRIBUTE = 'literal';
