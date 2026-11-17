import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  galleryLayoutContract,
  PICTURE_CAPTION_MAX_CHARS_IN_FOUR,
} from '#layouts/gallery-layout.contract.ts';

/**
 * A picture with a file and a description.
 */
const PICTURE = { src: 'assets/street.jpg', alt: 'A street under plane trees' };

/**
 * Decodes frontmatter as the build does: the fields every slide has plus the gallery layout's.
 *
 * @param frontmatter - The slide's fields without `layout`.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...galleryLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'gallery', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the gallery layout contract', () => {
  it('takes two to four pictures, each with a description', () => {
    expect(() => decode({ pictures: [PICTURE, PICTURE] })).not.toThrow();
    expect(() => decode({ pictures: [PICTURE] })).toThrow('at least 2 pictures');
    expect(() => decode({ pictures: Array.from({ length: 5 }, () => PICTURE) })).toThrow(
      'at most 4 pictures',
    );
    expect(() => decode({ pictures: [PICTURE, { src: 'assets/a.jpg' }] })).toThrow('alt');
  });

  it('crops pictures unless one asks to be shown whole', () => {
    expect(decode({ pictures: [PICTURE, { ...PICTURE, fit: 'contain' }] })).toMatchObject({
      pictures: [{ fit: 'cover' }, { fit: 'contain' }],
    });
    expect(() => decode({ pictures: [PICTURE, { ...PICTURE, fit: 'stretch' }] })).toThrow(
      'Expected "cover"',
    );
  });

  it('holds captions to the small frames of four pictures', () => {
    const caption = 'x'.repeat(PICTURE_CAPTION_MAX_CHARS_IN_FOUR + 1);
    const three = [{ ...PICTURE, caption }, PICTURE, PICTURE];
    const four = [...three, PICTURE];
    const limits = (pictures: readonly unknown[]) =>
      slideFieldLimits(galleryLayoutContract, { frontmatter: { pictures }, filled: [] });
    expect(fieldLimitBreaches({ pictures: three }, limits(three))).toEqual([]);
    expect(fieldLimitBreaches({ pictures: four }, limits(four))).toHaveLength(1);
  });

  it('puts the pictures on the inverse surface', () => {
    expect(galleryLayoutContract.surface).toBe('inverse');
  });
});
