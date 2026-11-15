import { useReadyHold, useSlide, useStatic, useStep } from '@deckster/engine';
import { useId, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';

import { StepMarks } from '#code/step-marks.tsx';
import { describeDiagram } from '#diagrams/describe-diagram.ts';
import { DiagramFrame } from '#diagrams/diagram-frame.tsx';
import { assertDiagramProps } from '#diagrams/diagram-props.ts';
import { useDiagramTokens, useReducedMotion } from '#diagrams/diagram-tokens.ts';
import { checkSvg, recolorSvg, type SvgRole } from '#diagrams/svg-roles.ts';
import { sanitizeSvgInBrowser } from '#diagrams/svg-sanitize-dom.ts';
import { useElementSize } from '#diagrams/use-element-size.ts';

/**
 * Characters a React id may contain that an SVG fragment id leaves out.
 */
const SVG_ID_UNSAFE_PATTERN = /[^a-z0-9]/gi;

/**
 * The stagger between strokes relative to the brand’s fast motion duration.
 */
const STROKE_STAGGER_SHARE = 0.5;

/**
 * Props of {@link Svg}.
 */
export type SvgProps = {
  /**
   * The SVG file. In MDX a relative path (`./floor.svg`) is read at build time and inlined, so its
   * shapes can take brand colors and step reveals; in TSX pass the markup (`?raw` import).
   */
  src?: string;

  /**
   * What the drawing shows, for people who cannot see it.
   */
  title: string;

  /**
   * Elements to reveal by step, by id: `{{ dock: 1, sorting: 2 }}` shows `#dock` from step 1.
   */
  steps?: Readonly<Record<string, number>>;

  /**
   * Draw the strokes of each element on as it is revealed (and the whole drawing on entry when
   * nothing has a step).
   */
  draw?: boolean;

  /**
   * Colors in the file to replace with color roles of the slide's surface: `{{ '#ff5a1f': 'accent',
   * '#222222': 'fg' }}`. Shapes can also name a role themselves with `data-fill="accent"` or
   * `data-stroke="edge"`.
   */
  recolor?: Readonly<Record<string, SvgRole>>;

  /**
   * A fixed height in canvas pixels; without it the drawing fills its region, keeping its
   * proportions.
   */
  height?: number;
};

/**
 * A hand-made or imported SVG drawn inline, so it follows the brand: shapes take the surface's
 * color roles (through `recolor` or `data-fill`/`data-stroke` attributes), elements appear by step
 * by id, and strokes can draw themselves on. Static mode shows each step's finished drawing. Text
 * inside is scaled with the drawing, so `deck lint` checks that it stays readable.
 *
 * ```mdx
 * <Svg src="../assets/warehouse.svg" title="The warehouse floor" steps={{ inbound: 1, sorting: 2 }} recolor={{ '#e4572e': 'accent' }} draw />
 * ```
 *
 * @throws Error when neither `src` nor markup is given.
 */
export function Svg({ src, title, steps, draw = false, recolor, height }: SvgProps): ReactNode {
  assertDiagramProps('Svg', { src, title, steps, draw, recolor, height });
  const markup = useMemo(
    () => ({ __html: recolorSvg(safeMarkup(src, title, recolor, steps), recolor ?? {}) }),
    [src, title, recolor, steps],
  );
  const step = useStep();
  const isStatic = useStatic();
  const { isActive } = useSlide();
  const root = useRef<HTMLElement | null>(null);
  const size = useElementSize(root);
  const tokens = useDiagramTokens(root);
  const reduced = useReducedMotion();
  useReadyHold(size === undefined);
  const revealed = useRef(new Set<string>());
  const generated = useId();
  const diagramId = `svg-${generated.replace(SVG_ID_UNSAFE_PATTERN, '')}`;
  useLayoutEffect(() => {
    const element = root.current;
    if (element === null) {
      return;
    }

    const animate = draw && isActive && !isStatic && !reduced && tokens !== undefined;
    for (const [id, revealStep] of Object.entries(steps ?? {})) {
      const target = element.querySelector(`#${CSS.escape(id)}`);
      if (target === null) {
        continue;
      }

      const visible = step >= revealStep;
      target.setAttribute('data-visible', visible ? 'true' : 'false');
      if (visible && !revealed.current.has(id) && animate) {
        drawOn(target, {
          duration: tokens.motion.slow * 2,
          stagger: tokens.motion.fast * STROKE_STAGGER_SHARE,
          easing: `cubic-bezier(${tokens.motion.easing.join(', ')})`,
        });
      }

      if (visible) {
        revealed.current.add(id);
      } else {
        revealed.current.delete(id);
      }
    }

    element.setAttribute(
      'data-diagram-description',
      JSON.stringify(
        describeDiagram({
          element,
          kind: 'svg',
          id: diagramId,
          step,
          summary: title,
          groups: [],
          nodes: [],
          edges: [],
          texts: Array.from(element.querySelectorAll('text')),
          svg: element.querySelector('.kit-svg') ?? element,
        }),
      ),
    );
  });
  return (
    <DiagramFrame
      ref={root}
      kind="svg"
      title={title}
      summary=""
      ready={size !== undefined}
      height={height}
      data={{ 'data-diagram-id': diagramId }}>
      <StepMarks ats={[...new Set(Object.values(steps ?? {}))]} />
      <div className="kit-svg" dangerouslySetInnerHTML={markup} />
    </DiagramFrame>
  );
}

/**
 * Draws an element's strokes on: every stroked shape inside traces itself from start to end.
 *
 * @param target - The element revealed.
 * @param timing - How long a stroke takes and the delay between one shape and the next, in
 *   milliseconds, and the brand's easing.
 */
function drawOn(
  target: Element,
  timing: { duration: number; stagger: number; easing: string },
): void {
  const shapes = [
    target,
    ...Array.from(target.querySelectorAll('path, line, polyline, polygon, circle, rect, ellipse')),
  ];
  shapes.forEach((shape, index) => {
    if (!(shape instanceof SVGGeometryElement)) {
      return;
    }

    const length = shape.getTotalLength();
    if (length <= 0) {
      return;
    }

    shape.animate(
      [
        { strokeDasharray: `${length}`, strokeDashoffset: `${length}` },
        { strokeDasharray: `${length}`, strokeDashoffset: '0' },
      ],
      {
        duration: timing.duration,
        delay: index * timing.stagger,
        easing: timing.easing,
        fill: 'backwards',
      },
    );
  });
}

/**
 * The markup a `src` holds, sanitised and checked against `recolor` and `steps`. It is parsed with
 * the browser's HTML parser in an inert `DOMParser` document, cleaned with the same allowlist as
 * the build and serialised from the cleaned tree, so what reaches `innerHTML` is only allow-listed
 * SVG with escaped text and values (MDX slides arrive cleaned by the build, which warns about what
 * it removed, and come through unchanged; a TSX slide's markup is cleaned here, with a console
 * warning).
 *
 * @param src - The prop.
 * @param title - The drawing's title, for messages.
 * @param recolor - Colors to roles.
 * @param steps - Ids to reveal by step.
 * @throws Error naming the fix when there is no markup, a role or an id is unknown.
 */
function safeMarkup(
  src: string | undefined,
  title: string,
  recolor: SvgProps['recolor'],
  steps: SvgProps['steps'],
): string {
  const where = `<Svg title="${title}">`;
  const { markup, dropped } = sanitizeSvgInBrowser(svgMarkup(src, title));
  if (dropped.length > 0) {
    console.warn(
      `${where} removed ${dropped.join('; ')}: inline drawings cannot run code or load files.`,
    );
  }

  const { errors } = checkSvg(
    markup,
    { ...(recolor === undefined ? {} : { recolor }), ...(steps === undefined ? {} : { steps }) },
    where,
  );
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  return markup;
}

/**
 * The SVG markup a `src` holds.
 *
 * @param src - The prop.
 * @param title - The drawing's title, for the message.
 * @throws Error naming the fix when there is no markup.
 */
function svgMarkup(src: string | undefined, title: string): string {
  if (src === undefined || !src.trimStart().startsWith('<')) {
    throw new Error(
      `<Svg title="${title}"> has no SVG markup. In MDX give \`src\` a relative path to an .svg ` +
        'file; in TSX import the file with `?raw` and pass the text.',
    );
  }

  return src;
}
