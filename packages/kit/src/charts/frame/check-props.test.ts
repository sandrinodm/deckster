import { describe, expect, it } from 'vite-plus/test';

import { checkProps, closestProp } from '#charts/frame/check-props.ts';

describe('closestProp', () => {
  it('reads a synonym', () => {
    expect(closestProp('highlighted', ['highlight', 'x'])).toBe('highlight');
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'does not read `%s` as a synonym',
    (name) => {
      expect(closestProp(name, ['x', 'y'])).toBeUndefined();
    },
  );
});

describe('checkProps', () => {
  it.each(['constructor', 'toString', 'hasOwnProperty'])('names `%s` as not a prop', (name) => {
    expect(() => checkProps('BarChart', { [name]: 1 })).toThrow(`\`${name}\` is not a prop`);
  });
});

describe('checkProps on reveal', () => {
  it.each([
    ['BarChart', 'series'],
    ['LineChart', 'categories'],
    ['AreaChart', { by: 'categories', from: 1 }],
    ['BarChart', { by: 'series', from: 3 }],
  ])('lets %s build by %j', (chart, reveal) => {
    expect(() => checkProps(chart, { data: [], reveal })).not.toThrow();
  });

  it('names `from` and the string form for a build from step 0, not a <Step>', () => {
    const check = () => checkProps('BarChart', { data: [], reveal: { by: 'categories', from: 0 } });
    expect(check).toThrow(
      '`reveal={{ by: "categories", from: 0 }}` on BarChart: `from` is the step the first ' +
        'category comes in at, a whole number of 1 or more',
    );
    expect(check).toThrow('Write `reveal="categories"` to bring the first category in at step 1');
    expect(check).not.toThrow('<Step');
  });

  it.each([-1, 1.5, Number.NaN, '2'])('refuses `from: %j`', (from) => {
    expect(() => checkProps('LineChart', { data: [], reveal: { by: 'series', from } })).toThrow(
      'first series comes in at, a whole number of 1 or more',
    );
  });

  it('names a missing `from`', () => {
    expect(() => checkProps('BarChart', { data: [], reveal: { by: 'series' } })).toThrow(
      '`reveal={{ by: "series" }}` on BarChart has no `from`. Write `reveal="series"`',
    );
  });

  it('refuses something to build by that is not series or categories, with the closest', () => {
    expect(() => checkProps('BarChart', { data: [], reveal: 'category' })).toThrow(
      '`reveal="category"` on BarChart cannot build by that: a chart builds by "series" or ' +
        '"categories". Did you mean "categories"?',
    );
    expect(() => checkProps('AreaChart', { data: [], reveal: { from: 2 } })).toThrow(
      'does not say what to build by',
    );
    expect(() => checkProps('BarChart', { data: [], reveal: true })).toThrow(
      '`reveal={true}` on BarChart is not a way to build a chart.',
    );
  });

  it('names a field the catalog does not list for the object form', () => {
    expect(() => checkProps('BarChart', { data: [], reveal: { by: 'series', fron: 2 } })).toThrow(
      '`fron` is not a field of `reveal`; did you mean `from`? Its fields are: by, from',
    );
    expect(() =>
      checkProps('BarChart', { data: [], reveal: { by: 'series', from: 2, start: 1 } }),
    ).toThrow('`start` is not a field of `reveal`. Its fields are: by, from');
  });

  it('leaves `reveal` to the unknown-prop check on a chart that does not take it', () => {
    expect(() => checkProps('Donut', { data: [], reveal: { by: 'series', from: 0 } })).toThrow(
      '`reveal` is not a prop of Donut',
    );
  });
});

describe('checkProps on `at`', () => {
  it.each([
    [{ at: 0 }, '`at: 0` on BarChart is not a step'],
    [{ y: [{ field: 'a', at: 0 }, 'b'] }, '`at: 0` on the series "a" of BarChart is not a step'],
    [{ y: { field: 'a', at: -1 } }, '`at: -1` on the series "a" of BarChart is not a step'],
    [{ highlight: { category: 'Q2', at: 0 } }, '`at: 0` in the `highlight` of BarChart'],
    [
      {
        annotations: [
          { type: 'reference', value: 1 },
          { type: 'callout', x: 'Q2', at: 1.5 },
        ],
      },
      '`at: 1.5` on annotation 2 (callout) of BarChart is not a step',
    ],
  ])('names where %j is written, not a <Step>', (props, message) => {
    const check = () => checkProps('BarChart', { data: [], ...props });
    expect(check).toThrow(message);
    expect(check).toThrow('step 0 is the slide before any step');
    expect(check).not.toThrow('<Step');
  });

  it('says to leave `at` out or write `at: 1`', () => {
    expect(() => checkProps('LineChart', { data: [], y: [{ field: 'a', at: 0 }] })).toThrow(
      'Leave `at` out to show the series from the start, or write `at: 1` for the first step.',
    );
  });

  it('lets steps of 1 or more and a missing `at` through', () => {
    expect(() =>
      checkProps('BarChart', {
        data: [],
        at: 2,
        y: [{ field: 'a', at: 1 }, 'b', { field: 'c' }],
        highlight: { category: 'Q2', at: 3 },
        annotations: [{ type: 'callout', x: 'Q2', label: 'Up' }],
      }),
    ).not.toThrow();
  });
});
