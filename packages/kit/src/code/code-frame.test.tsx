import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vite-plus/test';

import { CodeFrame } from '#code/code-frame.tsx';

/**
 * The code stylesheet, whose rules for changed lines are checked as text.
 */
const CODE_CSS = readFileSync(new URL('code.css', import.meta.url), 'utf8');

/**
 * A stylesheet rule whose selector names a changed line (`data-change`), with its selector and
 * declarations as two capture groups.
 */
const CHANGED_LINE_RULE_PATTERN = /([^{}]*data-change[^{}]*)\{([^}]*)\}/gu;

/**
 * The declarations of every rule whose selector names a changed line (`data-change`), one string
 * per rule.
 */
const CHANGED_LINE_RULES = [...CODE_CSS.matchAll(CHANGED_LINE_RULE_PATTERN)].map(
  ([, , body = '']) => body,
);

describe('CodeFrame', () => {
  it('says how many lines of code it holds, so lint counts neither its bar nor its gutter', () => {
    const html = renderToStaticMarkup(
      <CodeFrame file="app.ts" lang="ts" label={undefined} kind="code" lines={11}>
        <div />
      </CodeFrame>,
    );
    expect(html).toContain('data-code-lines="11"');
    expect(html).toContain('kit-code-bar');
  });

  it('leaves the count out while the code is still being highlighted', () => {
    const html = renderToStaticMarkup(
      <CodeFrame file={undefined} lang="ts" label={false} kind="move" lines={undefined}>
        <div />
      </CodeFrame>,
    );
    expect(html).not.toContain('data-code-lines');
  });
});

describe('the code stylesheet', () => {
  it('draws added and removed lines at full opacity, so colored tokens keep their contrast', () => {
    // Dimming a removed line's text to 0.72 opacity took colored tokens below 3:1 on the
    // removed-line tint in three of the five brands, so the mark, the edge and the tint carry the
    // meaning instead.
    expect(CHANGED_LINE_RULES.length).toBeGreaterThan(0);
    expect(CHANGED_LINE_RULES.filter((body) => /\bopacity\s*:/u.test(body))).toEqual([]);
  });
});
