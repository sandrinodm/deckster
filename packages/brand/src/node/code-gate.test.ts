import { afterEach, describe, expect, it } from 'vite-plus/test';

import {
  gatedLoad,
  holdCode,
  isCodeHeld,
  onCodeReleased,
  rememberLoaded,
  resetCodeGate,
} from '#node/code-gate.ts';
import { DECK_CONFIG_CALLEE, readStaticModule } from '#node/static-module.ts';

/**
 * A guarded deck folder and its config path.
 */
const ROOT = '/workspace/decks/hello';

/**
 * The config path.
 */
const CONFIG = `${ROOT}/deck.config.ts`;

/**
 * A data-only config.
 */
const DATA = `import { defineDeck } from '@deckster/engine/config';

/** A comment is fine. */
export default defineDeck({
  title: 'Hello',
  duration: '20m',
  slides: ['title', 'closing'],
  mouseNavigation: false,
  extra: { list: [1, -2, 'three', null, true], tpl: \`plain\` } as const,
});
`;

/**
 * A config that runs code.
 */
const CODE = `import { defineDeck } from '@deckster/engine/config';
import { writeFileSync } from 'node:fs';
writeFileSync('/tmp/owned', 'x');
export default defineDeck({ title: 'Owned', slides: ['title'] });
`;

afterEach(() => resetCodeGate());

describe('reading a module without running it', () => {
  it('reads a data-only config', () => {
    expect(readStaticModule(DATA, DECK_CONFIG_CALLEE)).toEqual({
      ok: true,
      value: {
        title: 'Hello',
        duration: '20m',
        slides: ['title', 'closing'],
        mouseNavigation: false,
        extra: { list: [1, -2, 'three', null, true], tpl: 'plain' },
      },
    });
  });

  it.each([
    ['another import and a statement', CODE, 'an import from "node:fs"'],
    [
      'a computed value',
      "import { defineDeck } from '@deckster/engine/config';\nexport default defineDeck({ title: process.env.X, slides: [] });",
      'a MemberExpression',
    ],
    [
      'a call inside the literal',
      "import { defineDeck } from '@deckster/engine/config';\nexport default defineDeck({ title: String(1), slides: [] });",
      'a CallExpression',
    ],
    [
      'a spread',
      "import { defineDeck } from '@deckster/engine/config';\nconst x = {};\nexport default defineDeck({ ...x });",
      'a VariableDeclaration statement',
    ],
    [
      'a template with an expression',
      "import { defineDeck } from '@deckster/engine/config';\nexport default defineDeck({ title: `${1}`, slides: [] });",
      'a template string with expressions',
    ],
    [
      'a getter',
      "import { defineDeck } from '@deckster/engine/config';\nexport default defineDeck({ get title() { return 'x'; }, slides: [] });",
      'a spread, method, getter',
    ],
    [
      'a side-effect import',
      "import '@deckster/engine/config';\nexport default { title: 'x' };",
      'an import from "@deckster/engine/config"',
    ],
  ])('refuses %s', (_name, text, reason) => {
    const read = readStaticModule(text, DECK_CONFIG_CALLEE);
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.reason).toContain(reason);
  });
});

describe('the code gate', () => {
  it('lets every load through outside a held folder', () => {
    expect(gatedLoad(CONFIG, CODE, DECK_CONFIG_CALLEE)).toEqual({ kind: 'import' });
    expect(isCodeHeld(CONFIG)).toBe(false);
  });

  it('reads a config the framework vouches for as data while held, without running it', () => {
    const hold = holdCode([ROOT]);
    hold.accept(CONFIG, DATA);
    expect(gatedLoad(CONFIG, DATA, DECK_CONFIG_CALLEE)).toMatchObject({
      kind: 'value',
      value: { title: 'Hello' },
    });
    hold.release();
    expect(gatedLoad(CONFIG, DATA, DECK_CONFIG_CALLEE)).toEqual({ kind: 'import' });
  });

  it('never imports while held: a content nobody vouched for keeps the last value', () => {
    rememberLoaded(CONFIG, { title: 'kept' });
    const hold = holdCode([ROOT]);
    hold.accept(CONFIG, DATA);
    expect(gatedLoad(CONFIG, CODE, DECK_CONFIG_CALLEE)).toEqual({
      kind: 'value',
      value: { title: 'kept' },
    });
    const otherData = DATA.replace("'Hello'", "'Changed'");
    expect(gatedLoad(CONFIG, otherData, DECK_CONFIG_CALLEE)).toEqual({
      kind: 'value',
      value: { title: 'kept' },
    });
    hold.release();
  });

  it('is held with nothing kept when the file was never loaded', () => {
    const hold = holdCode([ROOT]);
    expect(gatedLoad(CONFIG, CODE, DECK_CONFIG_CALLEE)).toEqual({ kind: 'held' });
    hold.accept(CONFIG, CODE);
    expect(gatedLoad(CONFIG, CODE, DECK_CONFIG_CALLEE)).toEqual({ kind: 'held' });
    hold.release();
  });

  it('tells listeners when a hold ends, once', () => {
    const released: string[] = [];
    onCodeReleased((root) => released.push(root));
    const hold = holdCode([ROOT]);
    hold.release();
    hold.release();
    expect(released).toEqual([ROOT]);
  });
});
