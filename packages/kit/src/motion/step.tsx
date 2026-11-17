import { useStepAt, type StepProps } from '@deckster/engine';
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

import { useReveal } from '#charts/frame/chart-step.tsx';
import { checkComponentProps } from '#components/check-component-props.ts';
import { assertStepEffect, DEFAULT_STEP_EFFECT, type StepEffect } from '#motion/step-effects.ts';
import {
  FULL_SPAN,
  holdsInlineContent,
  measureContentSpan,
  sameSpan,
  type ContentSpan,
} from '#motion/step-geometry.ts';
import { RevealContext, useStillMotion } from '#motion/still-motion.ts';

/**
 * Props of the kit's {@link Step}: the engine's, plus how the content comes in and whether it
 * recedes once the slide moves on.
 */
export type KitStepProps = StepProps & {
  /**
   * How the content comes in: `rise` (the default), `fade`, `scale`, `blur` or `wipe`.
   */
  effect?: StepEffect;

  /**
   * Whether the content recedes to the brand's muted color once a later step of the slide is
   * reached, so the step just revealed is the one at full strength.
   */
  focus?: boolean;
};

/**
 * The kit's `Step`, which replaces the engine's for MDX and TSX slides alike. Content keeps its
 * space while hidden, as with the engine's, and each element in it comes into place with its
 * `effect` and the brand's durations and easings when its step is reached, and fades out when the
 * deck steps back. With `focus` its text recedes to the muted role color (never to a lower opacity,
 * so it keeps the brand's contrast) once a later step is reached, and comes back when the deck
 * steps back to it.
 *
 * Static mode and `SlideView` copies show or hide with no motion and never recede, so screenshots,
 * `deck lint` and exports see every revealed step at full strength.
 *
 * @throws Error when a prop is not one the catalog lists, `at` is missing, or `effect` is not one
 *   of the effects; RangeError when `at` is not an integer of 1 or more.
 */
export function Step(props: KitStepProps): ReactNode {
  checkComponentProps('Step', props);
  const { at, effect = DEFAULT_STEP_EFFECT, focus = false, children } = props;
  assertStepEffect(effect);

  const state = useStepAt(at);
  const reveal = useReveal(at);
  const still = useStillMotion();
  const ref = useRef<HTMLSpanElement | null>(null);
  const inline = useInlineFlow(ref, children);
  const span = useContentSpan(ref, reveal === 'play' && !still && MEASURED_EFFECTS.has(effect));
  return (
    <span
      ref={ref}
      className="deck-step kit-step"
      data-step={at}
      data-step-state={state}
      data-effect={effect}
      data-reveal={reveal}
      data-focus={focusState(focus, state === 'past' && !still)}
      data-flow={inline ? 'inline' : undefined}
      data-motion={still ? 'off' : 'on'}
      style={stepStyle(span, inline)}>
      <RevealContext value={reveal}>{children}</RevealContext>
    </span>
  );
}

/**
 * The effects that act on where the content is rather than on its whole box: `scale` grows from the
 * middle of the content and `wipe` travels from its start to its end.
 */
const MEASURED_EFFECTS: ReadonlySet<StepEffect> = new Set(['scale', 'wipe']);

/**
 * How many decimal places the start and end of the measured span keep in the custom properties the
 * stylesheet reads, so a span is written with the same digits each time it is measured.
 */
const SPAN_DECIMAL_PLACES = 4;

/**
 * Whether the step holds words inside a line, read after every render so a slide that changes what
 * the step holds is followed. Such a step is shown inline, so its own box carries the effect.
 *
 * @param ref - The step's wrapper.
 * @param children - What the step holds, which re-checks the flow when it changes.
 */
function useInlineFlow(ref: RefObject<HTMLSpanElement | null>, children: ReactNode): boolean {
  const [inline, setInline] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element !== null) {
      setInline(holdsInlineContent(element));
    }
  }, [ref, children]);
  return inline;
}

/**
 * Where the step's content sits across its boxes, measured just before the step plays (when the
 * text has its final fonts and the boxes their final widths), and kept in state so the stylesheet
 * reads it as custom properties.
 *
 * @param ref - The step's wrapper.
 * @param measures - Whether to measure now: the step is starting to play an effect that needs it.
 */
function useContentSpan(
  ref: RefObject<HTMLSpanElement | null>,
  measures: boolean,
): ContentSpan | undefined {
  const [span, setSpan] = useState<ContentSpan>();
  useLayoutEffect(() => {
    const element = ref.current;
    if (!measures || element === null) {
      return;
    }

    const measured = measureContentSpan(element);
    setSpan((before) => (before !== undefined && sameSpan(before, measured) ? before : measured));
  }, [ref, measures]);
  return span;
}

/**
 * The step wrapper's own style: shown inline when it holds words inside a line (the engine's
 * stylesheet makes every step `display: contents`, which has no box to fade), and the custom
 * properties that hand the content span to the stylesheet, inherited by every box in the step.
 * Before the span is measured there are none, so the effects act on the whole box.
 *
 * @param span - The measured span.
 * @param inline - Whether the step holds words inside a line.
 */
function stepStyle(span: ContentSpan | undefined, inline: boolean): CSSProperties | undefined {
  const measured = span !== undefined && !sameSpan(span, FULL_SPAN);
  if (!measured && !inline) {
    return undefined;
  }

  const style: CSSProperties & Record<`--${string}`, string> = {
    ...(inline ? { display: 'inline' } : {}),
    ...(measured
      ? {
          '--kit-step-start': span.start.toFixed(SPAN_DECIMAL_PLACES),
          '--kit-step-end': span.end.toFixed(SPAN_DECIMAL_PLACES),
        }
      : {}),
  };
  return style;
}

/**
 * The `data-focus` a step carries: nothing without `focus`, `recede` once a later step is shown,
 * else `hold`.
 *
 * @param focus - Whether the step has `focus`.
 * @param recedes - Whether a later step is shown and the deck is live.
 */
function focusState(focus: boolean, recedes: boolean): 'recede' | 'hold' | undefined {
  if (!focus) {
    return undefined;
  }

  return recedes ? 'recede' : 'hold';
}
