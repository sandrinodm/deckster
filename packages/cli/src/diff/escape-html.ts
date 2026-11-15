/**
 * The characters that need an entity in HTML text and attribute values.
 */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  /**
   * Starts an entity.
   */
  '&': '&amp;',

  /**
   * Starts a tag.
   */
  '<': '&lt;',

  /**
   * Ends a tag.
   */
  '>': '&gt;',

  /**
   * Ends a double-quoted attribute value.
   */
  '"': '&quot;',

  /**
   * Ends a single-quoted attribute value.
   */
  "'": '&#39;',
};

/**
 * Every character in {@link HTML_ENTITIES}, for one pass over the text.
 */
const HTML_SPECIAL_CHARACTERS = /[&<>"']/g;

/**
 * Escapes text for HTML text and attribute values.
 *
 * @param text - Any text.
 */
export function escapeHtml(text: string): string {
  return text.replace(
    HTML_SPECIAL_CHARACTERS,
    (character) => HTML_ENTITIES[character] ?? character,
  );
}
