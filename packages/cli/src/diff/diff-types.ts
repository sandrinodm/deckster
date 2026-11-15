/**
 * How one slide, or one step of a slide, differs between the base and now.
 */
export type DiffStatus = 'unchanged' | 'changed' | 'added' | 'removed' | 'moved';

/**
 * One step of a slide in a `--steps` run, or the slide's finished state without it.
 */
export type StepDiff = {
  /**
   * The step, or `null` for the slide's finished state.
   */
  step: number | null;

  /**
   * `unchanged`, `changed`, `added` (only now) or `removed` (only in the base).
   */
  status: 'unchanged' | 'changed' | 'added' | 'removed';

  /**
   * The share of pixels that changed visibly, from 0 to 1; 1 for an added or removed step.
   */
  differenceRatio: number;

  /**
   * The base picture, or `null` when the step is unchanged or was added.
   */
  before: string | null;

  /**
   * The current picture, or `null` when the step is unchanged or was removed.
   */
  after: string | null;

  /**
   * The side-by-side picture (before, after, difference), or `null` unless the step changed.
   */
  compare: string | null;
};

/**
 * One slide of the comparison, matched between the two versions by its id.
 */
export type SlideDiff = {
  /**
   * The slide id.
   */
  id: string;

  /**
   * `added` or `removed` when only one version has the slide; `changed` when any step differs;
   * `moved` when the pictures are the same but the slide sits elsewhere in the order; else
   * `unchanged`.
   */
  status: DiffStatus;

  /**
   * The 1-based position in the base, or `null` for an added slide.
   */
  beforeNumber: number | null;

  /**
   * The 1-based position now, or `null` for a removed slide.
   */
  afterNumber: number | null;

  /**
   * Whether the slide changed its place relative to the slides both versions share. A slide can be
   * both `changed` and moved.
   */
  moved: boolean;

  /**
   * The largest `differenceRatio` of the slide's steps; 1 for an added or removed slide.
   */
  differenceRatio: number;

  /**
   * The base picture of the slide's finished state (the last step with `--steps`), or `null`.
   */
  before: string | null;

  /**
   * The current picture of the slide's finished state, or `null`.
   */
  after: string | null;

  /**
   * The side-by-side picture of the slide's finished state, or `null` unless it changed.
   */
  compare: string | null;

  /**
   * Every step, with `--steps`; left out otherwise.
   */
  steps?: StepDiff[];
};
