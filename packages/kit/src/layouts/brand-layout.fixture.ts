import type { BrandLayoutTokens } from '@deckster/brand';

/**
 * The defaults the brand package fills into a region.
 */
const REGION = {
  kind: 'text',
  type: 'body',
  align: 'start',
  anchor: 'start',
  color: undefined,
  fit: undefined,
  treatment: undefined,
} as const;

/**
 * The defaults of a layout with no art, no chrome changes and no budget of its own.
 */
const LAYOUT = {
  label: undefined,
  surface: undefined,
  fields: [],
  layers: {},
  layersMode: 'replace',
  chrome: {},
  budget: {},
  source: undefined,
} as const;

/**
 * A cover over `title` with art keyed by surface, a byline field and chrome changes.
 */
export const COVER_LAYOUT: BrandLayoutTokens = {
  ...LAYOUT,
  name: 'fixture-cover',
  label: 'Cover',
  description: 'A cover with a mark, the title low on the left and a byline.',
  fallback: 'title',
  surface: 'inverse',
  title: {
    box: [120, 380, 1100, 320],
    type: 'display',
    align: 'start',
    anchor: 'end',
    color: 'fg',
  },
  regions: [
    { ...REGION, bind: { slot: 'body' }, box: [120, 720, 900, 120], type: 'lead' },
    { ...REGION, bind: { field: 'byline' }, box: [120, 880, 800, 40], type: 'label' },
  ],
  layers: {
    '*': [
      {
        type: 'placed',
        file: 'backgrounds/cover-mark.svg',
        aspect: 1,
        anchor: 'top-right',
        width: 240,
        offset: { x: 0, y: 0 },
        opacity: 1,
        rotate: 0,
      },
    ],
  },
  chrome: { logo: false, pageNumber: false },
};

/**
 * A full-slide photo over `image`, kept over the surface's art, with a tighter caption budget.
 */
export const PHOTO_LAYOUT: BrandLayoutTokens = {
  ...LAYOUT,
  name: 'fixture-photo',
  description: 'A photo across the whole slide with the title and a caption over it.',
  fallback: 'image',
  title: {
    box: [120, 700, 1100, 200],
    type: 'title',
    align: 'start',
    anchor: 'end',
    color: undefined,
  },
  regions: [
    {
      ...REGION,
      bind: { slot: 'media' },
      box: [0, 0, 1920, 1080],
      kind: 'media',
      type: undefined,
      fit: 'cover',
      treatment: 'plain',
    },
    {
      ...REGION,
      bind: { slot: 'caption' },
      box: [120, 940, 800, 60],
      type: 'caption',
      color: 'accent-fg',
    },
  ],
  layersMode: 'over',
  budget: { caption: { maxWords: 10 } },
};

/**
 * Two columns of text under the title over `content`, with the page number in a box.
 */
export const TWO_UP_LAYOUT: BrandLayoutTokens = {
  ...LAYOUT,
  name: 'fixture-two-up',
  description: 'The title across the top and two equal columns of text under it.',
  fallback: 'content',
  title: {
    box: [120, 80, 1680, 140],
    type: 'title',
    align: 'start',
    anchor: 'start',
    color: undefined,
  },
  regions: [
    { ...REGION, bind: { slot: 'body' }, box: [120, 260, 800, 640] },
    { ...REGION, bind: { slot: 'aside' }, box: [1000, 260, 800, 640], align: 'end' },
  ],
  chrome: { pageNumber: [1700, 1000, 120, 40], progress: false },
};

/**
 * The three fixture layouts.
 */
export const FIXTURE_LAYOUTS: readonly BrandLayoutTokens[] = [
  COVER_LAYOUT,
  PHOTO_LAYOUT,
  TWO_UP_LAYOUT,
];
