import vm from 'node:vm';
import { describe, expect, it } from 'vite-plus/test';

import { appendSlideId, reorderSlideIds, slideListProblem } from '#decks/slide-list-edit.ts';
import { findSlidesList } from '#decks/slides-list-scan.ts';

describe('appendSlideId', () => {
  it('appends to a single-line list', () => {
    const config = "export default defineDeck({ title: 'x', slides: ['title', 'steps'] });";
    expect(appendSlideId(config, 'intro')).toContain("slides: ['title', 'steps', 'intro']");
  });

  it('appends to a multi-line list, keeping the indentation', () => {
    const config = "defineDeck({\n  slides: [\n    'title',\n    'steps',\n  ],\n});";
    expect(appendSlideId(config, 'intro')).toContain("    'steps',\n    'intro',\n  ],");
  });

  it('keeps double quotes when the list uses them', () => {
    expect(appendSlideId('slides: ["a"]', 'b')).toBe('slides: ["a", "b"]');
  });

  it('returns undefined when there is no slides list', () => {
    expect(appendSlideId('export default {}', 'b')).toBeUndefined();
  });
});

describe('reorderSlideIds', () => {
  it('reorders a single-line list', () => {
    const config = "defineDeck({ slides: ['a', 'b', 'c'], brand: 'x' });";
    expect(reorderSlideIds(config, ['c', 'a', 'b'])).toBe(
      "defineDeck({ slides: ['c', 'a', 'b'], brand: 'x' });",
    );
  });

  it('reorders a multi-line list, keeping indentation, quotes and the rest of the file', () => {
    const config =
      'defineDeck({\n  title: "t",\n  slides: [\n    "a",\n    "b",\n    "c",\n  ],\n});';
    expect(reorderSlideIds(config, ['b', 'c', 'a'])).toBe(
      'defineDeck({\n  title: "t",\n  slides: [\n    "b",\n    "c",\n    "a",\n  ],\n});',
    );
  });

  it('does not treat $ in a slide id as a replacement pattern', () => {
    expect(reorderSlideIds("slides: ['a', 'b']", ['b$&', 'a'])).toBe("slides: ['b$&', 'a']");
  });

  it('refuses a list that holds comments', () => {
    expect(reorderSlideIds("slides: [\n  'a', // intro\n  'b',\n]", ['b', 'a'])).toBeUndefined();
  });

  it('returns undefined when there is no slides list', () => {
    expect(reorderSlideIds('export default {}', ['a'])).toBeUndefined();
  });
});

describe('the slides list scan', () => {
  it('skips a JSDoc and a string that mention `slides: [`', () => {
    const config = [
      '/**',
      " * Lists the deck: slides: ['example'] in order.",
      ' */',
      'const note = "slides: [\'x\']";',
      "export default defineDeck({ slides: ['a', 'b'] });",
    ].join('\n');
    expect(reorderSlideIds(config, ['b', 'a'])).toBe(
      config.replace("slides: ['a', 'b']", "slides: ['b', 'a']"),
    );
    expect(appendSlideId(config, 'c')).toContain("slides: ['a', 'b', 'c']");
    expect(appendSlideId(config, 'c')).toContain(
      " * Lists the deck: slides: ['example'] in order.",
    );
  });

  it('ignores a member access and finds a quoted key', () => {
    const config = 'const n = config.slides; export default { \'slides\': ["a", "b"] };';
    expect(reorderSlideIds(config, ['b', 'a'])).toContain('\'slides\': ["b", "a"]');
  });

  it('refuses a list with entries that are not quoted ids, and says why', () => {
    const config = "defineDeck({ slides: ['a', ...extra, INTRO, `t${1}`] });";
    expect(reorderSlideIds(config, ['a'])).toBeUndefined();
    expect(appendSlideId(config, 'b')).toBeUndefined();
    expect(slideListProblem(config, { rewrite: true })).toContain('`...extra`');
  });

  it('refuses two lists and names the problem', () => {
    const config = "a({ slides: ['a'] }); b({ slides: ['b'] });";
    expect(reorderSlideIds(config, ['a'])).toBeUndefined();
    expect(slideListProblem(config, { rewrite: true })).toContain('more than one');
  });

  it('appends to a list with comments but refuses to rewrite it', () => {
    const config = "slides: [\n  'a', // intro\n  'b',\n]";
    expect(appendSlideId(config, 'c')).toBe("slides: [\n  'a', // intro\n  'b',\n  'c',\n]");
    expect(slideListProblem(config, { rewrite: false })).toBeUndefined();
    expect(slideListProblem(config, { rewrite: true })).toContain('comments');
  });

  it('reports a missing or unclosed list', () => {
    expect(slideListProblem('export default {}', { rewrite: true })).toContain('No `slides');
    expect(reorderSlideIds("slides: ['a', 'b'", ['b', 'a'])).toBeUndefined();
  });
});

