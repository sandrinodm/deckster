import { defineLayout, useStatic, type LayoutProps } from '@deckster/engine';
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';

import type {
  MatrixItemEntry,
  matrixLayoutContract,
  MatrixQuadrant,
} from '#layouts/matrix-layout.contract.ts';

import { useFitLevel } from '#foundation/fit-level.ts';
import { useRenderOnFontLoad } from '#foundation/fit-text.ts';
import { Footnote, Frame, Region, SlideHeader } from '#foundation/slide-parts.tsx';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';
import {
  placeFixed,
  placeLabels,
  type FixedInput,
  type LabelInput,
  type LabelPlacement,
  type PlotBox,
} from '#layouts/matrix-labels.ts';
import { MATRIX_QUADRANTS, quadrantOf } from '#layouts/matrix-layout.contract.ts';
import { enterProps } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import '#layouts/matrix-layout.css';

/**
 * The entrance order of the plot; the header comes first, the note after.
 */
const PLOT_ORDER = 1;

/**
 * The entrance order of the note beside the plot.
 */
const NOTE_ORDER = 2;

/**
 * The most lines the title takes in its column before it steps down in size.
 */
const TITLE_MAX_LINES = 4;

/**
 * The step the other items arrive on when the slide reveals.
 */
const FIELD_STEP = 1;

/**
 * The step the item marked `us` arrives on, with its tint and the note.
 */
const SUBJECT_STEP = 2;

/**
 * The type steps the note tries, largest first, until the title column fits beside the plot.
 */
const NOTE_LEVELS = ['lead', 'body', 'small'] as const;

/**
 * Custom properties the stylesheet places a dot by: its position on each axis, 0 to 100.
 */
type DotStyle = CSSProperties & {
  /**
   * The position on the horizontal axis.
   */
  '--kit-x': number;

  /**
   * The position on the vertical axis.
   */
  '--kit-y': number;
};

/**
 * Where the labels inside the plot stand.
 */
type MatrixPlacement = {
  /**
   * The boxes of the horizontal axis's end labels, low then high.
   */
  ends: readonly PlotBox[];

  /**
   * Each caption's box, top left, top right, bottom left, bottom right.
   */
  captions: readonly PlotBox[];

  /**
   * The placement of each item's name, in item order.
   */
  names: readonly LabelPlacement[];
};

/**
 * The placement as last computed, with the measurements it was computed from, so it is only set
 * again when they change.
 */
type PlacementState = MatrixPlacement & {
  /**
   * The measurements, as JSON.
   */
  measured: string;
};

/**
 * The plot as measured for the planners.
 */
type PlotMeasure = {
  /**
   * The plot's width.
   */
  width: number;

  /**
   * The plot's height.
   */
  height: number;

  /**
   * The room between a dot and its name, and kept between names.
   */
  gap: number;

  /**
   * The room between a caption and the plot's edges and axes.
   */
  pad: number;

  /**
   * The sizes of the horizontal axis's end labels, low then high.
   */
  ends: readonly FixedInput[];

  /**
   * Each caption's size, in quadrant order.
   */
  captions: readonly FixedInput[];

  /**
   * Each item's dot and the size of its name, in item order.
   */
  labels: readonly LabelInput[];
};

/**
 * The `matrix` layout: two columns over the safe area. On the left, the eyebrow and title (up to
 * four lines) with the note under them and the footnote on the bottom line; on the right, a square
 * plot five grid columns wide (smaller on a slide too short for it), cut into four quadrants by two
 * axes that cross at its centre. The labels of the vertical axis stand above and below the plot;
 * those of the horizontal axis inside it at the ends of the axis line. A quadrant caption sits
 * quietly in each corner. Each item is a dot placed from its `x` and `y` with its name on the side
 * where it has room: the layout measures the plot, the dots and the labels with layout geometry and
 * lets a planner put every name inside the plot, clear of the dots, the other names and the fixed
 * labels (which step aside from a dot themselves); a plot too crowded for that keeps the collisions
 * to a minimum, which `deck lint` reports. The item marked `us` is set in the accent with a ring
 * and its quadrant tinted with the surface's raised color; the rest are muted. With `reveal`, the
 * axes and captions show first, the other items on step 1 and the marked item, its tint and the
 * note on step 2. When the title column does not fit, the note steps down from the lead size.
 */
