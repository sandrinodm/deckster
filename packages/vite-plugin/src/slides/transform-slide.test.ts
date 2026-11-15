import { defineLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { DeckBuildError } from '#errors.ts';
import { TEST_CATALOG } from '#layouts/test-catalog.fixture.ts';
import { transformMdxSlide, transformTsxSlide, type SlideSource } from '#slides/transform-slide.ts';

const SLIDE_META_PATTERN = /export const slideMeta = (.*);\n$/;

function slide(id: string, extension: string, code: string): SlideSource {
  const displayPath = `decks/demo/slides/${id}.${extension}`;
  return { id, code, displayPath, file: `/workspace/${displayPath}`, layouts: TEST_CATALOG };
}

function metaOf(code: string): unknown {
  const json = SLIDE_META_PATTERN.exec(code)?.[1];
  if (json === undefined) {
    throw new Error('the transformed slide has no slideMeta export');
  }

  return JSON.parse(json);
}

describe('transformMdxSlide', () => {
  it('compiles MDX and exports the frontmatter, title and notes', async () => {
    const source = [
      '---',
      'title: Request flow',
      '---',
      '# Ignored heading',
      '',
      '<Step at={1}>',
      '- The gateway authenticates',
      '</Step>',
      '',
      '<Notes>',
      '  Pause after the gateway.',
      '',
      '  Mention the 40 ms p50.',
      '</Notes>',
    ].join('\n');
    const code = await Effect.runPromise(
      transformMdxSlide(slide('request-flow', 'mdx', source), false),
    );
    expect(code).toContain('export default function MDXContent');
    expect(metaOf(code)).toEqual({
      frontmatter: { layout: 'default', title: 'Request flow' },
      title: 'Request flow',
      notes: 'Pause after the gateway.\n\nMention the 40 ms p50.',
      slots: [],
    });
  });

  it('falls back to the first heading, then the slide id, for the title', async () => {
    const withHeading = await Effect.runPromise(
      transformMdxSlide(slide('intro', 'mdx', '## Why *now*\n\nText'), false),
    );
    expect(metaOf(withHeading)).toMatchObject({ title: 'Why now', notes: '' });

    const withoutHeading = await Effect.runPromise(
      transformMdxSlide(slide('intro', 'mdx', 'Just text'), false),
    );
    expect(metaOf(withoutHeading)).toMatchObject({ title: 'intro' });
  });

  it('names the file, line and fix for invalid MDX', async () => {
    const source = '---\ntitle: Broken\n---\n\n<Step at={1}>\nnever closed\n';
    const error = await Effect.runPromise(
      transformMdxSlide(slide('broken', 'mdx', source), false),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DeckBuildError);
    expect(String(error)).toContain('The slide is not valid MDX in decks/demo/slides/broken.mdx');
    expect(String(error)).toContain('Expected a closing tag for `<Step>` (5:1');
    expect(String(error)).toContain('Fix: Close every JSX tag');
  });

  it('rejects invalid frontmatter before compiling', async () => {
    const error = await Effect.runPromise(
      transformMdxSlide(slide('intro', 'mdx', '---\nlayot: split\n---\n'), false),
    ).catch((caught: unknown) => caught);
    expect(String(error)).toContain('Rename it to "layout".');
  });
});

describe('transformTsxSlide', () => {
  it('reads a literal frontmatter export and the text of <Notes>', () => {
    const source = [
      "import { Notes } from '@deckster/engine';",
      "export const frontmatter = { title: 'Live demo', budget: `2m` } " +
        'satisfies Record<string, string>;',
      'export default function Live() {',
      '  return <div><Notes>Run the demo   slowly. {"Then stop."}</Notes></div>;',
      '}',
    ].join('\n');
    const code = Effect.runSync(transformTsxSlide(slide('live', 'tsx', source)));
    expect(code.startsWith(source)).toBe(true);
    expect(metaOf(code)).toEqual({
      frontmatter: { layout: 'default', title: 'Live demo', budget: '2m' },
      title: 'Live demo',
      notes: 'Run the demo slowly. Then stop.',
      slots: [],
    });
  });

  it('uses the slide id as the title of a slide without frontmatter', () => {
    const code = Effect.runSync(
      transformTsxSlide(slide('live', 'tsx', 'export default () => <p>Hi</p>;')),
    );
    expect(metaOf(code)).toEqual({
      frontmatter: { layout: 'default' },
      title: 'live',
      notes: '',
      slots: [],
    });
  });

  it('rejects frontmatter the build cannot read without running the slide', () => {
    const source = "const name = 'x';\nexport const frontmatter = { title: name };";
    expect(() => Effect.runSync(transformTsxSlide(slide('live', 'tsx', source)))).toThrow(
      /line 2 is not a literal[\s\S]*Fix: Use only strings, numbers, booleans, lists and objects/,
    );
  });

  it('validates the frontmatter export like MDX frontmatter', () => {
    const source = "export const frontmatter = { layout: 'Split' };\nexport default () => null;";
    expect(() => Effect.runSync(transformTsxSlide(slide('live', 'tsx', source)))).toThrow(
      'layout: Expected a layout name in kebab-case',
    );
  });

  it('rejects notes that contain elements', () => {
    const source = 'export default () => <Notes>Say <b>this</b></Notes>;';
    expect(() => Effect.runSync(transformTsxSlide(slide('live', 'tsx', source)))).toThrow(
      'contains elements or code',
    );
  });

  it('rejects a slide that declares the reserved slideMeta export', () => {
    const source = 'export const slideMeta = {};\nexport default () => null;';
    expect(() => Effect.runSync(transformTsxSlide(slide('live', 'tsx', source)))).toThrow(
      'a name the build reserves',
    );
  });

  it('rejects a slide without a default export', () => {
    const source = "export const frontmatter = { title: 'x' };";
    expect(() => tsx(source)).toThrow(/has no default export[\s\S]*Fix: Export the slide as/);
  });

  it('rejects frontmatter exported from a list instead of declared in the export', () => {
    const source = [
      "const frontmatter = { title: 'Ignored' };",
      'export { frontmatter };',
      'export default () => null;',
    ].join('\n');
    expect(() => tsx(source)).toThrow(
      /Line 2 exports "frontmatter" from a list[\s\S]*`export const frontmatter = \{ \.\.\. \}`/,
    );
  });

  it('reads notes under an aliased import, decoding entities and keeping paragraphs', () => {
    const source = [
      "import { Notes as Speaker } from '@deckster/engine';",
      'export default function Live() {',
      '  return (',
      '    <Speaker>',
      '      Pause &amp; breathe.',
      '',
      '      Then   show the demo.',
      '    </Speaker>',
      '  );',
      '}',
    ].join('\n');
    expect(metaOf(tsx(source))).toMatchObject({
      notes: 'Pause & breathe.\n\nThen show the demo.',
    });
  });

  it('falls back to the first heading with literal text for the title', () => {
    const source = [
      "import { Notes } from '@deckster/engine';",
      'export default ({ step }: { step: number }) => (',
      '  <div><Notes>Say hi.</Notes><h1>Step {step}</h1><h2>Q4 &amp; <em>beyond</em></h2></div>',
      ');',
    ].join('\n');
    expect(metaOf(tsx(source))).toMatchObject({ title: 'Q4 & beyond' });
  });

  it('fills slots from exports named after their tags', () => {
    const source = [
      "export const frontmatter = { layout: 'split' };",
      'export function Right() { return null; }',
      'export const Left = () => null;',
      'export default () => null;',
    ].join('\n');
    expect(metaOf(tsx(source))).toMatchObject({ slots: ['left', 'right'] });
  });

  it('names the missing slot export and a slot tag the layout does not have', () => {
    const missing =
      "export const frontmatter = { layout: 'split' };\nexport const Left = () => null;\nexport default () => null;";
    expect(() => tsx(missing)).toThrow(
      /The split layout needs its right slot\.[\s\S]*Add `export function Right\(\)` returning it/,
    );
    const foreign = 'export const Left = () => null;\nexport default () => null;';
    expect(() => tsx(foreign)).toThrow(
      /`export Left` on line 1 is not a slot of the default layout[\s\S]*\(split\)/,
    );
  });
});

describe('transformMdxSlide slots', () => {
  it('wraps the top-level content for the layout and renames slot tags', async () => {
    const source = [
      '---',
      'layout: split',
      '---',
      '## Two sides',
      '',
      '<Left>',
      '- One',
      '</Left>',
      '',
      '<Right>',
      'Two',
      '</Right>',
    ].join('\n');
    const code = await mdx(source);
    expect(code).toContain('DeckSlots');
    expect(code).toContain('name: "left"');
    expect(metaOf(code)).toMatchObject({ title: 'Two sides', slots: ['left', 'right'] });
  });

  it('names a missing required slot, a nested slot tag and a repeated one', async () => {
    const source = [
      '---',
      'layout: split',
      '---',
      '<Left>',
      'a',
      '</Left>',
      '',
      '<div>',
      '  <Left>b</Left>',
      '</div>',
      '',
      '<Left>',
      'c',
      '</Left>',
    ].join('\n');
    const error = String(await mdxFailure(source));
    expect(error).toContain("The slide does not fit its layout's slots in decks/demo/slides/s.mdx");
    expect(error).toContain('<Left> on line 9 is inside another element.');
    expect(error).toContain('<Left> on line 12 fills a slot already filled (first on line 4).');
    expect(error).toContain('The split layout needs its right slot.');
    expect(error).toContain(
      'Fix: Add <Right>…</Right> at the top level of the slide: The evidence.',
    );
  });

  it('rejects a slot tag the layout does not have and names the layouts that do', async () => {
    const error = String(await mdxFailure('# Hi\n\n<Right>\nx\n</Right>\n'));
    expect(error).toContain(
      '<Right> on line 3 is not a slot of the default layout, which has no named slots.',
    );
    expect(error).toContain('Fix: Use a layout that has it (split)');
  });

  it('rejects export default, export const frontmatter and slideMeta in MDX', async () => {
    const source = [
      "export const frontmatter = { title: 'x' };",
      'export const slideMeta = {};',
      '',
      'export default function Layout() { return null; }',
      '',
      '# Hi',
    ].join('\n');
    const error = String(await mdxFailure(source));
    expect(error).toContain("The slide's exports are not valid");
    expect(error).toContain('exports "frontmatter", which an MDX slide does not read.');
    expect(error).toContain('a name the build reserves');
    expect(error).toContain("`export default`, which would replace the slide's layout.");
  });

  it('skips headings inside <Notes> for the title and decodes entities in notes', async () => {
    const source = '<Notes>\n# Not the title\n\nQ&amp;A   at the end.\n</Notes>\n\nText only.\n';
    expect(metaOf(await mdx(source))).toMatchObject({
      title: 's',
      notes: '# Not the title\n\nQ&A at the end.',
    });
  });
});

describe("a layout's default surface", () => {
  const BRAND = { name: 'demo', surfaces: ['default', 'inverse', 'accent', 'gradient'] };
  const DIVIDER = defineLayoutContract({
    name: 'divider',
    description: 'A section divider.',
    schema: Schema.Struct({}),
    slots: {},
    budget: {},
    surface: 'accent',
    example: { frontmatter: {}, body: 'Part two' },
  });
  const layouts = new Map([
    ...TEST_CATALOG,
    ['divider', { contract: DIVIDER, source: 'test' }] as const,
  ]);

  /**
   * Compiles an MDX divider slide with the given frontmatter lines and returns its frontmatter.
   */
  const frontmatterOf = async (lines: string[]): Promise<unknown> => {
    const code = ['---', 'layout: divider', ...lines, '---', 'Part two'].join('\n');
    const source = { ...slide('divider', 'mdx', code), layouts, brand: BRAND };
    return (
      metaOf(await Effect.runPromise(transformMdxSlide(source, false))) as {
        frontmatter: unknown;
      }
    ).frontmatter;
  };

  it('is written into the frontmatter of a slide that names no surface', async () => {
    expect(await frontmatterOf([])).toEqual({ layout: 'divider', surface: 'accent' });
  });

  it("gives way to the slide's own surface", async () => {
    expect(await frontmatterOf(['surface: inverse'])).toEqual({
      layout: 'divider',
      surface: 'inverse',
    });
  });
});

/**
 * Transforms a TSX slide named `live`, synchronously.
 */
function tsx(source: string): string {
  return Effect.runSync(transformTsxSlide(slide('live', 'tsx', source)));
}

/**
 * Transforms an MDX slide named `s`.
 */
function mdx(source: string): Promise<string> {
  return Effect.runPromise(transformMdxSlide(slide('s', 'mdx', source), false));
}

/**
 * The error an MDX slide named `s` fails with.
 */
function mdxFailure(source: string): Promise<unknown> {
  return mdx(source).then(
    () => {
      throw new Error('the slide compiled');
    },
    (error: unknown) => error,
  );
}

describe('GitHub-flavored markdown in MDX slides', () => {
  it('compiles a pipe table to table elements, not literal pipes', async () => {
    const source = [
      '---',
      'title: Cover by district',
      '---',
      '| District | Cover |',
      '| --- | ---: |',
      '| Eastgate | 9% |',
      '| Riverside | 34% |',
    ].join('\n');
    const code = await Effect.runPromise(transformMdxSlide(slide('table', 'mdx', source), false));
    expect(code).toContain('_components.table');
    expect(code).toContain('_components.td');
    expect(code).not.toContain('| District |');
  });
});
