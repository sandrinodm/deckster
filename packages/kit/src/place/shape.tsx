import type {
  RegionAlign,
  RegionAnchor,
  Role,
  SpaceName,
  StrokeName,
  TypeStep,
} from '@deckster/brand';
import type { CSSProperties, ReactNode } from 'react';

import { checkComponentProps } from '#components/check-component-props.ts';
import { FittedText } from '#foundation/slide-parts.tsx';
import { Step } from '#motion/step.tsx';
import { extractDataAttributes, PlacedBox, type PlacementProps } from '#place/placed-box.tsx';
import {
  hasPlacementProps,
  isSquareShape,
  SHAPE_GEOMETRIES,
  shapeExportKind,
  type ShapeFill,
  type ShapeGeometry,
  type ShapeRadius,
  type ShapeShadow,
} from '#place/resolve-place.ts';

/**
 * Upper bound on lines for fitted text inside a `<Shape>`; the container's height or max-height is
 * the real constraint.
 */
const MAX_SHAPE_LINES = 99;

/**
 * Props of {@link Shape}.
 */
export type ShapeProps = PlacementProps & {
  /**
   * Geometric contour: `rect` (default), `square`, `ellipse`, `circle`, `pill`, `diamond` or
   * `triangle`. `square` and `circle` lock a 1:1 aspect ratio.
   */
  shape?: ShapeGeometry;

  /**
   * Brand surface (`default`, `inverse`, `accent`, `gradient` or custom) that re-themes fill, text
   * and contrast-checked role colors via `data-surface`.
   */
  surface?: string;

  /**
   * Fill color role on the current surface, or `none` for transparent.
   */
  fill?: ShapeFill;

  /**
   * Border color role on the current surface.
   */
  border?: Role;

  /**
   * Border width token (`hairline`, `regular` or `bold`); defaults to `regular` when `border` is
   * set.
   */
  stroke?: StrokeName;

  /**
   * Corner radius token (`none`, `sm`, `md`, `lg`, `xl` or `full`); ignored on `ellipse`, `circle`,
   * `diamond` and `triangle`.
   */
  radius?: ShapeRadius;

  /**
   * Drop shadow token (`none`, `sm`, `md` or `lg`).
   */
  shadow?: ShapeShadow;

  /**
   * Inner padding token from the brand spacing scale; defaults to `md`.
   */
  padding?: SpaceName;

  /**
   * Brand type step for text inside the shape; defaults to `body`.
   */
  type?: TypeStep;

  /**
   * Horizontal text alignment inside the shape: `start`, `center` or `end`.
   */
  align?: RegionAlign;

  /**
   * Vertical text placement inside the shape: `start`, `center` or `end`.
   */
  anchor?: RegionAnchor;

  /**
   * Text color role on the active surface.
   */
  color?: Role;

  /**
   * Optional text, Markdown blocks or lists drawn inside the shape.
   */
  children?: ReactNode;
};

/**
 * A geometric container styled purely from brand surfaces and tokens, with optional fitted text or
 * Markdown lists inside. With placement props (`place`, `cols`/`rows`, or `box`), it sits on the
 * slide's placed layer in canvas coordinates; without placement props, it renders as an ordinary
 * flow block.
 *
 * @throws Error when an unknown prop, invalid geometry or invalid placement is passed.
 */