/**
 * The ids a config's slide list holds, read by the scanner.
 *
 * @param config - The config source.
 */
function idsOf(config: string): string[] {
  const found = findSlidesList(config);
  if (found.kind !== 'one') {
    throw new Error('expected exactly one slides list');
  }

  return found.list.items.map((entry) => (entry.kind === 'string' ? entry.value : '?'));
}

/**
 * Whether a config, an `export default` of an object, parses as JavaScript.
 *
 * @param source - The source.
 */
function parses(source: string): boolean {
  const expression = source.replace(/^export default /, '').replace(/;\s*$/, '');
  try {
    new vm.Script(`(${expression}\n)`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Config shapes the editor must keep valid: the source, and the ids it lists.
 */
const SHAPES: readonly (readonly [string, string, readonly string[]])[] = [
  ['single line', "export default { slides: ['a', 'b'] };", ['a', 'b']],
  ['single line, trailing comma', "export default { slides: ['a', 'b',] };", ['a', 'b']],
  ['empty', 'export default { slides: [] };', []],
  ['empty with spaces', 'export default { slides: [ ] };', []],
  ['empty multi-line', 'export default {\n  slides: [\n  ],\n};', []],
  ['empty with a comment', 'export default {\n  slides: [\n    // none yet\n  ],\n};', []],
  ['multi-line', "export default {\n  slides: [\n    'a',\n    'b',\n  ],\n};", ['a', 'b']],
  [
    'multi-line, no trailing comma',
    "export default {\n  slides: [\n    'a',\n    'b'\n  ],\n};",
    ['a', 'b'],
  ],
  [
    'last item has a line comment and no comma',
    "export default {\n  slides: [\n    'a',\n    'b' // last\n  ],\n};",
    ['a', 'b'],
  ],
  [
    'last item has a line comment after its comma',
    "export default {\n  slides: [\n    'a',\n    'b', // last\n  ],\n};",
    ['a', 'b'],
  ],
  [
    'last item has a block comment',
    "export default {\n  slides: [\n    'a',\n    'b' /* last */\n  ],\n};",
    ['a', 'b'],
  ],
  [
    'comment on its own line after the last item',
    "export default {\n  slides: [\n    'a',\n    'b'\n    // more later\n  ],\n};",
    ['a', 'b'],
  ],
  [
    'block comment spanning lines',
    "export default {\n  slides: [\n    'a' /* one\n two */,\n    'b' /* x\n y */\n  ],\n};",
    ['a', 'b'],
  ],
  [
    'single line with a block comment',
    "export default { slides: ['a', 'b' /* last */] };",
    ['a', 'b'],
  ],
  [
    'strings with brackets and comment markers',
    "export default {\n  slides: [\n    'a]//', // note\n    'b/*x*/'\n  ],\n};",
    ['a]//', 'b/*x*/'],
  ],
  [
    'nested arrays elsewhere',
    "export default {\n  tags: [['x'], ['y']],\n  slides: ['a'],\n  more: [[1]],\n};",
    ['a'],
  ],
  ['double quotes', 'export default { slides: ["a"] };', ['a']],
  ['CRLF', "export default {\r\n  slides: [\r\n    'a' // c\r\n  ],\r\n};", ['a']],
];

describe('appendSlideId round trips', () => {
  for (const [name, config, ids] of SHAPES) {
    it(`keeps the config valid and lists the new id last: ${name}`, () => {
      expect(parses(config), 'the shape itself parses').toBe(true);
      const updated = appendSlideId(config, 'added');
      expect(updated).toBeDefined();
      expect(parses(updated ?? ''), updated).toBe(true);
      expect(idsOf(updated ?? '')).toEqual([...ids, 'added']);
      const twice = appendSlideId(updated ?? '', 'again');
      expect(parses(twice ?? ''), twice).toBe(true);
      expect(idsOf(twice ?? '')).toEqual([...ids, 'added', 'again']);
    });
  }

  it('keeps a trailing comment on its line', () => {
    const config = "x = {\n  slides: [\n    'a',\n    'b' // last\n  ],\n};";
    expect(appendSlideId(config, 'c')).toBe(
      "x = {\n  slides: [\n    'a',\n    'b', // last\n    'c',\n  ],\n};",
    );
  });

  it('refuses an id the list already holds', () => {
    expect(appendSlideId("slides: ['a', 'b']", 'b')).toBeUndefined();
    expect(slideListProblem("slides: ['a', 'b']", { rewrite: false, append: 'b' })).toContain(
      'already holds "b"',
    );
  });

  it('refuses an id that cannot sit between quotes', () => {
    expect(appendSlideId("slides: ['a']", "x'y")).toBeUndefined();
    expect(appendSlideId("slides: ['a']", 'x\\y')).toBeUndefined();
  });
});
