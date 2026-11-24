import type { LimitCase } from '@deckster/kit/limit-cases';

import { defineLayoutContract, type AnyLayoutContract } from '@deckster/engine/layout';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { exampleSlide, limitSlides, uniqueSlideIds, type LimitSlide } from '#layouts/limit-deck.ts';

/**
 * A case with nothing but its name.
 */
const FULL_BODY: LimitCase = { name: 'full-body', frontmatter: {}, filled: [] };

/**
 * A layout's contract; the parts a test changes are the arguments.
 *
 * @param parts - The contract's fields besides the name and the example.
 */
function contractOf(parts: {
  readonly name?: string;
  readonly schema?: Schema.Struct<Schema.Struct.Fields>;
  readonly slots?: AnyLayoutContract['slots'];
  readonly budget: AnyLayoutContract['budget'];
  readonly variants?: AnyLayoutContract['variants'];
  readonly example?: Record<string, unknown>;
}): AnyLayoutContract {
  return defineLayoutContract({
    name: parts.name ?? 'brief',
    description: 'A layout for tests.',
    schema: parts.schema ?? Schema.Struct({}),
    slots: { ...parts.slots },
    budget: parts.budget,
    ...(parts.variants === undefined ? {} : { variants: parts.variants }),
    title: { required: true, maxChars: 30 },
    example: { frontmatter: parts.example ?? { title: 'Example' }, body: 'Body.\n' },
  }) as unknown as AnyLayoutContract;
}

/**
 * The words of a slide's body: everything after the frontmatter and before the notes, without the
 * list markers.
 *
 * @param mdx - The slide.
 */
function bodyWords(mdx: string): string[] {
  const body = mdx.split('---\n\n')[1] ?? '';
  const text = body.split('<Notes>')[0] ?? '';
  return text
    .replaceAll(/^- /gmu, '')
    .split(/\s+/u)
    .filter((word) => word !== '');
}

/**
 * Every slide id of the slides.
 *
 * @param slides - The slides.
 */
function idsOf(slides: readonly LimitSlide[]): string[] {
  return slides.map((slide) => slide.id);
}

