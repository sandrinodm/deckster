import { Schema } from 'effect';

import { BridgeBrand, ColorScheme } from '#protocol/bridge-brand.ts';
import { BRIDGE_CHANNEL, BRIDGE_VERSION } from '#protocol/channel.ts';

/**
 * The most steps an app may ask a slide for. A runaway count is a bug, not a request.
 */
export const MAX_REQUESTED_STEPS = 64;

/**
 * Builds the schema of one message: the envelope (`channel`, `version`), the `type` and the
 * message's own fields.
 *
 * @param type - The message type.
 * @param fields - The fields besides the envelope and `type`.
 */
function message<const Type extends string, const Fields extends Schema.Struct.Fields>(
  type: Type,
  fields: Fields,
) {
  return Schema.Struct({
    channel: Schema.Literal(BRIDGE_CHANNEL),
    version: Schema.Literal(BRIDGE_VERSION),
    type: Schema.Literal(type),
    ...fields,
  });
}

/**
 * Where the app sits in the deck.
 */
const SlidePosition = Schema.Struct({
  /**
   * The slide's zero-based index in the deck.
   */
  index: Schema.Int,

  /**
   * The slide id, its file name without extension.
   */
  id: Schema.String,
});

/**
 * Deck to app, sent after the app's `hello` and again whenever the brand, scheme or slide changes:
 * the brand tokens of the slide's surface, the color scheme and where the app sits.
 */
export const InitMessage = message('init', {
  /**
   * The brand as a typed object.
   */
  brand: BridgeBrand,

  /**
   * The brand's custom properties for the slide's surface, such as `--brand-color-fg`, to set on
   * the app's root element.
   */
  cssVariables: Schema.Record(Schema.String, Schema.String),

  /**
   * `@font-face` rules for the brand's fonts, so the app can set its text in them. Empty when the
   * deck has none to share.
   */
  fontFaces: Schema.String,

  /**
   * The color scheme of the surface.
   */
  scheme: ColorScheme,

  /**
   * The slide the app sits on.
   */
  slide: SlidePosition,

  /**
   * The slide's current step, from 0.
   */
  step: Schema.Int,

  /**
   * Whether the slide is on screen.
   */
  active: Schema.Boolean,

  /**
   * Whether the deck renders in static mode (`?static`, export, screenshots).
   */
  static: Schema.Boolean,
});

/**
 * Deck to app: the slide came on screen. Start timers, animations and media.
 */
export const ActivateMessage = message('activate', {});

/**
 * Deck to app: the slide left the screen. Pause timers and media; the app stays mounted when the
 * frame keeps itself alive.
 */
export const DeactivateMessage = message('deactivate', {});

/**
 * Deck to app: the slide's step changed.
 */
export const StepMessage = message('step', {
  /**
   * The slide's current step, from 0. It is the `at` value of the latest revealed step, so with
   * `requestSteps(3)` and no other steps it counts 0, 1, 2, 3.
   */
  step: Schema.Int,
});

/**
 * Deck to app: static mode changed.
 */
export const StaticMessage = message('static', {
  /**
   * Whether the deck renders in static mode.
   */
  static: Schema.Boolean,
});

/**
 * Every message the deck sends to an app.
 */
export const DeckMessage = Schema.Union([
  InitMessage,
  ActivateMessage,
  DeactivateMessage,
  StepMessage,
  StaticMessage,
]);

/**
 * Every message the deck sends to an app.
 */
export type DeckMessage = typeof DeckMessage.Type;

/**
 * App to deck, sent as soon as the app listens: asks for `init`.
 */
export const HelloMessage = message('hello', {});

/**
 * App to deck: the app has drawn its first complete frame. The deck holds the slide's `ready()`
 * until it arrives (or a timeout passes).
 */
export const ReadyMessage = message('ready', {});

/**
 * App to deck: the app owns steps of the slide. The deck registers `count` steps, so the audience
 * clicker advances the app before it advances the slide.
 */
export const RequestStepsMessage = message('requestSteps', {
  /**
   * How many steps the app needs, from 0 to {@link MAX_REQUESTED_STEPS}.
   */
  count: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: MAX_REQUESTED_STEPS })),
});

/**
 * App to deck: go to the next step or slide, as the clicker would.
 */
export const NextMessage = message('next', {});

/**
 * App to deck: go to the previous step or slide.
 */
export const PrevMessage = message('prev', {});

/**
 * App to deck: the size the app would like, in CSS pixels. A hint; the deck decides.
 */
export const ResizeMessage = message('resize', {
  /**
   * The content width the app wants.
   */
  width: Schema.optionalKey(Schema.Finite),

  /**
   * The content height the app wants.
   */
  height: Schema.optionalKey(Schema.Finite),
});

/**
 * App to deck: something failed. The deck shows its branded fallback and the poster.
 */
export const ErrorMessage = message('error', {
  /**
   * What went wrong, as a sentence.
   */
  message: Schema.String,
});

/**
 * App to deck: the user pressed Escape inside the app, so keyboard control goes back to the deck.
 */
export const ReleaseMessage = message('release', {});

/**
 * App to deck: the app's page gained or lost keyboard focus. While it has focus the deck cannot see
 * key presses, so the deck shows its "Esc to return" hint.
 */
export const FocusMessage = message('focus', {
  /**
   * Whether the app's page now has focus.
   */
  focused: Schema.Boolean,
});

/**
 * Every message an app sends to the deck.
 */
export const AppMessage = Schema.Union([
  HelloMessage,
  ReadyMessage,
  RequestStepsMessage,
  NextMessage,
  PrevMessage,
  ResizeMessage,
  ErrorMessage,
  ReleaseMessage,
  FocusMessage,
]);

/**
 * Every message an app sends to the deck.
 */
export type AppMessage = typeof AppMessage.Type;

/**
 * A message without its envelope, which {@link envelope} adds.
 */
export type Payload<Message> = Message extends unknown
  ? Omit<Message, 'channel' | 'version'>
  : never;

/**
 * A message the deck can send, without its envelope.
 */
export type DeckPayload = Payload<DeckMessage>;

/**
 * A message an app can send, without its envelope.
 */
export type AppPayload = Payload<AppMessage>;

/**
 * Wraps a payload into a message of the current protocol.
 *
 * @param payload - A message without its `channel` and `version`.
 * @returns The message to post.
 */
export function envelope<Message extends object>(
  payload: Message,
): Message & { channel: typeof BRIDGE_CHANNEL; version: typeof BRIDGE_VERSION } {
  return { ...payload, channel: BRIDGE_CHANNEL, version: BRIDGE_VERSION };
}

/**
 * Whether a value is a message the deck sends to an app. Everything else, including messages of
 * another channel or version and malformed ones, is not.
 */
export const isDeckMessage = Schema.is(DeckMessage);

/**
 * Whether a value is a message an app sends to the deck.
 */
export const isAppMessage = Schema.is(AppMessage);
