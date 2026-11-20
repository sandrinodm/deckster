import type { ReactNode } from 'react';

import type { DataProp, Row } from '#charts/data/rows.ts';
import type { ChartDrawing, DrawInput, FrameProps } from '#charts/frame/chart-frame.tsx';

import { resolveRows, toLabel, toNumber } from '#charts/data/rows.ts';
import { ChartFrame, frameProps } from '#charts/frame/chart-frame.tsx';
import { checkProps, propNames } from '#charts/frame/check-props.ts';
import { drawHeatmap } from '#charts/heatmap/heatmap.tsx';

/**
 * The largest retention value, expressed in percentage points.
 */
const FULL_RETENTION = 100;

/**
 * The props for a retention heatmap of one row per cohort and elapsed age.
 */
export type RetentionCohortsProps = FrameProps & {
  /**
   * Inline or named data with one row per cohort and elapsed age.
   */
  data: DataProp;

  /**
   * The cohort label field, `cohort` by default. Cohorts display in source order.
   */
  cohort?: string;

  /**
   * The elapsed age field, `age` by default. Ages are nonnegative whole numbers.
   */
  age?: string;

  /**
   * The heading prefix for age columns, `Month` by default.
   */
  ageUnit?: string;

  /**
   * The retention field, `retained` by default. Pass `82` for 82% or `null` if unobserved.
   */
  value?: string;

  /**
   * The starting population field, `size` by default. Supply it at least once per cohort.
   */
  size?: string;

  /**
   * The starting population column heading, `Size` by default.
   */
  sizeLabel?: string;

  /**
   * Outline one cohort at `from` then compare every cohort at `age` one step later.
   */
  focus?: {
    cohort: string;
    age: number;
    /**
     * First guided step. Leave out to show the equal-age comparison immediately.
     */
    from?: number;
  };
};

/**
 * Props checked against the component and chart catalog.
 */
export const RETENTION_COHORTS_PROPS = propNames<RetentionCohortsProps>()([
  'at',
  'caption',
  'source',
  'label',
  'data',
  'cohort',
  'age',
  'ageUnit',
  'value',
  'size',
  'sizeLabel',
  'focus',
]);

/**
 * Draws retention from signup cohorts of different ages, with blank unobserved cells. A guided
 * build reads one cohort across ages before comparing cohorts of the same age.
 */
export function RetentionCohorts(props: RetentionCohortsProps): ReactNode {
  checkProps('RetentionCohorts', props);
  return (
    <ChartFrame
      kind="retention-cohorts"
      {...frameProps(props)}
      draw={(input) => drawRetentionCohorts(props, input)}
    />
  );
}

/**
 * A signup cohort and its measured retention by elapsed age.
 */
type CohortData = {
  /**
   * The signup cohort label.
   */
  name: string;

  /**
   * The integer starting count, when found in the input so far.
   */
  size: number | undefined;

  /**
   * Observed percentages by age, with explicit missing rates kept as null.
   */
  rates: Map<number, number | null>;
};

/**
 * Normalizes the cohort data for the shared heatmap. Throws on invalid ages, rates or inconsistent
 * cohort sizes, and preserves a rate of zero as an observed value.
 */
export function drawRetentionCohorts(props: RetentionCohortsProps, input: DrawInput): ChartDrawing {
  const cohorts = readCohorts(resolveRows(props.data, input.datasets), props);
  const ages = [
    ...new Set([...cohorts.values()].flatMap((cohort) => [...cohort.rates.keys()])),
  ].toSorted((a, b) => a - b);
  const ageUnit = props.ageUnit ?? 'Month';
  const data = [...cohorts.values()].flatMap(({ name, rates }) =>
    [...rates].map(([age, rate]) => ({ name, age: `${ageUnit} ${age}`, rate })),
  );
  const sizes = new Map(
    [...cohorts.values()].map(({ name, size }) => [name, requiredSize(name, size)]),
  );
  const { focus } = props;
  if (focus !== undefined) {
    checkFocus(focus, cohorts);
  }

  return drawHeatmap(
    {
      ...frameProps(props),
      data,
      x: 'age',
      y: 'name',
      value: 'rate',
      format: 'percent',
      scale: ['Lower retention', 'Higher retention'],
    },
    input,
    {
      ages: ages.map((age) => `${ageUnit} ${age}`),
      sizes,
      headings: ['Cohort', props.sizeLabel ?? 'Size'],
      focus:
        focus === undefined
          ? undefined
          : {
              row: focus.cohort,
              column: `${ageUnit} ${focus.age}`,
              from: focus.from,
            },
    },
  );
}

/**
 * Reads rows in source order and validates each observed cohort and age pair.
 */
function readCohorts(rows: readonly Row[], props: RetentionCohortsProps): Map<string, CohortData> {
  const cohorts = new Map<string, CohortData>();
  for (const row of rows) {
    const name = toLabel(row[props.cohort ?? 'cohort']).trim();
    const age = toNumber(row[props.age ?? 'age']);
    if (name === '' || age === null || !Number.isSafeInteger(age) || age < 0) {
      throw new Error('RetentionCohorts rows need a named cohort and a nonnegative whole age.');
    }

    const cohort = cohorts.get(name) ?? { name, size: undefined, rates: new Map() };
    if (cohort.rates.has(age)) {
      throw new Error(`RetentionCohorts has two observations for ${name} at age ${age}.`);
    }

    const rawSize = row[props.size ?? 'size'];
    if (rawSize !== undefined && rawSize !== null && rawSize !== '') {
      cohort.size = checkSize(cohort, toNumber(rawSize));
    }

    const rawRate = row[props.value ?? 'retained'];
    cohort.rates.set(age, retentionRate(rawRate, name, age));
    cohorts.set(name, cohort);
  }

  return cohorts;
}

/**
 * Checks the starting population is a consistent positive count.
 */
function checkSize(cohort: CohortData, size: number | null): number {
  if (size === null || !Number.isSafeInteger(size) || size < 1) {
    throw new Error(`RetentionCohorts needs a positive whole signup count for ${cohort.name}.`);
  }

  if (cohort.size !== undefined && cohort.size !== size) {
    throw new Error(`RetentionCohorts has different signup counts for ${cohort.name}.`);
  }

  return size;
}

/**
 * Reads a rate as a percentage from 0 to 100, or null when it has not been observed.
 */
function retentionRate(raw: Row[string] | undefined, name: string, age: number): number | null {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }

  const value = toNumber(raw);
  if (value === null || value < 0 || value > FULL_RETENTION) {
    throw new Error(
      `RetentionCohorts needs a percentage from 0 to ${FULL_RETENTION} for ${name} at age ${age}.`,
    );
  }

  return value;
}

/**
 * Returns the known starting count, or reports the cohort missing it.
 */
function requiredSize(name: string, size: number | undefined): number {
  if (size === undefined) {
    throw new Error(`RetentionCohorts needs a signup count for ${name}.`);
  }

  return size;
}

/**
 * Checks that each requested focus has at least one measured retention rate.
 */
function checkFocus(
  focus: NonNullable<RetentionCohortsProps['focus']>,
  cohorts: Map<string, CohortData>,
): void {
  const cohort = cohorts.get(focus.cohort);
  if (cohort === undefined || ![...cohort.rates.values()].some((value) => value !== null)) {
    throw new Error(`RetentionCohorts has no observed rates for ${focus.cohort}.`);
  }

  if (![...cohorts.values()].some(({ rates }) => (rates.get(focus.age) ?? null) !== null)) {
    throw new Error(`RetentionCohorts has no observed rates at age ${focus.age}.`);
  }
}