describe('limitSlides', () => {
  it('keeps a list-shaped body within a small word budget and gives every bullet a word', () => {
    const contract = contractOf({
      slots: { body: { description: 'Body.', accepts: ['text', 'bullets'] } },
      budget: { body: { maxWords: 6, maxBullets: 3 } },
    });
    const slides = limitSlides([{ contract, cases: [FULL_BODY] }]);
    expect(idsOf(slides)).toEqual(['brief-full-body-text', 'brief-full-body-list']);
    for (const slide of slides) {
      expect(bodyWords(slide.mdx).length).toBeLessThanOrEqual(6);
    }

    const list = slides[1]?.mdx ?? '';
    expect(list.match(/^- \S/gmu)).toHaveLength(3);
  });

  it('fills the bullets of a body whose budget sets no word limit', () => {
    const contract = contractOf({
      slots: { body: { description: 'Body.', accepts: ['bullets'] } },
      budget: { body: { maxBullets: 2 } },
    });
    const list = limitSlides([{ contract, cases: [FULL_BODY] }])[1]?.mdx ?? '';
    expect(list.match(/^- \S+ \S+/gmu)).toHaveLength(2);
  });

  it('tests the list a variant allows when the base budget sets no bullets', () => {
    const contract = contractOf({
      schema: Schema.Struct({ size: Schema.optionalKey(Schema.Literals(['compact', 'roomy'])) }),
      slots: { body: { description: 'Body.', accepts: ['text', 'bullets'] } },
      budget: { body: { maxWords: 40 } },
      variants: [
        {
          name: 'compact',
          when: { fields: { size: 'compact' } },
          budget: { body: { maxBullets: 3 } },
        },
      ],
    });
    const roomy = limitSlides([{ contract, cases: [FULL_BODY] }]);
    expect(idsOf(roomy)).toEqual(['brief-full-body-text']);
    const compact = limitSlides([
      { contract, cases: [{ ...FULL_BODY, frontmatter: { size: 'compact' } }] },
    ]);
    expect(idsOf(compact)).toEqual(['brief-full-body-text', 'brief-full-body-list']);
    expect(compact[1]?.mdx.match(/^- \S/gmu)).toHaveLength(3);
  });

  it('applies the variant of a field default, as the decoded slide does', () => {
    const contract = contractOf({
      schema: Schema.Struct({
        size: Schema.Literals(['small', 'large']).pipe(
          Schema.withDecodingDefaultKey(Effect.succeed<'small' | 'large'>('small')),
        ),
      }),
      slots: { body: { description: 'Body.', accepts: ['text'] } },
      budget: { body: { maxWords: 15 } },
      variants: [
        { name: 'small', when: { fields: { size: 'small' } }, budget: { body: { maxWords: 5 } } },
      ],
    });
    const [slide] = limitSlides([{ contract, cases: [FULL_BODY] }]);
    expect(bodyWords(slide?.mdx ?? '')).toHaveLength(5);
    const [large] = limitSlides([
      { contract, cases: [{ ...FULL_BODY, frontmatter: { size: 'large' } }] },
    ]);
    expect(bodyWords(large?.mdx ?? '')).toHaveLength(15);
  });

  it('writes the eyebrow the layout accepts, not the kit longest', () => {
    const contract = contractOf({
      schema: Schema.Struct({
        eyebrow: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(12))),
      }),
      slots: { body: { description: 'Body.', accepts: ['text'] } },
      budget: { body: { maxWords: 10 } },
      example: { title: 'Example', eyebrow: 'Short one' },
    });
    const [slide] = limitSlides([{ contract, cases: [FULL_BODY] }]);
    expect(slide?.mdx).toContain('eyebrow: "Short one"');
  });

  it('leaves a layout without an eyebrow field without one', () => {
    const contract = contractOf({
      slots: { body: { description: 'Body.', accepts: ['text'] } },
      budget: { body: { maxWords: 10 } },
    });
    const [slide] = limitSlides([{ contract, cases: [FULL_BODY] }]);
    expect(slide?.mdx).not.toContain('eyebrow');
  });

  it('keeps the layout when a case names another in its frontmatter', () => {
    const contract = contractOf({
      slots: { body: { description: 'Body.', accepts: ['text'] } },
      budget: { body: { maxWords: 10 } },
    });
    const [slide] = limitSlides([
      { contract, cases: [{ ...FULL_BODY, frontmatter: { layout: 'default' } }] },
    ]);
    expect(slide?.mdx).toMatch(/^---\nlayout: "brief"\n/u);
    expect(slide?.mdx).not.toContain('"default"');
  });

  it('fills a named slot for what it accepts: a photo, a table, code, or a sentence', () => {
    const contract = contractOf({
      slots: {
        body: { description: 'Body.', accepts: ['text'] },
        photo: { description: 'A photo.', accepts: ['image'] },
        results: { description: 'A table.', accepts: ['table'] },
        snippet: { description: 'Code.', accepts: ['code'] },
        note: { description: 'A note.', accepts: ['text'] },
      },
      budget: {
        body: { maxWords: 10 },
        photo: {},
        results: { maxWords: 30 },
        snippet: { maxLines: 4 },
        note: { maxWords: 7 },
      },
    });
    const filled = ['photo', 'results', 'snippet', 'note'];
    const [slide] = limitSlides([{ contract, cases: [{ ...FULL_BODY, filled }] }]);
    const mdx = slide?.mdx ?? '';
    expect(mdx).toMatch(/<Photo>\n\n<img [^>]*>\n\n<\/Photo>/u);
    expect(mdx).toMatch(/<Results>\n\n\| District/u);
    expect(mdx).toMatch(/<Snippet>\n\n```ts\n(.*\n){4}```\n\n<\/Snippet>/u);
    expect(mdx).toMatch(/<Note>\S+( \S+){6}\.<\/Note>/u);
  });
});

describe('exampleSlide', () => {
  it('names the contract layout when the example copied another layout line', () => {
    const contract = contractOf({
      slots: { body: { description: 'Body.', accepts: ['text'] } },
      budget: { body: { maxWords: 10 } },
      example: { layout: 'content', title: 'Copied' },
    });
    const { mdx } = exampleSlide(contract);
    expect(mdx).toMatch(/^---\nlayout: brief\n/u);
    expect(mdx).not.toContain('content');
  });
});

describe('uniqueSlideIds', () => {
  it('gives two slides that join into the same id different ids and keeps their attribution', () => {
    const slide = (layout: string, name: string): LimitSlide => ({
      id: `${layout}-${name}-text`,
      mdx: '',
      layout,
      case: name,
    });
    const slides = uniqueSlideIds([
      slide('kpi', 'wall-dense'),
      slide('kpi-wall', 'dense'),
      { ...slide('kpi-wall', 'dense'), id: 'kpi-wall-dense-text-2' },
    ]);
    expect(new Set(idsOf(slides)).size).toBe(3);
    expect(slides[0]?.id).toBe('kpi-wall-dense-text');
    expect(slides[1]).toMatchObject({ layout: 'kpi-wall', case: 'dense' });
    expect(slides[1]?.id).not.toBe('kpi-wall-dense-text-2');
  });

  it('leaves distinct ids alone', () => {
    const slides: LimitSlide[] = [
      { id: 'a-example', mdx: '', layout: 'a', case: 'example' },
      { id: 'b-example', mdx: '', layout: 'b', case: 'example' },
    ];
    expect(uniqueSlideIds(slides)).toEqual(slides);
  });
});
