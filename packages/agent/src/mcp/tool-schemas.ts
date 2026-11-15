import { isSafeName, SAFE_NAME_RULE } from '@deckster/brand';
import { Schema } from 'effect';

/**
 * A step number: a whole number from 0.
 */
const Step = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * The input of `deck_lint`.
 */
export const DeckLintInput = Schema.Struct({
  /**
   * Limits the findings to one slide.
   */
  slide: Schema.optionalKey(
    Schema.String.annotate({
      description: 'A slide id. Leave it out to get the findings of the whole deck.',
    }),
  ),
});

/**
 * The input of `deck_screenshot`.
 */
export const DeckScreenshotInput = Schema.Struct({
  /**
   * The slide to capture.
   */
  slide: Schema.String.annotate({
    description: 'The slide id (its file name without extension) or its 1-based number.',
  }),

  /**
   * The step to capture.
   */
  step: Schema.optionalKey(
    Step.annotate({
      description:
        'The step to show, from 0. Leave it out for the slide at its last step, ' +
        'with everything shown.',
    }),
  ),

  /**
   * The image width.
   */
  width: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 320, maximum: 1920 })).annotate({
      description:
        'The image width in pixels, 320 to 1920. Default: 1280. Smaller images ' +
        'cost fewer tokens.',
    }),
  ),
});

/**
 * The kinds of catalog `catalog` answers.
 */
export const CATALOG_KINDS = ['layouts', 'charts', 'diagrams', 'components', 'brand'] as const;

/**
 * The input of `catalog`.
 */
export const CatalogInput = Schema.Struct({
  /**
   * Which catalog.
   */
  kind: Schema.Literals(CATALOG_KINDS).annotate({
    description: 'Which catalog: layouts, charts, diagrams, components or brand.',
  }),

  /**
   * One entry of the catalog.
   */
  name: Schema.optionalKey(
    Schema.String.annotate({
      description:
        'One entry by name, such as a layout name; for brand, a brand folder ' +
        'name. Leave it out for the whole catalog (the deck brand for brand).',
    }),
  ),
}).check(
  Schema.makeFilter((input: { readonly kind: string; readonly name?: string }) =>
    input.kind !== 'brand' || input.name === undefined || isSafeName(input.name)
      ? undefined
      : {
          path: ['name'],
          issue: `For kind brand, name is a brand folder name in ${SAFE_NAME_RULE}, such as "default", not a path.`,
        },
  ),
);

/**
 * The actions of `comments`.
 */
export const COMMENT_ACTIONS = ['list', 'resolve'] as const;

/**
 * The statuses `comments` can list.
 */
export const COMMENT_STATUSES = ['open', 'resolved', 'all'] as const;

/**
 * The input of `comments`.
 */
export const CommentsInput = Schema.Struct({
  /**
   * What to do.
   */
  action: Schema.Literals(COMMENT_ACTIONS).annotate({
    description: 'list returns review comments; resolve marks one resolved.',
  }),

  /**
   * The comment to resolve.
   */
  id: Schema.optionalKey(
    Schema.String.annotate({ description: 'The comment id; required for resolve.' }),
  ),

  /**
   * What changed.
   */
  note: Schema.optionalKey(
    Schema.String.annotate({ description: 'For resolve: what you changed, in one sentence.' }),
  ),

  /**
   * Which comments to list.
   */
  status: Schema.optionalKey(
    Schema.Literals(COMMENT_STATUSES).annotate({
      description: 'For list: open (the default), resolved or all.',
    }),
  ),

  /**
   * Only one slide's comments.
   */
  slide: Schema.optionalKey(
    Schema.String.annotate({ description: 'For list: only the comments of this slide id.' }),
  ),
});

/**
 * The input of `goto`.
 */
export const GotoInput = Schema.Struct({
  /**
   * The slide to show.
   */
  slide: Schema.String.annotate({ description: 'The slide id.' }),

  /**
   * The step to show.
   */
  step: Schema.optionalKey(Step.annotate({ description: 'The step to show, from 0. Default: 0.' })),
});

/**
 * The input of `new_slide`.
 */
export const NewSlideInput = Schema.Struct({
  /**
   * The layout the slide starts from.
   */
  layout: Schema.String.annotate({
    description: 'A layout name from the catalog (catalog with kind layouts).',
  }),

  /**
   * The new slide's id.
   */
  id: Schema.String.annotate({
    description: 'The new slide id in kebab-case; it becomes slides/<id>.mdx.',
  }),

  /**
   * The slide to insert after.
   */
  after: Schema.optionalKey(
    Schema.String.annotate({
      description: 'The id of the slide to insert after. Leave it out to append at the end.',
    }),
  ),
});

/**
 * The most slides a reorder request lists.
 */
const MAX_SLIDES = 500;

/**
 * The input of `reorder_slides`.
 */
export const ReorderSlidesInput = Schema.Struct({
  /**
   * Every slide id, in the new order.
   */
  slides: Schema.Array(Schema.String).check(Schema.isMaxLength(MAX_SLIDES)).annotate({
    description:
      'Every slide id of the deck, each once, in the new order (deck_outline lists them).',
  }),
});

/**
 * The input of `remove_slide`.
 */
export const RemoveSlideInput = Schema.Struct({
  /**
   * The slide to remove.
   */
  id: Schema.String.annotate({ description: 'The id of the slide to remove.' }),
});

/**
 * The input of `deck_lint`, decoded.
 */
export type DeckLintInput = typeof DeckLintInput.Type;

/**
 * The input of `deck_screenshot`, decoded.
 */
export type DeckScreenshotInput = typeof DeckScreenshotInput.Type;

/**
 * The input of `catalog`, decoded.
 */
export type CatalogInput = typeof CatalogInput.Type;

/**
 * The input of `comments`, decoded.
 */
export type CommentsInput = typeof CommentsInput.Type;

/**
 * The input of `goto`, decoded.
 */
export type GotoInput = typeof GotoInput.Type;

/**
 * The input of `new_slide`, decoded.
 */
export type NewSlideInput = typeof NewSlideInput.Type;

/**
 * The input of `reorder_slides`, decoded.
 */
export type ReorderSlidesInput = typeof ReorderSlidesInput.Type;

/**
 * The input of `remove_slide`, decoded.
 */
export type RemoveSlideInput = typeof RemoveSlideInput.Type;
