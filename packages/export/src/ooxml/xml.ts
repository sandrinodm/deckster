/**
 * The XML declaration every OOXML part starts with.
 */
export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/**
 * The control characters XML 1.0 allows: tab, line feed and carriage return.
 */
const ALLOWED_CONTROLS = new Set([0x09, 0x0a, 0x0d]);

/**
 * The first code point that is not a C0 control.
 */
const FIRST_PRINTABLE = 0x20;

/**
 * The two noncharacters XML 1.0 does not allow, U+FFFE and U+FFFF.
 */
const NONCHARACTERS = new Set([0xfffe, 0xffff]);

/**
 * Attribute values: a string or number is written, `undefined`, `null` and `false` leave the
 * attribute out, and `true` writes `1`.
 */
export type AttributeValue = string | number | boolean | null | undefined;

/**
 * Escapes text for an XML element or attribute and removes characters XML cannot hold.
 *
 * @param text - Any text.
 */
export function escapeXml(text: string): string {
  return Array.from(text)
    .filter((character) => isXmlCharacter(character.codePointAt(0) ?? 0))
    .join('')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Writes attributes in the given order, leaving out empty ones.
 *
 * @param attributes - Name to value; order is kept, which schema validation does not need but
 *   readers expect.
 */
export function attrs(attributes: Readonly<Record<string, AttributeValue>>): string {
  return Object.entries(attributes)
    .flatMap(([name, value]) => {
      if (value === undefined || value === null || value === false) {
        return [];
      }

      const text = value === true ? '1' : String(value);
      return [` ${name}="${escapeXml(text)}"`];
    })
    .join('');
}

/**
 * Writes an element: self-closing without children, else with the children joined.
 *
 * @param name - The qualified name, such as `a:off`.
 * @param attributes - Its attributes.
 * @param children - Child markup; `undefined`, `null` and `false` entries are skipped.
 */
export function el(
  name: string,
  attributes: Readonly<Record<string, AttributeValue>> = {},
  ...children: readonly (string | null | undefined | false)[]
): string {
  const body = children.filter((child) => typeof child === 'string' && child !== '').join('');
  return body === ''
    ? `<${name}${attrs(attributes)}/>`
    : `<${name}${attrs(attributes)}>${body}</${name}>`;
}

/**
 * Whether XML 1.0 allows a code point.
 *
 * @param code - The code point.
 */
function isXmlCharacter(code: number): boolean {
  if (code < FIRST_PRINTABLE) {
    return ALLOWED_CONTROLS.has(code);
  }

  return !NONCHARACTERS.has(code);
}
