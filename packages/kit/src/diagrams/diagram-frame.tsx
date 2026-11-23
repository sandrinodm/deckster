import { useId, type CSSProperties, type ReactNode, type Ref } from 'react';

import type { DiagramKind } from '#diagrams/diagram-description.ts';

import '#diagrams/diagrams.css';

/**
 * Props of {@link DiagramFrame}.
 */
type DiagramFrameProps = {
  /**
   * The root element, for measuring and for the description.
   */
  ref?: Ref<HTMLElement>;

  /**
   * Which diagram component draws in it.
   */
  kind: DiagramKind;

  /**
   * The diagram's name for screen readers.
   */
  title: string;

  /**
   * The text summary read after the name: nodes and connections in reading order.
   */
  summary: string;

  /**
   * Whether layout has finished; the frame stays invisible until then.
   */
  ready: boolean;

  /**
   * A fixed height in canvas pixels; without it the frame fills its region.
   */
  height?: number | undefined;

  /**
   * What changed at this step, in a sentence, announced politely to screen readers as the slide
   * steps (the label stays the title, the summary its description).
   */
  live?: string | undefined;

  /**
   * `data-*` attributes for `deckster lint` and tests.
   */
  data?: Readonly<Record<`data-${string}`, string | undefined>>;

  /**
   * The drawing.
   */
  children?: ReactNode;
};

/**
 * The root every kit diagram draws in: a figure that fills its region (or takes a fixed height),
 * marked `data-diagram="<kind>"` for `deckster lint` and exporters, a figure named for screen
 * readers by its title and described by its text summary (both in visually hidden text that stays
 * put as the slide steps), with a polite live region that announces what each step changes, and
 * hidden until its layout is ready so nothing is seen half placed.
 */
export function DiagramFrame({
  ref,
  kind,
  title,
  summary,
  ready,
  height,
  live,
  data,
  children,
}: DiagramFrameProps): ReactNode {
  const style: CSSProperties | undefined = height === undefined ? undefined : { height };
  const summaryId = useId();
  return (
    <figure
      ref={ref}
      className={`kit-diagram kit-diagram-${kind}`}
      data-diagram={kind}
      data-diagram-title={title}
      data-ready={String(ready)}
      data-fixed-height={height === undefined ? undefined : 'true'}
      aria-label={title}
      aria-describedby={summary === '' ? undefined : summaryId}
      style={style}
      {...data}>
      {children}
      {summary === '' ? null : (
        <p id={summaryId} className="kit-diagram-sr" data-decorative="">
          {summary}
        </p>
      )}
      {live === undefined ? null : (
        <p className="kit-diagram-sr" aria-live="polite" aria-atomic="true" data-decorative="">
          {live}
        </p>
      )}
    </figure>
  );
}
