import type { DOCS_BRANDS, DOCS_DECKS } from '#allowlist.ts';

/**
 * A deck the docs site publishes.
 */
export type DocsDeck = (typeof DOCS_DECKS)[number];

/**
 * A brand the docs site publishes.
 */
export type DocsBrand = (typeof DOCS_BRANDS)[number];

/**
 * One slide named by its deck and slide id.
 */
export type ManifestSlide = {
  /**
   * The deck folder name, one of the allowlisted decks.
   */
  readonly deck: DocsDeck;

  /**
   * The slide id, as listed in the deck config.
   */
  readonly slide: string;

  /**
   * What the docs show it for, so a reader of the manifest knows why it is here.
   */
  readonly shows: string;
};

/**
 * The slides shot one PNG per step, for the filmstrips on the steps, charts, diagrams and code
 * pages. Each must have at least two steps; `shots.ts` fails when one has fewer.
 */
export const STEP_SLIDES: readonly ManifestSlide[] = [
  { deck: 'showcase', slide: 'review-rounds', shows: 'A LineChart revealing its series' },
  { deck: 'data-stories', slide: 'redesign-effect', shows: 'A LineChart revealing a change' },
  { deck: 'showcase', slide: 'lint-path', shows: 'A Flow diagram with packets and states' },
  { deck: 'diagrams-demo', slide: 'request-journey', shows: 'A Flow journey through groups' },
  { deck: 'showcase', slide: 'agent-turn', shows: 'A SequenceDiagram adding messages' },
  { deck: 'components', slide: 'handler-evolves', shows: 'CodeMove morphing a handler' },
  { deck: 'components', slide: 'middleware-order', shows: 'Code lines highlighted in turn' },
  { deck: 'showcase', slide: 'no-styling', shows: 'A bullet build with Step' },
  { deck: 'components', slide: 'rollout-checks', shows: 'A checklist built with Step' },
  { deck: 'components', slide: 'edge-latency', shows: 'A BigNumber whose details build in steps' },
  { deck: 'hello', slide: 'steps', shows: 'The hello deck revealing one bullet per Step' },
  { deck: 'lookbook', slide: 'motion-rise', shows: 'The default rise motion on three Step lines' },
];

/**
 * The showcase slides shot in every allowlisted brand for the brand grid: a title, a chart and a
 * diagram.
 */
export const BRAND_GRID_SLIDES: readonly ManifestSlide[] = [
  { deck: 'showcase', slide: 'cover', shows: 'The title slide' },
  { deck: 'showcase', slide: 'review-rounds', shows: 'A line chart' },
  { deck: 'showcase', slide: 'lint-path', shows: 'A Flow diagram' },
];
