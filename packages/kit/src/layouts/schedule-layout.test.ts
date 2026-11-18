import { SlideFrontmatter } from '@deckster/engine/frontmatter';
import { Schema } from 'effect';
import { describe, expect, it } from 'vite-plus/test';

import { scheduleLayoutContract, scheduleProblems } from '#layouts/schedule-layout.contract.ts';

/**
 * A valid three-period schedule, with a single-period bar and overlapping durations.
 */
const SCHEDULE = {
  periods: ['Jan', 'Feb', 'Mar'],
  lanes: [
    { name: 'Survey', bars: [{ from: 1, to: 1 }] },
    {
      name: 'Planting',
      bars: [
        { from: 1, to: 2, label: 'Eastgate' },
        { from: 2, to: 3 },
      ],
    },
    { name: 'Care', bars: [{ from: 1, to: 3 }] },
  ],
};

/**
 * Decodes the shared slide fields and the schedule fields, rejecting excess keys.
 */
function decode(fields: Record<string, unknown>): unknown {
  const schema = Schema.Struct({
    ...SlideFrontmatter.fields,
    ...scheduleLayoutContract.schema.fields,
  });
  return Schema.decodeUnknownSync(schema)(
    { layout: 'schedule', ...fields },
    { onExcessProperty: 'error' },
  );
}

describe('the schedule layout contract', () => {
  it('takes three to eight periods and three to six lanes', () => {
    expect(decode(SCHEDULE)).toMatchObject({ periods: SCHEDULE.periods });
    expect(() => decode({ ...SCHEDULE, periods: ['Jan', 'Feb'] })).toThrow('at least 3 periods');
    expect(() => decode({ ...SCHEDULE, periods: Array(9).fill('Jan') })).toThrow(
      'at most 8 periods',
    );
    expect(() => decode({ ...SCHEDULE, lanes: SCHEDULE.lanes.slice(0, 2) })).toThrow(
      'at least 3 lanes',
    );
    expect(() => decode({ ...SCHEDULE, lanes: Array(7).fill(SCHEDULE.lanes[0]) })).toThrow(
      'at most 6 lanes',
    );
    expect(() =>
      decode({ periods: Array(8).fill('Wk 8'), lanes: Array(6).fill(SCHEDULE.lanes[0]) }),
    ).not.toThrow();
  });

  it('takes one or two bars per lane with bounded labels and integer indexes', () => {
    for (const bars of [
      [],
      Array(3).fill({ from: 1, to: 2 }),
      [{ from: 0, to: 2 }],
      [{ from: 1, to: 9 }],
      [{ from: 1.5, to: 2 }],
      [{ from: 1, to: 2, label: 'x'.repeat(17) }],
    ]) {
      expect(() =>
        decode({ ...SCHEDULE, lanes: [{ name: 'Survey', bars }, ...SCHEDULE.lanes.slice(1)] }),
      ).toThrow(/Expected/u);
    }

    expect(() => decode({ ...SCHEDULE, periods: ['x'.repeat(7), 'Feb', 'Mar'] })).toThrow(
      'at most 6 characters',
    );
    expect(() =>
      decode({
        ...SCHEDULE,
        lanes: [{ ...SCHEDULE.lanes[0], name: 'x'.repeat(23) }, ...SCHEDULE.lanes.slice(1)],
      }),
    ).toThrow('at most 22 characters');
  });

  it('defaults to visible chrome and all lanes at once', () => {
    expect(decode(SCHEDULE)).toMatchObject({ chrome: true, reveal: false });
    expect(() => decode({ ...SCHEDULE, current: 0 })).toThrow(/Expected/u);
    expect(() => decode({ ...SCHEDULE, now: 1.5 })).toThrow(/Expected/u);
    expect(() => decode({ ...SCHEDULE, colour: 'red' })).toThrow('Expected no excess property');
  });

  it('accepts inclusive single-period bars and overlaps on separate tracks', () => {
    expect(scheduleProblems({ ...SCHEDULE, current: 3, now: 3 })).toEqual([]);
  });

  it('rejects reversed and out-of-axis bars and markers with actionable paths', () => {
    const lanes = [
      {
        name: 'Survey',
        bars: [
          { from: 3, to: 2 },
          { from: 4, to: 5 },
        ],
      },
      ...SCHEDULE.lanes.slice(1),
    ];
    expect(
      scheduleProblems({ ...SCHEDULE, lanes, current: 4, now: 4 }).map((problem) => problem.path),
    ).toEqual(['current', 'now', 'lanes[0].bars[0]', 'lanes[0].bars[1]']);
  });

  it('limits the combined number of bars and labels while keeping twelve unlabelled bars', () => {
    const lanes = Array.from({ length: 6 }, () => ({
      name: 'Crew',
      bars: [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ],
    }));
    expect(scheduleProblems({ ...SCHEDULE, lanes })).toEqual([]);
    expect(
      scheduleProblems({
        ...SCHEDULE,
        lanes: [
          {
            name: 'Survey',
            bars: [
              { from: 1, to: 2, label: 'Visits' },
              { from: 2, to: 3 },
            ],
          },
          ...lanes.slice(1),
        ],
      }),
    ).toMatchObject([
      { path: 'lanes', message: 'Expected at most 12 bars and bar labels combined.' },
    ]);
  });

  it('maps title and context to native PowerPoint placeholders', () => {
    expect(scheduleLayoutContract.pptx).toMatchObject({
      type: 'title-only',
      placeholders: [{ kind: 'title' }, { kind: 'body' }],
    });
  });
});