function MatrixLayout({ frontmatter, slots }: LayoutProps<typeof matrixLayoutContract>): ReactNode {
  const { items, reveal } = frontmatter;
  const isStatic = useStatic();
  const plot = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const subject = items.findIndex((item) => item.us === true);
  const placement = useMatrixPlacement(plot, subject, items.length);
  const { level } = useFitLevel(column, column, NOTE_LEVELS.length, JSON.stringify(frontmatter), {
    overflow: true,
  });
  const noteType = NOTE_LEVELS[level] ?? 'small';
  const lastStep = subject === -1 ? FIELD_STEP : SUBJECT_STEP;
  const tinted = subject === -1 ? undefined : quadrantFor(items[subject]);
  const marks = items.map((item, index) => (
    <ItemMark
      key={index}
      index={index}
      item={item}
      subject={index === subject}
      placement={placement.names[index]}
    />
  ));
  const field = <ul className="kit-matrix-layer">{marks.filter((_, at) => at !== subject)}</ul>;
  const marked = subject === -1 ? null : <ul className="kit-matrix-layer">{marks[subject]}</ul>;
  const tint =
    tinted === undefined ? null : (
      <span
        className="kit-matrix-tint"
        data-quadrant={tinted}
        aria-hidden="true"
        data-decorative=""
      />
    );
  const note =
    slots.body === undefined ? null : (
      <div
        className={`kit-matrix-note kit-prose kit-type-${noteType}`}
        {...enterProps(NOTE_ORDER, isStatic)}>
        {slots.body}
      </div>
    );
  return (
    <Frame layout="matrix" variant={{ 'data-subject': String(subject !== -1) }}>
      <Region className="kit-matrix">
        <div ref={column} className="kit-matrix-text">
          <SlideHeader
            eyebrow={frontmatter.eyebrow}
            title={frontmatter.title}
            maxLines={TITLE_MAX_LINES}
          />
          {reveal && note !== null ? <Step at={lastStep}>{note}</Step> : note}
          <Footnote>{slots.footnote}</Footnote>
        </div>
        <figure className="kit-matrix-figure" {...enterProps(PLOT_ORDER, isStatic)}>
          <AxisEnd text={frontmatter.y.high} axis="y" end="high" />
          <div ref={plot} className="kit-matrix-plot">
            {reveal ? <Step at={lastStep}>{tint}</Step> : tint}
            <span className="kit-matrix-line" data-axis="x" aria-hidden="true" data-decorative="" />
            <span className="kit-matrix-line" data-axis="y" aria-hidden="true" data-decorative="" />
            <AxisEnd text={frontmatter.x.low} axis="x" end="low" box={placement.ends[0]} />
            <AxisEnd text={frontmatter.x.high} axis="x" end="high" box={placement.ends[1]} />
            <Captions
              quadrants={frontmatter.quadrants}
              tinted={tinted}
              boxes={placement.captions}
            />
            {reveal ? (
              <Step at={FIELD_STEP} effect="fade">
                {field}
              </Step>
            ) : (
              field
            )}
            {reveal && marked !== null ? (
              <Step at={SUBJECT_STEP} effect="fade">
                {marked}
              </Step>
            ) : (
              marked
            )}
          </div>
          <AxisEnd text={frontmatter.y.low} axis="y" end="low" />
        </figure>
      </Region>
    </Frame>
  );
}

/**
 * Measures the plot after every render and places the labels inside it (the horizontal axis's end
 * labels, the quadrant captions and the items' names), keeping the placement in React state: they
 * render where the last placement put them, and a new placement is set (and the layout rendered
 * again, before paint) only when the measurements change, such as when the web fonts finish
 * loading.
 *
 * @param plot - The plot.
 * @param subject - The index of the item marked `us`, placed first; -1 for none.
 * @param count - How many items the plot holds.
 * @returns Where the labels stand; empty before the first measurement.
 */
function useMatrixPlacement(
  plot: RefObject<HTMLDivElement | null>,
  subject: number,
  count: number,
): MatrixPlacement {
  const [state, setState] = useState<PlacementState>({
    measured: '',
    ends: [],
    captions: [],
    names: [],
  });
  useRenderOnFontLoad();
  useLayoutEffect(() => {
    const element = plot.current;
    if (element === null) {
      return;
    }

    const measured = measurePlot(element, count);
    const key = JSON.stringify(measured);
    if (key === state.measured) {
      return;
    }

    const { width, height, gap, labels } = measured;
    const fixed = placeFixed({ ...measured, dots: labels });
    const first = subject === -1 ? undefined : subject;
    const obstacles = [...fixed.ends, ...fixed.captions];
    const names = placeLabels({ width, height, gap, labels, obstacles, first });
    setState({ measured: key, ...fixed, names });
  });
  return state;
}

/**
 * The plot as the planners need it, measured with layout geometry: its size, the room to keep, the
 * sizes of the end labels and the captions, and every dot's centre and radius with the size of its
 * item's name, in pixels from the plot's corner.
 *
 * @param plot - The plot element, the offset parent of its dots, names and captions.
 * @param count - How many items the plot holds.
 */
function measurePlot(plot: HTMLElement, count: number): PlotMeasure {
  const style = getComputedStyle(plot);
  const captions = Array.from(plot.querySelectorAll<HTMLElement>('.kit-matrix-caption'));
  const ends = Array.from(plot.querySelectorAll<HTMLElement>('.kit-matrix-end'));
  return {
    width: plot.clientWidth,
    height: plot.clientHeight,
    gap: Number.parseFloat(style.getPropertyValue('--kit-matrix-gap')) || 0,
    pad: Number.parseFloat(style.getPropertyValue('--kit-matrix-pad')) || 0,
    ends: ends.map(sizeOf),
    captions: captions.map(sizeOf),
    // The subject is drawn last, so its dot and name follow the others in the DOM; each is found
    // by its item's index instead.
    labels: Array.from({ length: count }, (_, index) => {
      const dot = plot.querySelector<HTMLElement>(`.kit-matrix-dot[data-item="${index}"]`);
      const name = plot.querySelector<HTMLElement>(`.kit-matrix-name[data-item="${index}"]`);
      return {
        cx: (dot?.offsetLeft ?? 0) + (dot?.offsetWidth ?? 0) / 2,
        cy: (dot?.offsetTop ?? 0) + (dot?.offsetHeight ?? 0) / 2,
        radius: (dot?.offsetWidth ?? 0) / 2,
        width: name?.offsetWidth ?? 0,
        height: name?.offsetHeight ?? 0,
      };
    }),
  };
}

