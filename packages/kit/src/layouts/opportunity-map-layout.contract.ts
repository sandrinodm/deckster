import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { textField } from '#layout-fields.ts';
import {
  PATTERN_ALT_MAX_CHARS,
  PatternImage,
  PatternPoint,
  patternExampleImage,
  patternFields,
  patternFootnote,
  patternHints,
} from '#layouts/pattern-slide.contract.ts';

/**
 * The length of a label that sits on the map.
 */
const LABEL_MAX_CHARS = 24;

/**
 * The length of the reason or constraint beside the map.
 */
const DETAIL_MAX_CHARS = 100;

/**
 * The fewest geographical references required.
 */
const DISTRICT_MIN = 2;

/**
 * The most context labels that fit the map.
 */
const DISTRICT_MAX = 4;

/**
 * The fewest points required for a connected route.
 */
const ROUTE_MIN = 2;

/**
 * The most points for a simple plan route.
 */
const ROUTE_MAX = 8;

/**
 * A named point on an authored base map.
 */
const Place = Schema.Struct({
  label: textField(LABEL_MAX_CHARS, 'a place label'),
  point: PatternPoint,
});

/**
 * A selected site or local constraint and what it means for the plan.
 */
const DecisionPoint = Schema.Struct({
  label: textField(LABEL_MAX_CHARS, 'a decision label'),
  point: PatternPoint,
  detail: textField(DETAIL_MAX_CHARS, 'a reason for the expansion decision'),
});

/**
 * A spatial decision built on an actual map, with a proposal and a constraint at their locations.
 */
export const opportunityMapLayoutContract = defineLayoutContract({
  name: 'opportunity-map',
  description:
    'Explain a spatial expansion decision on a map with a proposed site, coverage route and constraint.',
  schema: Schema.Struct({
    ...patternFields,
    map: PatternImage,
    districts: Schema.Array(Place).check(
      Schema.isMinLength(DISTRICT_MIN),
      Schema.isMaxLength(DISTRICT_MAX),
    ),
    proposed: DecisionPoint,
    constraint: DecisionPoint,
    route: Schema.Array(PatternPoint).check(
      Schema.isMinLength(ROUTE_MIN),
      Schema.isMaxLength(ROUTE_MAX),
    ),
  }),
  hints: {
    ...patternHints,
    map: `A local 16:9 map image with src and alt, up to ${PATTERN_ALT_MAX_CHARS} characters. Include geography that affects the decision.`,
    districts: `Write ${DISTRICT_MIN} to ${DISTRICT_MAX} context points, each with a label up to ${LABEL_MAX_CHARS} characters and x and y as percentages from the top left.`,
    proposed: `Give the selected site a label up to ${LABEL_MAX_CHARS} characters, a point and a detail up to ${DETAIL_MAX_CHARS} characters.`,
    constraint: `Locate the constraint with a label up to ${LABEL_MAX_CHARS} characters, a point and a detail up to ${DETAIL_MAX_CHARS} characters.`,
    route: `List ${ROUTE_MIN} to ${ROUTE_MAX} points in percentages tracing the proposed connection along paths in the artwork.`,
    reveal:
      'Start with the geography and districts, then expose the proposal and route, then the constraint.',
  },
  title: { required: true, maxChars: 70 },
  slots: patternFootnote,
  budget: { footnote: { maxWords: 24 } },
  example: {
    frontmatter: {
      title: 'Start the collection route south of the bridge',
      reveal: true,
      map: {
        src: patternExampleImage(
          '%23dbe6ce',
          'M307 4q-33 112 29 172t13 184m29-360q-32 111 26 172t25 185M329 190l71 1M33 109l243 12M43 208l223-7m-96-136 12 221M456 107l164 10m-109-53-9 227M466 213l150-8',
        ),
        alt: 'A schematic of two districts near a crossing',
      },
      districts: [
        { label: 'Market', point: { x: 19, y: 32 } },
        { label: 'North bank', point: { x: 71, y: 22 } },
      ],
      proposed: {
        label: 'New station',
        point: { x: 32, y: 72 },
        detail: 'Groups pickups with the shops that already share a route.',
      },
      constraint: {
        label: 'Bridge works',
        point: { x: 58, y: 53 },
        detail: 'Delay the north bank until the short crossing reopens.',
      },
      route: [
        { x: 32, y: 72 },
        { x: 23, y: 56 },
        { x: 19, y: 32 },
      ],
    },
    body: '<Notes>Place the districts first. [click] Trace the selected link. [click] Explain the crossing constraint.</Notes>\n',
  },
});