export function Shape(props: ShapeProps): ReactNode {
  checkComponentProps('Shape', props);
  const {
    shape = 'rect',
    surface,
    fill,
    border,
    stroke,
    radius,
    shadow,
    padding = 'md',
    type = 'body',
    align,
    anchor,
    color,
    place,
    cols,
    rows,
    box,
    zone,
    width,
    height,
    inset,
    name,
    at,
    effect,
    children,
  } = props;

  if (!(SHAPE_GEOMETRIES as readonly string[]).includes(shape)) {
    throw new Error(
      `"${String(shape)}" is not a geometry of <Shape>. Use one of: ${SHAPE_GEOMETRIES.join(', ')}.`,
    );
  }

  const placed = hasPlacementProps(props);
  const style = shapeStyle({
    shape,
    surface,
    fill,
    border,
    stroke,
    radius,
    shadow,
    padding,
    color,
  });
  const dataAttributes: Record<string, string | undefined> = {
    ...extractDataAttributes(props),
    'data-shape': shape,
    'data-export-shape': shapeExportKind(shape, radius),
    ...(surface === undefined ? {} : { 'data-surface': surface }),
    ...(fill === undefined ? {} : { 'data-fill': fill }),
    ...(border === undefined ? {} : { 'data-border': border }),
    ...(align === undefined ? {} : { 'data-align': align }),
    ...(anchor === undefined ? {} : { 'data-anchor': anchor }),
    ...(color === undefined ? {} : { 'data-colored': '' }),
  };

  const hasContent = children !== undefined && children !== null && children !== '';
  const body = hasContent ? (
    <FittedText
      as="div"
      className={`kit-shape-text kit-prose kit-type-${type}`}
      maxLines={MAX_SHAPE_LINES}
      {...(placed ? { boundary: '.kit-shape' } : {})}>
      {children}
    </FittedText>
  ) : null;

  if (placed) {
    return (
      <PlacedBox
        kind="shape"
        tagName="Shape"
        placement={{
          place,
          cols,
          rows,
          box,
          zone,
          width,
          height,
          inset,
          aspect: isSquareShape(shape) ? 'square' : undefined,
        }}
        name={name}
        at={at}
        effect={effect}
        className="kit-shape"
        style={style}
        dataAttributes={dataAttributes}>
        {body}
      </PlacedBox>
    );
  }

  const inline = (
    <div className="kit-shape" {...dataAttributes} style={style}>
      {body}
    </div>
  );
  return at === undefined ? (
    inline
  ) : (
    <Step at={at} {...(effect === undefined ? {} : { effect })}>
      {inline}
    </Step>
  );
}

/**
 * Styling inputs for {@link shapeStyle}.
 */
type ShapeStyleInput = {
  /**
   * Shape geometry.
   */
  shape: ShapeGeometry;

  /**
   * Optional surface override.
   */
  surface: string | undefined;

  /**
   * Optional fill role or `none`.
   */
  fill: ShapeFill | undefined;

  /**
   * Optional border role.
   */
  border: Role | undefined;

  /**
   * Optional border stroke width token.
   */
  stroke: StrokeName | undefined;

  /**
   * Optional corner radius token.
   */
  radius: ShapeRadius | undefined;

  /**
   * Optional shadow token.
   */
  shadow: ShapeShadow | undefined;

  /**
   * Inner padding token.
   */
  padding: SpaceName;

  /**
   * Optional text color role.
   */
  color: Role | undefined;
};

/**
 * Builds inline CSS custom properties and token-backed styles for `<Shape>`.
 *
 * @param input - Visual tokens chosen for the shape.
 */
function shapeStyle(input: ShapeStyleInput): CSSProperties & Record<`--${string}`, string> {
  const { shape, surface, fill, border, stroke, radius, shadow, padding, color } = input;
  const style: CSSProperties & Record<`--${string}`, string> = {
    '--kit-shape-padding': `var(--brand-space-${padding})`,
  };

  if (fill === 'none') {
    style.background = 'transparent';
  } else if (fill !== undefined) {
    style.background = `var(--brand-color-${fill})`;
  } else if (surface === undefined && border !== undefined) {
    style.background = 'transparent';
  }

  if (border !== undefined) {
    style.borderColor = `var(--brand-color-${border})`;
    style.borderWidth = `var(--brand-stroke-${stroke ?? 'regular'})`;
    style.borderStyle = 'solid';
  }

  if (shape === 'rect' || shape === 'square') {
    if (radius === 'none' || radius === undefined) {
      style.borderRadius = 0;
    } else if (radius === 'full') {
      style.borderRadius = 9999;
    } else {
      style.borderRadius = `var(--brand-radius-${radius})`;
    }
  }

  if (shadow === 'none') {
    style.boxShadow = 'none';
  } else if (shadow !== undefined) {
    style.boxShadow = `var(--brand-shadow-${shadow})`;
  }

  if (color !== undefined) {
    style['--kit-place-color'] = `var(--brand-color-${color})`;
  }

  return style;
}