/**
 * An element's size, from layout geometry.
 *
 * @param element - The element.
 */
function sizeOf(element: HTMLElement): FixedInput {
  return { width: element.offsetWidth, height: element.offsetHeight };
}

/**
 * A box's place on the plot as inline style, or hidden while it waits for its first placement.
 *
 * @param box - The box, once placed.
 */
function placedStyle(box: PlotBox | undefined): CSSProperties {
  return box === undefined ? { visibility: 'hidden' } : { left: `${box.x}px`, top: `${box.y}px` };
}

/**
 * The quadrant the item marked `us` stands in, for its tint.
 *
 * @param item - The item, if there is one.
 */
function quadrantFor(item: MatrixItemEntry | undefined): MatrixQuadrant | undefined {
  return item === undefined ? undefined : quadrantOf(item.x, item.y);
}

/**
 * Props of {@link AxisEnd}.
 */
type AxisEndProps = {
  /**
   * The label.
   */
  text: string;

  /**
   * Which axis it ends: `x` across the plot, `y` up it.
   */
  axis: 'x' | 'y';

  /**
   * Which end it stands at.
   */
  end: 'low' | 'high';

  /**
   * Where it stands in the plot, for the horizontal axis's labels, once placed.
   */
  box?: PlotBox | undefined;
};

/**
 * The label at one end of an axis: above or below the plot for the vertical axis, inside it at the
 * end of the axis line for the horizontal one.
 */
function AxisEnd({ text, axis, end, box }: AxisEndProps): ReactNode {
  return (
    <p
      className="kit-matrix-end kit-type-label"
      data-axis={axis}
      data-end={end}
      style={axis === 'x' ? placedStyle(box) : undefined}>
      {smartPunctuation(text)}
    </p>
  );
}

/**
 * Props of {@link Captions}.
 */
type CaptionsProps = {
  /**
   * The four captions in reading order, if the slide has them.
   */
  quadrants: readonly string[] | undefined;

  /**
   * The quadrant of the item marked `us`, whose caption takes the accent.
   */
  tinted: string | undefined;

  /**
   * Where each caption stands, once placed.
   */
  boxes: readonly PlotBox[];
};

/**
 * The quadrant captions, each in its quadrant where the planner put it: the outer corner unless a
 * dot stands there.
 */
function Captions({ quadrants, tinted, boxes }: CaptionsProps): ReactNode {
  if (quadrants === undefined) {
    return null;
  }

  return MATRIX_QUADRANTS.map((corner, index) => (
    <p
      key={corner}
      className="kit-matrix-caption kit-type-caption"
      data-corner={corner}
      data-tinted={String(corner === tinted)}
      style={placedStyle(boxes[index])}>
      {smartPunctuation(quadrants[index] ?? '')}
    </p>
  ));
}

/**
 * Props of {@link ItemMark}.
 */
type ItemMarkProps = {
  /**
   * The item from the frontmatter.
   */
  item: MatrixItemEntry;

  /**
   * Its place in `items:`, by which the layout measures its dot and name.
   */
  index: number;

  /**
   * Whether it is the item marked `us`.
   */
  subject: boolean;

  /**
   * Where its name stands, once placed.
   */
  placement: LabelPlacement | undefined;
};

/**
 * One item: its dot at its position and its name on the side the planner chose. Before the first
 * placement the name waits, hidden, at the plot's corner, where it is measured.
 */
function ItemMark({ index, item, subject, placement }: ItemMarkProps): ReactNode {
  const dot: DotStyle = { '--kit-x': item.x, '--kit-y': item.y };
  const name = placedStyle(placement?.box);
  const nameType = subject ? 'kit-type-title' : 'kit-type-small';
  return (
    <li className="kit-matrix-item" data-us={String(subject)}>
      <span
        className="kit-matrix-dot"
        style={dot}
        data-item={index}
        aria-hidden="true"
        data-decorative="">
        {subject ? <span className="kit-matrix-core" /> : null}
      </span>
      <span
        className={`kit-matrix-name ${nameType}`}
        data-item={index}
        data-fit={subject ? 'scaled' : undefined}
        data-side={placement?.side ?? 'right'}
        style={name}>
        {smartPunctuation(item.name)}
      </span>
    </li>
  );
}

/**
 * The `matrix` layout's component.
 */
export const matrixLayout = defineLayout<typeof matrixLayoutContract>({
  name: 'matrix',
  component: MatrixLayout,
});
