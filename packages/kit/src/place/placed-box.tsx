import type { LayoutBox, SpaceName } from '@deckster/brand';
import type { PlacedKind, PlacedName, PlacedWidth, PlacedZone } from '@deckster/engine/manifest';
import type { CSSProperties, ReactNode } from 'react';

import { LAYOUT_CANVAS_HEIGHT, LAYOUT_CANVAS_WIDTH } from '@deckster/brand';
import { useBrand } from '@deckster/brand/runtime';
import { useInsidePlacedLayer, usePlacedLayer } from '@deckster/engine';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import type { StepEffect } from '#motion/step-effects.ts';

import { useEnter } from '#motion/enter.ts';
import { Step } from '#motion/step.tsx';
import { resolvePlace, validatePlacementInput, type PlacedInput } from '#place/resolve-place.ts';

/**
 * Entrance order for placed elements without an explicit `at` step, so they arrive after main
 * layout regions.
 */
const PLACED_ENTER_ORDER = 3;

/**
 * Placement and reveal props shared by `<Place>`, `<Shape>` and `<Text>`.
 */
export type PlacementProps = {
  /**
   * Named anchor position within {@link zone}: `top-left`, `top`, `top-right`, `left`, `center`,
   * `right`, `bottom-left`, `bottom` or `bottom-right`.
   */
  place?: PlacedName;

  /**
   * Inclusive 1-based column range on the brand grid, such as `"9-12"` or `"4"`.
   */
  cols?: string;

  /**
   * Inclusive 1-based row range on the brand grid, such as `"1-2"` or `"6"`.
   */
  rows?: string;

  /**
   * Explicit canvas-pixel box `[x, y, width, height]`, as an escape hatch for imported templates.
   */
  box?: LayoutBox;

  /**
   * Frame the placement is measured in: `safe` (default), `canvas`, `header` or `footer`.
   */
  zone?: PlacedZone;

  /**
   * Width in grid columns or a size word (`sm`, `md`, `lg`).
   */
  width?: PlacedWidth;

  /**
   * Fixed height in grid rows.
   */
  height?: number;

  /**
   * Spacing token pulling a named placement inward from its zone edge.
   */
  inset?: SpaceName;

  /**
   * Optional author-supplied name for the element, used in export and diagnostics.
   */
  name?: string;

  /**
   * The step that reveals this element, an integer of 1 or more.
   */
  at?: number;

  /**
   * How the element comes in when `at` is set: `rise`, `fade`, `scale`, `blur` or `wipe`.
   */
  effect?: StepEffect;
};

/**
 * Props of {@link PlacedBox}.
 */
type PlacedBoxProps = {
  /**
   * Which placed primitive is rendering (`place`, `shape`, or `text`).
   */
  kind: PlacedKind;

  /**
   * Component name for validation error messages (`Place`, `Shape`, `Text`).
   */
  tagName: string;

  /**
   * Placement inputs to resolve against the active brand's spacing tokens.
   */
  placement: PlacedInput;

  /**
   * Optional author-supplied name, written to `data-placed-name`.
   */
  name?: string | undefined;

  /**
   * Optional step reveal index.
   */
  at?: number | undefined;

  /**
   * Optional step reveal effect.
   */
  effect?: StepEffect | undefined;

  /**
   * Additional class names applied to the placed container.
   */
  className?: string | undefined;

  /**
   * Additional inline styles merged after resolved positioning styles.
   */
  style?: (CSSProperties & Record<`--${string}`, string>) | undefined;

  /**
   * Additional data attributes applied to the placed container.
   */
  dataAttributes?: Readonly<Record<string, string | undefined>> | undefined;

  /**
   * Element content.
   */
  children?: ReactNode;
};

/**
 * Renders a placed element in canvas coordinates with `data-placed*` attributes, live rect
 * measurement against `.deck-placed`/`.deck-canvas`, `<Step>` or `useEnter` motion, and automatic
 * portaling into `div.deck-placed` when rendered from a TSX slide outside the placed layer.
 */
