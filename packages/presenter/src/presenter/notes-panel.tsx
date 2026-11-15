import { useMemo, useState, type ReactNode } from 'react';

import { parseNotes, type NoteBlock, type NoteInline } from '#presenter/notes-markdown.ts';

/**
 * The localStorage key that remembers the notes' text size.
 */
const SIZE_KEY = 'deck-presenter:notes-size';

/**
 * The text sizes the notes can take, in pixels.
 */
const NOTE_SIZES = [13, 15, 17, 20, 24, 28, 34, 42, 52];

/**
 * The size notes start at, an index into {@link NOTE_SIZES}.
 */
const DEFAULT_SIZE_INDEX = 3;

/**
 * Props of {@link NotesPanel}.
 */
type NotesPanelProps = {
  /**
   * The slide's speaker notes as written; empty for none.
   */
  notes: string;
};

/**
 * The speaker notes for the slide on screen, with buttons to make the text smaller or larger. The
 * size is remembered. Notes are Markdown: paragraphs, lists, bold, italic, code and links render;
 * anything else, raw HTML included, shows as text.
 */
export function NotesPanel({ notes }: NotesPanelProps): ReactNode {
  const [sizeIndex, setSizeIndex] = useState(readSizeIndex);
  const blocks = useMemo(() => parseNotes(notes), [notes]);

  /**
   * Moves the size one step and remembers it.
   */
  const resize = (delta: number) => {
    const next = Math.min(NOTE_SIZES.length - 1, Math.max(0, sizeIndex + delta));
    setSizeIndex(next);
    try {
      window.localStorage.setItem(SIZE_KEY, String(next));
    } catch {
      // The size is then forgotten on reload.
    }
  };

  return (
    <section className="dp-p-notes" aria-label="Speaker notes">
      <div className="dp-p-notes-head">
        <span className="dp-p-label">Notes</span>
        <button
          type="button"
          className="dp-button"
          data-variant="icon"
          aria-label="Smaller notes"
          disabled={sizeIndex === 0}
          onClick={() => resize(-1)}>
          A−
        </button>
        <button
          type="button"
          className="dp-button"
          data-variant="icon"
          aria-label="Larger notes"
          disabled={sizeIndex === NOTE_SIZES.length - 1}
          onClick={() => resize(1)}>
          A+
        </button>
      </div>
      <div
        className="dp-p-notes-body"
        data-testid="notes"
        style={{ fontSize: NOTE_SIZES[sizeIndex] }}>
        {blocks.length === 0 ? (
          <p className="dp-p-empty">No notes for this slide.</p>
        ) : (
          blocks.map((block, index) => <NoteBlockView key={index} block={block} />)
        )}
      </div>
    </section>
  );
}

/**
 * One paragraph or list of the notes.
 */
function NoteBlockView({ block }: { block: NoteBlock }): ReactNode {
  if (block.kind === 'paragraph') {
    return <p>{renderInline(block.children)}</p>;
  }

  const items = block.items.map((item, index) => <li key={index}>{renderInline(item)}</li>);
  return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
}

/**
 * Renders inline formatting as React elements.
 *
 * @param nodes - The parsed runs.
 */
function renderInline(nodes: readonly NoteInline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.kind) {
      case 'text':
        return node.text;
      case 'code':
        return <code key={index}>{node.text}</code>;
      case 'strong':
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case 'em':
        return <em key={index}>{renderInline(node.children)}</em>;
      case 'link':
        return (
          <a key={index} href={node.href} target="_blank" rel="noreferrer noopener">
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

/**
 * The remembered size index, or the default.
 */
function readSizeIndex(): number {
  try {
    const saved = window.localStorage.getItem(SIZE_KEY);
    if (saved === null) {
      return DEFAULT_SIZE_INDEX;
    }

    const index = Number(saved);
    const isValid = Number.isInteger(index) && index >= 0 && index < NOTE_SIZES.length;
    return isValid ? index : DEFAULT_SIZE_INDEX;
  } catch {
    return DEFAULT_SIZE_INDEX;
  }
}
