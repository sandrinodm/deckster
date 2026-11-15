import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import { LITERAL_ATTRIBUTE, LITERAL_TEXT_COMPONENTS } from '#mdx/literal-text.ts';

/**
 * Node types whose text is code or source and keeps its straight quotes.
 */
const VERBATIM_TYPES = new Set([
  'code',
  'inlineCode',
  'html',
  'mdxjsEsm',
  'mdxFlowExpression',
  'mdxTextExpression',
]);

/**
 * The node types of a JSX element, in a block of its own or inside a paragraph.
 */
const JSX_ELEMENT_TYPES = new Set(['mdxJsxFlowElement', 'mdxJsxTextElement']);

/**
 * Node types that end a run of text: a quote never pairs across them.
 */
const BLOCK_TYPES = new Set(['paragraph', 'heading', 'listItem', 'tableCell', 'blockquote']);

/**
 * A stand-in for the character before text that follows code: a quote right after code closes.
 */
const AFTER_CODE = 'x';

/**
 * The parts of an mdast node the plugin reads and writes.
 */
type TextNode = {
  /**
   * The node type, such as `text` or `inlineCode`.
   */
  type: string;

  /**
   * The element name of a JSX node.
   */
  name?: string | null;

  /**
   * The attributes of a JSX node.
   */
  attributes?: readonly unknown[];

  /**
   * The text of a text node.
   */
  value?: unknown;

  /**
   * The child nodes.
   */
  children?: TextNode[];
};

/**
 * A remark plugin that sets curly quotes and apostrophes in a slide's prose, as `smartPunctuation`
 * does for frontmatter text. It changes text nodes only, so attribute values are never touched, and
 * it leaves alone code, inline code, expressions, imports, the children of the components listed in
 * `LITERAL_TEXT_COMPONENTS` (commands, code, link and QR values) and any element written with the
 * `literal` attribute. Quotes that open in one text node and close in the next (around `**bold**`,
 * say) pair up, because each node continues from the last character of the one before.
 *
 * @returns The transformer, which changes the tree in place.
 */
export function remarkKitPunctuation(): (tree: TextNode) => void {
  return (tree) => {
    let previous = '';
    /**
     * Rewrites the text nodes under a node, in document order.
     */
    const visit = (node: TextNode): void => {
      if (VERBATIM_TYPES.has(node.type) || isLiteralElement(node)) {
        previous = AFTER_CODE;
        return;
      }

      if (node.type === 'text' && typeof node.value === 'string') {
        const text = smartPunctuation(node.value, previous);
        node.value = text;
        previous = text.at(-1) ?? previous;
        return;
      }

      for (const child of node.children ?? []) {
        visit(child);
      }

      if (BLOCK_TYPES.has(node.type)) {
        previous = '';
      }
    };
    visit(tree);
  };
}

/**
 * Whether a node is a JSX element whose text is literal: a listed component, or one written with
 * the `literal` attribute.
 *
 * @param node - Any mdast node.
 */
function isLiteralElement(node: TextNode): boolean {
  if (!JSX_ELEMENT_TYPES.has(node.type)) {
    return false;
  }

  if (typeof node.name === 'string' && LITERAL_TEXT_COMPONENTS.has(node.name)) {
    return true;
  }

  return (node.attributes ?? []).some(
    (attribute) =>
      typeof attribute === 'object' &&
      attribute !== null &&
      Reflect.get(attribute, 'name') === LITERAL_ATTRIBUTE,
  );
}
