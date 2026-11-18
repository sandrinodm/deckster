import { defineBrandLayouts } from '@deckster/brand';

/**
 * Fieldnote's own layouts: the four a research group's template would carry. Each draws its boxes
 * on the 1920x1080 canvas over art in `layouts/`, in the brand's palette.
 */
export default defineBrandLayouts([
  {
    name: 'fieldnote-cover',
    label: 'Fieldnote cover',
    description:
      'A cover with a notebook margin rule down the left and a sprig mark top right: eyebrow, title, subtitle, byline and date set against the rule.',
    fallback: 'title',
    surface: 'inverse',
    title: { box: [216, 360, 1040, 330], type: 'display', anchor: 'end' },
    regions: [
      { bind: { field: 'eyebrow' }, box: [216, 290, 900, 40], type: 'label', color: 'accent' },
      { bind: { slot: 'body' }, box: [216, 726, 980, 130], type: 'lead', color: 'muted' },
      { bind: { field: 'byline' }, box: [216, 912, 700, 40], type: 'small' },
      { bind: { field: 'date' }, box: [216, 956, 700, 40], type: 'small', color: 'muted' },
    ],
    background: {
      default: [{ type: 'image', file: 'layouts/cover-paper.svg', fit: 'cover' }],
      inverse: [{ type: 'image', file: 'layouts/cover-forest.svg', fit: 'cover' }],
    },
    chrome: { logo: false, pageNumber: false },
  },
  {
    name: 'fieldnote-section',
    label: 'Fieldnote section',
    description:
      'A part divider on terracotta: the part number large at the top left, the title low on the left over survey contour lines, and a one-line summary under a rule.',
    fallback: 'section',
    surface: 'accent',
    title: { box: [144, 400, 1100, 400], type: 'headline', anchor: 'end' },
    regions: [
      { bind: { field: 'number' }, box: [144, 130, 600, 200], type: 'stat', color: 'accent' },
      { bind: { slot: 'body' }, box: [144, 876, 1040, 120], type: 'lead' },
    ],
    background: [{ type: 'image', file: 'layouts/section-contours.svg', fit: 'cover' }],
    layers: 'over',
  },
  {
    name: 'fieldnote-photo',
    label: 'Fieldnote photo right',
    description:
      'Text on the left under a double rule and a picture that runs off the right and bottom edges: eyebrow, title, a paragraph and a caption. The page number moves to the foot of the text column.',
    fallback: 'image',
    surface: 'default',
    title: { box: [144, 204, 820, 300], type: 'headline', anchor: 'start' },
    regions: [
      { bind: { field: 'eyebrow' }, box: [144, 144, 808, 40], type: 'label', color: 'accent' },
      { bind: { slot: 'body' }, box: [144, 540, 800, 250], type: 'lead' },
      { bind: { slot: 'caption' }, box: [144, 816, 800, 60], type: 'caption', color: 'muted' },
      { bind: { slot: 'media' }, box: [1056, 0, 864, 1080], kind: 'media', fit: 'cover' },
    ],
    background: [{ type: 'image', file: 'layouts/photo-frame.svg', fit: 'cover' }],
    chrome: { pageNumber: [872, 972, 80, 40] },
  },
  {
    name: 'fieldnote-columns',
    label: 'Fieldnote two columns',
    description:
      'A title under an eyebrow with a rule below it, then two columns split by a hairline: the main text on the left and an aside, a note or a figure, on the right.',
    fallback: 'content',
    surface: 'default',
    title: { box: [144, 116, 1632, 150], type: 'title', anchor: 'end' },
    regions: [
      { bind: { field: 'eyebrow' }, box: [144, 60, 900, 40], type: 'label', color: 'accent' },
      { bind: { slot: 'body' }, box: [144, 350, 770, 560], type: 'body' },
      { bind: { slot: 'aside' }, box: [1006, 350, 770, 560], type: 'body', color: 'muted' },
    ],
    background: {
      default: [{ type: 'image', file: 'layouts/columns-paper.svg', fit: 'cover' }],
      inverse: [{ type: 'image', file: 'layouts/columns-forest.svg', fit: 'cover' }],
    },
  },
]);
