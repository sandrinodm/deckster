import { describe, expect, it } from 'vite-plus/test';

import { deckSourceFile, stampDeckModule } from '#vite/stamp-transform.ts';

const DECK = '/work/decks/hello';
const RUNTIME = '/work/packages/comments/src/stamp/jsx-dev-runtime.ts';

describe('deckSourceFile', () => {
  it('accepts the deck own MDX, TSX and JSX files, with or without a query', () => {
    expect(deckSourceFile(`${DECK}/slides/intro.mdx`, DECK)).toBe(`${DECK}/slides/intro.mdx`);
    expect(deckSourceFile(`${DECK}/slides/parts/card.tsx?t=123`, DECK)).toBe(
      `${DECK}/slides/parts/card.tsx`,
    );
    expect(deckSourceFile(`${DECK}/components/box.jsx`, DECK)).toBe(`${DECK}/components/box.jsx`);
  });

  it('rejects other decks, packages, installed modules and other file types', () => {
    expect(deckSourceFile('/work/decks/other/slides/a.mdx', DECK)).toBeUndefined();
    expect(deckSourceFile('/work/packages/kit/src/links/button.tsx', DECK)).toBeUndefined();
    expect(deckSourceFile(`${DECK}/node_modules/x/index.tsx`, DECK)).toBeUndefined();
    expect(deckSourceFile(`${DECK}/slides/data.ts`, DECK)).toBeUndefined();
    expect(deckSourceFile(`${DECK}/deck.config.ts`, DECK)).toBeUndefined();
  });
});

describe('stampDeckModule', () => {
  it('points oxc output at the stamping runtime with deck-relative file names', () => {
    const file = `${DECK}/slides/live.tsx`;
    const code = [
      `var _jsxFileName = ${JSON.stringify(file)};`,
      'import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";',
      'const label = "react/jsx-dev-runtime is a module";',
    ].join('\n');
    expect(stampDeckModule(code, file, { deckDir: DECK, runtime: RUNTIME })).toBe(
      [
        'var _jsxFileName = "slides/live.tsx";',
        `import { jsxDEV as _jsxDEV } from ${JSON.stringify(RUNTIME)};`,
        'const label = "react/jsx-dev-runtime is a module";',
      ].join('\n'),
    );
  });

  it('rewrites every MDX source location', () => {
    const file = `${DECK}/slides/intro.mdx`;
    const code = [
      "import {Fragment as _Fragment, jsxDEV as _jsxDEV} from 'react/jsx-dev-runtime';",
      `_jsxDEV("h1", {}, undefined, false, { fileName: ${JSON.stringify(file)}, lineNumber: 7 });`,
      `_jsxDEV("p", {}, undefined, false, { fileName: ${JSON.stringify(file)}, lineNumber: 9 });`,
    ].join('\n');
    const stamped = stampDeckModule(code, file, { deckDir: DECK, runtime: RUNTIME }) ?? '';
    expect(stamped).toContain(`from ${JSON.stringify(RUNTIME)}`);
    expect(stamped.match(/fileName: "slides\/intro\.mdx"/g)).toHaveLength(2);
    expect(stamped).not.toContain(file);
  });

  it('leaves modules without development JSX alone', () => {
    expect(
      stampDeckModule('export const x = 1;', `${DECK}/slides/x.tsx`, {
        deckDir: DECK,
        runtime: RUNTIME,
      }),
    ).toBeUndefined();
  });
});
