import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { fieldLimitBreaches, slideFieldLimits } from '@deckster/engine/layout';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import {
  RECAP_DETAIL_MAX_CHARS,
  RECAP_DETAIL_MAX_CHARS_IN_FOUR,
  RECAP_POINT_MAX_CHARS,
  RECAP_POINT_MAX_CHARS_IN_FOUR,
  RECAP_POINT_MAX_CHARS_IN_THREE,
  recapLayoutContract,
} from '#layouts/recap-layout.contract.ts';

/**
 * A takeaway with its optional supporting line.
 */
const POINT = { title: 'Plant the hottest blocks first.', detail: 'Use the summer heat survey.' };

/**
 * Decodes slide fields with the same excess-property checks as the build.
 *
 * @param frontmatter - Fields without the layout name.
 */
function decode(frontmatter: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...recapLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'recap', ...frontmatter },
    { onExcessProperty: 'error' },
  );
}

describe('the recap layout contract', () => {
  it('takes two to four takeaways', () => {
    expect(decode({ points: [POINT, POINT] })).toMatchObject({ points: [POINT, POINT] });
    expect(decode({ points: [POINT, POINT, POINT, POINT] })).toMatchObject({
      points: [POINT, POINT, POINT, POINT],
    });
    expect(() => decode({ points: [POINT] })).toThrow('at least 2 points');
    expect(() => decode({ points: Array(5).fill(POINT) })).toThrow('at most 4 points');
  });

  it('allows sentences without detail and defaults to chrome with no reveal', () => {
    expect(decode({ points: [{ title: 'Plant for shade.' }, POINT] })).toMatchObject({
      chrome: true,
      reveal: false,
    });
    expect(decode({ points: [POINT, POINT], chrome: false, reveal: true })).toMatchObject({
      chrome: false,
      reveal: true,
    });
  });

  it('requires nonempty sentences and bounds both lines', () => {
    expect(() => decode({ points: [{ title: '' }, POINT] })).toThrow(/title/u);
    expect(() => decode({ points: [{ detail: 'No sentence' }, POINT] })).toThrow(/title/u);
    expect(() =>
      decode({ points: [{ title: 'x'.repeat(RECAP_POINT_MAX_CHARS + 1) }, POINT] }),
    ).toThrow(`at most ${RECAP_POINT_MAX_CHARS} characters`);
    expect(() =>
      decode({ points: [{ ...POINT, detail: 'x'.repeat(RECAP_DETAIL_MAX_CHARS + 1) }, POINT] }),
    ).toThrow(`at most ${RECAP_DETAIL_MAX_CHARS} characters`);
    expect(() => decode({ points: [{ ...POINT, icon: 'leaf' }, POINT] })).toThrow(
      'Expected no excess property',
    );
  });

  it('shortens three takeaways through a published variant', () => {
    const points = Array.from({ length: 3 }, () => ({
      title: 'x'.repeat(RECAP_POINT_MAX_CHARS_IN_THREE + 1),
    }));
    const limits = slideFieldLimits(recapLayoutContract, { frontmatter: { points }, filled: [] });
    expect(fieldLimitBreaches({ points }, limits)).toHaveLength(3);
    const two = points.slice(0, 2);
    expect(
      fieldLimitBreaches(
        { points: two },
        slideFieldLimits(recapLayoutContract, { frontmatter: { points: two }, filled: [] }),
      ),
    ).toEqual([]);
  });

  it('shortens four takeaways through a published variant', () => {
    const points = Array.from({ length: 4 }, () => ({
      title: 'x'.repeat(RECAP_POINT_MAX_CHARS_IN_FOUR + 1),
    }));
    const limits = slideFieldLimits(recapLayoutContract, { frontmatter: { points }, filled: [] });
    expect(fieldLimitBreaches({ points }, limits)).toHaveLength(4);
    const three = points.slice(0, 3);
    expect(
      fieldLimitBreaches(
        { points: three },
        slideFieldLimits(recapLayoutContract, { frontmatter: { points: three }, filled: [] }),
      ),
    ).toEqual([]);
  });

  it('shortens four details through a published variant', () => {
    const points = Array.from({ length: 4 }, () => ({
      ...POINT,
      detail: 'x'.repeat(RECAP_DETAIL_MAX_CHARS_IN_FOUR + 1),
    }));
    const limits = slideFieldLimits(recapLayoutContract, { frontmatter: { points }, filled: [] });
    expect(fieldLimitBreaches({ points }, limits)).toHaveLength(4);
    const three = points.slice(0, 3);
    expect(
      fieldLimitBreaches(
        { points: three },
        slideFieldLimits(recapLayoutContract, { frontmatter: { points: three }, filled: [] }),
      ),
    ).toEqual([]);
  });

  it('maps its heading and context to PowerPoint placeholders', () => {
    expect(recapLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
