import type { BrandLayoutTokens, BrandTokens } from '@deckster/brand';
import type { AnyLayoutContract } from '@deckster/engine/layout';

import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { SLOT_CONTENT_KINDS } from '@deckster/engine/layout';
import { KEBAB_CASE_PATTERN } from '@deckster/engine/names';
import { BODY_SLOT, SLOT_NAME_PATTERN, slotTag } from '@deckster/engine/slots';
import { Schema } from 'effect';
import { describe, expect, it, vi } from 'vite-plus/test';

import catalog from '#catalog.ts';
import { planChrome } from '#chrome/chrome-plan.ts';
import {
  brandLayoutCatalog,
  brandLayoutContract,
  checkBrandLayouts,
} from '#layouts/brand-layout.contract.ts';
import {
  COVER_LAYOUT,
  FIXTURE_LAYOUTS,
  PHOTO_LAYOUT,
  TWO_UP_LAYOUT,
} from '#layouts/brand-layout.fixture.ts';
import { bleedSides } from '#layouts/brand-layout.tsx';

vi.mock('virtual:deck/brand', async () => {
  const { FIXTURE_LAYOUTS: layouts } = await import('#layouts/brand-layout.fixture.ts');
  return { default: { layouts }, logoUrls: {}, backgroundUrls: {} };
});

/**
 * The kit's contracts, which the fixture layouts fall back to.
 */
const BASE: readonly AnyLayoutContract[] = catalog.layouts;

/**
 * The contract of the kit layout with this name.
 */
function kitLayout(name: string): AnyLayoutContract {
  const found = BASE.find((contract) => contract.name === name);
  if (found === undefined) {
    throw new Error(`The kit has no ${name} layout.`);
  }

  return found;
}

/**
 * A copy of a layout with some tokens replaced.
 */
function variant(
  layout: BrandLayoutTokens,
  changes: Partial<BrandLayoutTokens>,
): BrandLayoutTokens {
  return { ...layout, ...changes };
}

/**
 * Decodes frontmatter the way the build does: the fields every slide has plus the layout's, with
 * unknown fields refused.
 */
