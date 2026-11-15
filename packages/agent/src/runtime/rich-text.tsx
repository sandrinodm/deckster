import type { ReactNode } from 'react';

/**
 * One block of an answer: a paragraph, a list, or a code block.
 */
export type RichBlock =
  | {
      /**
       * A paragraph (a heading is shown as a strong paragraph).
       */
      readonly kind: 'paragraph';

      /**
       * Its text.
       */
      readonly text: string;

      /**
       * Whether it was a heading.
       */
      readonly strong: boolean;
    }
  | {
      /**
       * A bulleted or numbered list.
       */
      readonly kind: 'list';

      /**
       * Whether it is numbered.
       */
      readonly ordered: boolean;

      /**
       * The items' text.
       */
      readonly items: readonly string[];
    }
  | {
      /**
       * A fenced code block.
       */
      readonly kind: 'code';

      /**
       * The code.
       */
      readonly text: string;
    };

/**
 * A list item line: a bullet or a number, then the text.
 */
const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

/**
 * A heading line.
 */
const HEADING = /^#{1,6}\s+(.*)$/;

/**
 * Inline code, bold text and the plain text between them.
 */
const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;

/**
 * A line indented under a list item: its text continues the item.
 */
const LIST_CONTINUATION = /^\s{2,}\S/;

/**
 * The characters the two `**` markers of a bold span take up; a span shows only when it holds more.
 */
const BOLD_MARKERS_CHARS = 4;

/**
 * Splits the agents' Markdown into the few blocks the panel shows: paragraphs, lists and fenced
 * code. Everything is text; nothing is parsed as HTML. An unclosed fence (text still streaming)
 * runs to the end.
 *
 * @param text - The answer.
 */
export function parseRichText(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | undefined;
  /**
   * Ends the open paragraph and list.
   */
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' '), strong: false });
      paragraph = [];
    }

    if (list !== undefined) {
      blocks.push({ kind: 'list', ...list });
      list = undefined;
    }
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (line.trimStart().startsWith('```')) {
      flush();
      const fence = readFence(lines, index);
      blocks.push({ kind: 'code', text: fence.text });
      index = fence.closing;
      continue;
    }

    if (line.trim() === '') {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      flush();
      blocks.push({ kind: 'paragraph', text: heading[1] ?? '', strong: true });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item !== null) {
      const ordered = item[2] !== undefined;
      if (paragraph.length > 0 || (list !== undefined && list.ordered !== ordered)) {
        flush();
      }

      list ??= { ordered, items: [] };
      list.items.push(item[3] ?? '');
      continue;
    }

    if (list !== undefined && LIST_CONTINUATION.test(line)) {
      const last = list.items.length - 1;
      list.items[last] = `${list.items[last] ?? ''} ${line.trim()}`;
      continue;
    }

    if (list !== undefined) {
      flush();
    }

    paragraph.push(line.trim());
  }

  flush();
  return blocks;
}

/**
 * Reads the code of a fenced block: the lines after its opening fence, up to the closing fence. A
 * fence that never closes runs to the end of the text.
 *
 * @param lines - Every line of the answer.
 * @param opening - The index of the opening fence line.
 * @returns The code, and the index of the closing fence line (or the number of lines).
 */
function readFence(lines: readonly string[], opening: number): { text: string; closing: number } {
  const code: string[] = [];
  let closing = opening + 1;
  while (closing < lines.length && !(lines[closing] ?? '').trimStart().startsWith('```')) {
    code.push(lines[closing] ?? '');
    closing += 1;
  }

  return { text: code.join('\n'), closing };
}

/**
 * Renders inline code and bold text; the rest stays plain text.
 *
 * @param props - The text.
 */
export function InlineText({ text }: { text: string }): ReactNode {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length > BOLD_MARKERS_CHARS) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }

    return part;
  });
}

/**
 * An answer as paragraphs, lists and code blocks.
 *
 * @param props - The text.
 */
export function RichText({ text }: { text: string }): ReactNode {
  return parseRichText(text).map((block, index) => {
    switch (block.kind) {
      case 'paragraph':
        return (
          <p key={index} data-strong={block.strong || undefined}>
            <InlineText text={block.text} />
          </p>
        );
      case 'list': {
        const items = block.items.map((item, itemIndex) => (
          <li key={itemIndex}>
            <InlineText text={item} />
          </li>
        ));
        return block.ordered ? <ol key={index}>{items}</ol> : <ul key={index}>{items}</ul>;
      }

      case 'code':
        return (
          <pre key={index}>
            <code>{block.text}</code>
          </pre>
        );
    }
  });
}