export function PlacedBox({
  kind,
  tagName,
  placement,
  name,
  at,
  effect,
  className,
  style,
  dataAttributes,
  children,
}: PlacedBoxProps): ReactNode {
  const { brand } = useBrand();
  const problems = validatePlacementInput(placement, brand.spacing);
  if (problems.length > 0) {
    const first = problems[0];
    throw new Error(
      `<${tagName}> placement error: ${first?.message ?? ''} ${first?.fix ?? ''}`.trim(),
    );
  }

  const resolution = resolvePlace(placement, brand.spacing);
  const enter = useEnter(PLACED_ENTER_ORDER);
  const insidePlacedLayer = useInsidePlacedLayer();
  const placedLayer = usePlacedLayer();
  const ref = useRef<HTMLDivElement | null>(null);
  const rectText = resolution.rect.join(',');
  const transform = resolution.style.transform ?? '';

  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }

    const measured = measurePlacedRect(element, transform);
    element.dataset['placedRect'] = measured === undefined ? rectText : measured.join(',');
  }, [rectText, transform, children]);

  const combinedStyle: CSSProperties & Record<`--${string}`, string> = {
    ...resolution.style,
    ...style,
  };
  const classes = className === undefined ? 'kit-placed' : `kit-placed ${className}`;
  const element = (
    <div
      ref={ref}
      className={classes}
      data-placed={kind}
      data-placed-rect={rectText}
      data-placed-zone={resolution.zone}
      data-placed-mode={resolution.mode}
      data-placed-spec={resolution.spec}
      data-placed-name={name}
      {...dataAttributes}
      {...(at === undefined ? enter : {})}
      style={combinedStyle}>
      {children}
    </div>
  );

  const wrapped =
    at === undefined ? (
      element
    ) : (
      <Step at={at} {...(effect === undefined ? {} : { effect })}>
        {element}
      </Step>
    );

  if (!insidePlacedLayer && placedLayer !== null) {
    return createPortal(wrapped, placedLayer);
  }

  return wrapped;
}

/**
 * Extracts any pass-through `data-*` attributes from a component's runtime props object (such as
 * dev-server source stamps).
 *
 * @param props - Component props object.
 * @returns Plain record of stringified `data-*` attributes.
 */
export function extractDataAttributes(props: object): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('data-') && value !== undefined) {
      result[key] = typeof value === 'string' ? value : String(value);
    }
  }

  return result;
}

/**
 * Measures the rendered canvas-pixel bounding box of a placed element, returning `undefined` when
 * running in an environment without layout metrics (such as SSR or happy-dom with zero-sized
 * boxes).
 *
 * @param element - The rendered `.kit-placed` element.
 * @param transform - The CSS `transform` applied for centered auto-sized axes, if any.
 */
function measurePlacedRect(element: HTMLElement, transform: string): LayoutBox | undefined {
  if (
    element.offsetParent instanceof HTMLElement &&
    element.offsetParent.classList.contains('deck-placed') &&
    element.offsetWidth > 0 &&
    element.offsetHeight > 0
  ) {
    const width = Math.round(element.offsetWidth);
    const height = Math.round(element.offsetHeight);
    const shiftX = transform.includes('translateX(-50%)') || transform.includes('translate(-50%');
    const shiftY = transform.includes('translateY(-50%)') || transform.includes(', -50%)');
    const x = Math.round(element.offsetLeft - (shiftX ? width / 2 : 0));
    const y = Math.round(element.offsetTop - (shiftY ? height / 2 : 0));
    return [x, y, width, height];
  }

  const canvas = element.closest('.deck-canvas');
  if (canvas !== null) {
    const canvasRect = canvas.getBoundingClientRect();
    const boxRect = element.getBoundingClientRect();
    if (canvasRect.width > 0 && canvasRect.height > 0 && boxRect.width > 0 && boxRect.height > 0) {
      const scaleX = LAYOUT_CANVAS_WIDTH / canvasRect.width;
      const scaleY = LAYOUT_CANVAS_HEIGHT / canvasRect.height;
      return [
        Math.round((boxRect.left - canvasRect.left) * scaleX),
        Math.round((boxRect.top - canvasRect.top) * scaleY),
        Math.round(boxRect.width * scaleX),
        Math.round(boxRect.height * scaleY),
      ];
    }
  }

  return undefined;
}