function decodes(
  contract: AnyLayoutContract,
  frontmatter: Readonly<Record<string, unknown>>,
): boolean {
  const schema = Schema.Struct({ ...SlideFrontmatter.fields, ...contract.schema.fields });
  try {
    Schema.decodeUnknownSync(schema)(
      { ...frontmatter, layout: contract.name },
      { onExcessProperty: 'error' },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * The slot tags an MDX body opens at the start of a line.
 */
function openTags(body: string): string[] {
  return [...body.matchAll(/^<([A-Z][A-Za-z0-9]*)>/gmu)].map((match) => match[1] ?? '');
}

/**
 * The rules the build's contract check holds a layout to, as problems; empty for a valid contract.
 */
function contractProblems(contract: AnyLayoutContract): string[] {
  const problems: string[] = [];
  const slots = new Set([...Object.keys(contract.slots), BODY_SLOT]);
  const baseFields = new Set(Object.keys(SlideFrontmatter.fields));
  if (!KEBAB_CASE_PATTERN.test(contract.name)) {
    problems.push('name is not kebab-case');
  }

  if (contract.description.trim() === '') {
    problems.push('no description');
  }

  if (contract.surface !== undefined && !KEBAB_CASE_PATTERN.test(contract.surface)) {
    problems.push('surface is not kebab-case');
  }

  for (const field of Object.keys(contract.schema.fields).filter((name) => baseFields.has(name))) {
    problems.push(`redefines ${field}`);
  }

  for (const [slot, slotContract] of Object.entries(contract.slots)) {
    const kinds: readonly string[] = slotContract.accepts;
    if (!SLOT_NAME_PATTERN.test(slot) || slotContract.description === '') {
      problems.push(`slot ${slot} is malformed`);
    }

    if (
      kinds.length === 0 ||
      kinds.some((kind) => !(SLOT_CONTENT_KINDS as readonly string[]).includes(kind))
    ) {
      problems.push(`slot ${slot} accepts unknown kinds`);
    }
  }

  for (const [slot, budget] of Object.entries(contract.budget)) {
    if (!slots.has(slot)) {
      problems.push(`budgets ${slot}`);
    }

    for (const [limit, value] of Object.entries(budget ?? {})) {
      const prose = limit === 'maxLines' && !(contract.slots[slot]?.accepts ?? []).includes('code');
      if (!Number.isInteger(value) || value < 1 || prose) {
        problems.push(`${slot} ${limit} is invalid`);
      }
    }
  }

  if (contract.example.body.trim() === '') {
    problems.push('empty example');
  }

  if (!decodes(contract, contract.example.frontmatter)) {
    problems.push('example frontmatter does not decode');
  }

  return problems;
}

describe('brandLayoutContract', () => {
  for (const layout of FIXTURE_LAYOUTS) {
    describe(`the ${layout.name} layout`, () => {
      const fallback = kitLayout(layout.fallback);
      const contract = brandLayoutContract(layout, fallback);

      it('passes the rules the build checks a contract against', () => {
        expect(contractProblems(contract)).toEqual([]);
      });

      it('is a valid slide on the fallback too: its example decodes there and uses its slots', () => {
        expect(decodes(fallback, contract.example.frontmatter)).toBe(true);
        for (const tag of openTags(contract.example.body)) {
          const slot =
            tag === 'Notes'
              ? BODY_SLOT
              : Object.keys(fallback.slots).find((name) => slotTag(name) === tag);
          expect(slot, tag).toBeDefined();
        }
      });

      it('keeps the fallback required slots and fields', () => {
        const required = Object.entries(fallback.slots)
          .filter(([, slotContract]) => slotContract.required === true)
          .map(([slot]) => slot);
        const kept = Object.entries(contract.slots)
          .filter(([, slotContract]) => slotContract.required === true)
          .map(([slot]) => slot);
        expect(kept).toEqual(required);
      });
    });
  }

  it('names the fallback in the description and takes the name, surface and title from the layout', () => {
    const contract = brandLayoutContract(COVER_LAYOUT, kitLayout('title'));
    expect(contract.name).toBe('fixture-cover');
    expect(contract.description).toBe(
      'A cover with a mark, the title low on the left and a byline. ' +
        '(brand layout; falls back to title)',
    );
    expect(contract.surface).toBe('inverse');
    expect(contract.title).toEqual(kitLayout('title').title);
    expect(contract.variants).toBeUndefined();
  });

  it('has only the slots and fields the layout binds', () => {
    const contract = brandLayoutContract(COVER_LAYOUT, kitLayout('title'));
    expect(Object.keys(contract.slots)).toEqual(['body']);
    expect(Object.keys(contract.schema.fields)).toEqual(['byline']);
    expect(Object.keys(brandLayoutContract(TWO_UP_LAYOUT, kitLayout('content')).slots)).toEqual([
      'body',
      'aside',
    ]);
  });

  it('takes the fallback surface when the layout names none', () => {
    const contract = brandLayoutContract(PHOTO_LAYOUT, kitLayout('image'));
    expect(contract.surface).toBe(kitLayout('image').surface);
  });

  it('overrides the fallback budget per slot with the layout budget', () => {
    const contract = brandLayoutContract(PHOTO_LAYOUT, kitLayout('image'));
    expect(contract.budget['caption']?.maxWords).toBe(10);
  });

  it('keeps the fallback title contract but not the title in the example when the layout has none', () => {
    const contract = brandLayoutContract(
      variant(TWO_UP_LAYOUT, { title: false }),
      kitLayout('content'),
    );
    expect(contract.title).toEqual(kitLayout('content').title);
    expect(contract.example.frontmatter['title']).toBeUndefined();
  });

  it('maps title and subtitle to a title slide, one body to content and two to two-content', () => {
    expect(brandLayoutContract(COVER_LAYOUT, kitLayout('title')).pptx).toEqual({
      type: 'title',
      placeholders: [
        { kind: 'title', from: { selector: '.kit-brand-title' } },
        { kind: 'subtitle', from: { slot: 'body' } },
      ],
    });
    expect(brandLayoutContract(TWO_UP_LAYOUT, kitLayout('content')).pptx?.type).toBe('two-content');
    const titleOnly = variant(COVER_LAYOUT, { regions: [COVER_LAYOUT.regions[1]!] });
    expect(brandLayoutContract(titleOnly, kitLayout('title')).pptx).toEqual({
      type: 'title',
      placeholders: [
        { kind: 'title', from: { selector: '.kit-brand-title' } },
        { kind: 'subtitle', from: { selector: '[data-region="field:byline"]' } },
      ],
    });
  });

  it('counts only body slots for the type, adds a picture placeholder and follows a section fallback', () => {
    const captionOnly = brandLayoutContract(PHOTO_LAYOUT, kitLayout('image')).pptx;
    expect(captionOnly?.type).toBe('title-only');
    const withBody = variant(PHOTO_LAYOUT, {
      regions: [...PHOTO_LAYOUT.regions, TWO_UP_LAYOUT.regions[0]!],
    });
    const photo = brandLayoutContract(withBody, kitLayout('image')).pptx;
    expect(photo?.type).toBe('content');
    expect(photo?.placeholders.map((placeholder) => placeholder.kind)).toEqual([
      'title',
      'body',
      'picture',
    ]);
    expect(brandLayoutContract(TWO_UP_LAYOUT, kitLayout('section')).pptx?.type).toBe('section');
  });

  it('has no pptx mapping when the fallback has none', () => {
    const bare: AnyLayoutContract = { ...kitLayout('content') };
    delete (bare as { pptx?: unknown }).pptx;
    expect(brandLayoutContract(TWO_UP_LAYOUT, bare).pptx).toBeUndefined();
  });
});

/**
 * A layout over a fallback that takes only the given fields, as settings, and draws nothing else
 * but the title.
 */
function settingsLayout(fallback: string, fields: readonly string[]): BrandLayoutTokens {
  return variant(TWO_UP_LAYOUT, { name: `fixture-${fallback}`, fallback, regions: [], fields });
}

describe('the fallback checks and variants', () => {
  const agenda = kitLayout('agenda');
  const layout = settingsLayout('agenda', ['items', 'current']);
  const contract = brandLayoutContract(layout, agenda);
  const items = [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }];

  it('runs the fallback checks, so a slide the fallback rejects is rejected here too', () => {
    const frontmatter = { title: 'Today', items, current: 6 };
    expect(agenda.checks?.({ ...frontmatter, layout: 'agenda' } as never)).not.toEqual([]);
    expect(contract.checks?.(frontmatter as never)).not.toEqual([]);
    expect(contract.checks?.({ title: 'Today', items, current: 2 } as never)).toEqual([]);
  });

  it('is still a valid contract with the checks and variants copied', () => {
    expect(contractProblems(contract)).toEqual([]);
  });

  it('copies the variants whose conditions the layout can meet, cut to what it has', () => {
    const columns = brandLayoutContract(
      settingsLayout('columns', ['columns']),
      kitLayout('columns'),
    );
    expect(columns.variants?.map((copied) => copied.name)).toEqual(['four columns']);
    expect(contractProblems(columns)).toEqual([]);
  });

  it('drops variants that need a field the layout leaves at another value, and cuts budgets', () => {
    const split = brandLayoutContract(
      variant(TWO_UP_LAYOUT, {
        fallback: 'split',
        regions: [
          { ...TWO_UP_LAYOUT.regions[0]!, bind: { slot: 'body' } },
          { ...TWO_UP_LAYOUT.regions[1]!, bind: { slot: 'media' }, kind: 'media' },
        ],
      }),
      kitLayout('split'),
    );
    const names = split.variants?.map((copied) => copied.name);
    expect(names).toEqual(['ratio 1:1']);
    expect(Object.keys(split.variants?.[0]?.budget ?? {})).toEqual(['body']);
    expect(contractProblems(split)).toEqual([]);
  });

  it('keeps the fallback title contract when the layout draws no title', () => {
    const fallback: AnyLayoutContract = { ...kitLayout('content'), title: { maxChars: 30 } };
    const result = brandLayoutContract(variant(TWO_UP_LAYOUT, { title: false }), fallback);
    expect(result.title).toEqual({ maxChars: 30 });
  });

  it('never loosens a fallback budget limit, only tightens it', () => {
    const loose = variant(PHOTO_LAYOUT, { budget: { caption: { maxWords: 99, maxBullets: 2 } } });
    const budget = brandLayoutContract(loose, kitLayout('image')).budget['caption'];
    expect(budget?.maxWords).toBe(kitLayout('image').budget['caption']?.maxWords);
    expect(budget?.maxBullets).toBe(2);
    expect(brandLayoutContract(PHOTO_LAYOUT, kitLayout('image')).budget['caption']?.maxWords).toBe(
      10,
    );
  });
});

describe('structured fields', () => {
  const textRegion = { ...TWO_UP_LAYOUT.regions[0]!, bind: { field: 'items' } };

  it('refuses a text region bound to a field that is not a string or a number', () => {
    const layout = variant(settingsLayout('agenda', ['items']), { regions: [textRegion] });
    const { errors } = checkBrandLayouts([layout], BASE);
    expect(errors.map((problem) => problem.path)).toEqual(['layouts[0].regions[0].bind']);
    expect(errors[0]?.fix).toContain('List it under `fields`');
  });

  it('accepts a setting listed under fields, and counts it as bound', () => {
    expect(checkBrandLayouts([settingsLayout('agenda', ['items'])], BASE).errors).toEqual([]);
    const contract = brandLayoutContract(settingsLayout('agenda', ['items']), kitLayout('agenda'));
    expect(Object.keys(contract.schema.fields)).toEqual(['items']);
  });

  it('refuses a required structured field the layout does not take, and one the fallback lacks', () => {
    const missing = checkBrandLayouts([settingsLayout('agenda', [])], BASE).errors;
    expect(missing.map((problem) => problem.message)).toEqual([
      'The fallback "agenda" requires the field "items", which the layout does not take.',
    ]);
    expect(missing[0]?.fix).toContain('choose a fallback');
    const unknown = checkBrandLayouts([settingsLayout('agenda', ['items', 'nope'])], BASE).errors;
    expect(unknown.map((problem) => problem.path)).toEqual(['layouts[0].fields[1]']);
  });
});

describe('checkBrandLayouts', () => {
  it('finds nothing wrong with the fixture layouts', () => {
    expect(checkBrandLayouts(FIXTURE_LAYOUTS, BASE)).toEqual({ errors: [], warnings: [] });
  });

  it('refuses a name a catalog layout has, and says how to rename it', () => {
    const { errors } = checkBrandLayouts([variant(TWO_UP_LAYOUT, { name: 'content' })], BASE);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe('layouts[0].name');
    expect(errors[0]?.fix).toContain('Rename it');
  });

  it('refuses an unknown fallback and names the closest layouts', () => {
    const { errors } = checkBrandLayouts([variant(TWO_UP_LAYOUT, { fallback: 'contnt' })], BASE);
    expect(errors[0]?.path).toBe('layouts[0].fallback');
    expect(errors[0]?.fix).toContain('"content"');
  });

  it('refuses a slot or field the fallback does not have, and lists what it has', () => {
    const slot = variant(TWO_UP_LAYOUT, {
      regions: [...TWO_UP_LAYOUT.regions, { ...TWO_UP_LAYOUT.regions[0]!, bind: { slot: 'nope' } }],
    });
    const field = variant(COVER_LAYOUT, {
      regions: [...COVER_LAYOUT.regions, { ...COVER_LAYOUT.regions[1]!, bind: { field: 'nope' } }],
    });
    const { errors } = checkBrandLayouts([slot, field], BASE);
    expect(errors.map((problem) => problem.path)).toEqual([
      'layouts[0].regions[2].bind',
      'layouts[1].regions[2].bind',
    ]);
    expect(errors[0]?.fix).toContain('body, aside');
    expect(errors[1]?.fix).toContain('byline');
  });

  it('refuses a layout that leaves a required slot unbound', () => {
    const { errors } = checkBrandLayouts(
      [variant(PHOTO_LAYOUT, { regions: [PHOTO_LAYOUT.regions[1]!] })],
      BASE,
    );
    expect(errors.map((problem) => problem.message)).toEqual([
      'The fallback "image" requires the slot "media", which no region binds.',
    ]);
  });

  it('refuses no title when the fallback requires one', () => {
    const { errors } = checkBrandLayouts([variant(TWO_UP_LAYOUT, { title: false })], BASE);
    expect(errors.map((problem) => problem.path)).toEqual(['layouts[0].title']);
  });

  it('refuses a budget for a slot no region binds and a line limit on prose', () => {
    const { errors } = checkBrandLayouts(
      [variant(TWO_UP_LAYOUT, { budget: { footnote: { maxWords: 5 }, body: { maxLines: 3 } } })],
      BASE,
    );
    expect(errors.map((problem) => problem.path)).toEqual([
      'layouts[0].budget.footnote',
      'layouts[0].budget.body.maxLines',
    ]);
  });

  it('warns about a media region on a slot that takes only text', () => {
    const regions = [{ ...TWO_UP_LAYOUT.regions[1]!, kind: 'media' as const }];
    const { errors, warnings } = checkBrandLayouts(
      [variant(TWO_UP_LAYOUT, { regions: [TWO_UP_LAYOUT.regions[0]!, ...regions] })],
      BASE,
    );
    expect(errors).toEqual([]);
    expect(warnings.map((problem) => problem.path)).toEqual(['layouts[0].regions[1]']);
  });
});

describe('brandLayoutCatalog', () => {
  const brand = { name: 'fixture', layouts: FIXTURE_LAYOUTS } as unknown as BrandTokens;

  it('has one contract per layout, sourced from the brand', () => {
    const result = brandLayoutCatalog(brand, BASE);
    expect(result.source).toBe('brand:fixture');
    expect(result.layouts.map((contract) => contract.name)).toEqual(
      FIXTURE_LAYOUTS.map((layout) => layout.name),
    );
  });

  it('throws every problem when a layout is invalid', () => {
    const broken = {
      name: 'fixture',
      layouts: [variant(TWO_UP_LAYOUT, { name: 'content', fallback: 'nope' })],
    } as unknown as BrandTokens;
    expect(() => brandLayoutCatalog(broken, BASE)).toThrow(
      /layouts\[0\]\.name.*layouts\[0\]\.fallback/su,
    );
  });
});

describe('the runtime plugin', () => {
  it('registers the brand layouts after the kit layouts, under the catalog names', async () => {
    const { default: runtime } = await import('#runtime.ts');
    const registered = (runtime.layouts ?? []).map((layout) => layout.name);
    const catalogNames = [
      ...BASE.map((contract) => contract.name),
      ...brandLayoutCatalog(
        { name: 'fixture', layouts: FIXTURE_LAYOUTS } as unknown as BrandTokens,
        BASE,
      ).layouts.map((contract) => contract.name),
    ];
    expect(registered).toEqual(catalogNames);
  });
});

describe('bleedSides', () => {
  it('names the canvas edges a media region touches', () => {
    expect(bleedSides(PHOTO_LAYOUT)).toEqual(['left', 'right', 'top', 'bottom']);
  });

  it('is empty for a layout with no media', () => {
    expect(bleedSides(TWO_UP_LAYOUT)).toEqual([]);
  });

  it('names only the edges a half-slide photo touches', () => {
    const half = variant(PHOTO_LAYOUT, {
      regions: [{ ...PHOTO_LAYOUT.regions[0]!, box: [960, 0, 960, 1080] }],
    });
    expect(bleedSides(half)).toEqual(['right', 'top', 'bottom']);
  });
});

describe('planChrome with media boxes', () => {
  const chrome = {
    pageNumber: { show: true, format: '{n}', corner: 'bottom-right' },
    footer: { show: false, text: '', corner: 'bottom-left' },
    progress: { show: false, edge: 'top', thickness: 3 },
    logo: { show: true },
    skipFirst: false,
  } as const;
  const input = {
    chrome,
    logoCorner: 'bottom-left',
    index: 1,
    hidden: [false, false, false],
    frontmatter: { layout: 'fixture-photo' },
    bleed: [],
  } as const;

  it('covers only the corners a half-slide photo reaches, so the logo on the free side stays', () => {
    const plan = planChrome({ ...input, mediaBoxes: [[1056, 0, 864, 1080]] });
    expect(plan.corners['bottom-left']).toEqual(['logo', 'page']);
    expect(plan.corners['bottom-right']).toEqual([]);
  });

  it('covers all four corners for a full-slide photo and leaves a framed one alone', () => {
    const full = planChrome({ ...input, mediaBoxes: [[0, 0, 1920, 1080]] });
    expect(Object.values(full.corners).flat()).toEqual([]);
    const framed = planChrome({ ...input, mediaBoxes: [[400, 200, 1000, 600]] });
    expect(framed.corners['bottom-left']).toEqual(['logo']);
  });
});

describe('planChrome for a brand layout', () => {
  const chrome = {
    pageNumber: { show: true, format: '{n}', corner: 'bottom-right' },
    footer: { show: true, text: 'Confidential', corner: 'bottom-left' },
    progress: { show: true, edge: 'top', thickness: 3 },
    logo: { show: true },
    skipFirst: false,
  } as const;
  const input = {
    chrome,
    logoCorner: 'top-right',
    index: 1,
    hidden: [false, false, false],
    frontmatter: { layout: 'fixture-cover' },
    bleed: [],
  } as const;

  it('keeps the brand chrome when the layout changes nothing', () => {
    const plan = planChrome({ ...input, layoutChrome: {} });
    expect(plan.corners['bottom-right']).toEqual(['page']);
    expect(plan.corners['top-right']).toEqual(['logo']);
    expect(plan.progressShown).toBe(true);
    expect(plan.pageBox).toBeUndefined();
  });

  it('hides the page number, logo, footer and progress the layout turns off', () => {
    const plan = planChrome({
      ...input,
      layoutChrome: { pageNumber: false, logo: false, footer: false, progress: false },
    });
    expect(Object.values(plan.corners).flat()).toEqual([]);
    expect(plan.progressShown).toBe(false);
    expect(plan.pageBox).toBeUndefined();
  });

  it('puts the page number in the layout box instead of a corner', () => {
    const plan = planChrome({ ...input, layoutChrome: { pageNumber: [1700, 1000, 120, 40] } });
    expect(plan.pageBox).toEqual([1700, 1000, 120, 40]);
    expect(plan.corners['bottom-right']).toEqual([]);
    expect(plan.pageText).toBe('2');
  });
});
