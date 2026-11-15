import type { ReactNode } from 'react';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vite-plus/test';

import { stripQuoteMarks } from '#foundation/quote-marks.ts';

/**
 * The markup of a node.
 */
function html(node: ReactNode): string {
  return renderToStaticMarkup(<>{node}</>);
}

describe('stripQuoteMarks', () => {
  it('removes the marks an author typed around a quote', () => {
    expect(html(stripQuoteMarks(<p>“Before the trees came we kept the blinds shut.”</p>))).toBe(
      '<p>Before the trees came we kept the blinds shut.</p>',
    );
    expect(html(stripQuoteMarks('"Plain marks, too."'))).toBe('Plain marks, too.');
    expect(html(stripQuoteMarks(<p>”Curled the wrong way.”</p>))).toBe(
      '<p>Curled the wrong way.</p>',
    );
  });

  it('removes them across paragraphs and inline elements', () => {
    const quote = [
      <p key="a">
        “<em>Before</em> the trees came,
      </p>,
      <p key="b">
        we kept every blind <strong>shut.”</strong>
      </p>,
    ];
    expect(html(stripQuoteMarks(quote))).toBe(
      '<p><em>Before</em> the trees came,</p><p>we kept every blind <strong>shut.</strong></p>',
    );
  });

  it('leaves a quote with marks only inside, or at one end, as it is', () => {
    expect(html(stripQuoteMarks(<p>She said “plant it” and left.</p>))).toBe(
      '<p>She said “plant it” and left.</p>',
    );
    expect(html(stripQuoteMarks(<p>“Plant it, she said.</p>))).toBe('<p>“Plant it, she said.</p>');
  });
});
