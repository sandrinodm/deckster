import type { RegionAlign, RegionAnchor, Role, TypeStep } from '@deckster/brand';
import type { CSSProperties, ReactNode } from 'react';

import { checkComponentProps } from '#components/check-component-props.ts';
import { FittedText } from '#foundation/slide-parts.tsx';
import { Step } from '#motion/step.tsx';
import { extractDataAttributes, PlacedBox, type PlacementProps } from '#place/placed-box.tsx';
import { hasPlacementProps } from '#place/resolve-place.ts';

/**
 * Upper bound on lines for fitted text inside `<Text>`.
 */
const MAX_TEXT_LINES = 99;

/**
 * Props of {@link Text}.
 */
export type TextProps = PlacementProps & {
  /**
   * Brand type step for the text; defaults to `body`.
   */
  type?: TypeStep;

  /**
   * Horizontal text alignment: `start`, `center` or `end`.
   */
  align?: RegionAlign;

  /**
   * Vertical text placement inside the box: `start`, `center` or `end`.
   */
  anchor?: RegionAnchor;

  /**
   * Text color role on the active surface.
   */
  color?: Role;

  /**
   * Text, inline Markdown or lists to render.
   */
  children?: ReactNode;
};

/**
 * Unboxed floating text for labels, captions, stamps, footers and big numbers, with no fill,
 * border, radius, shadow or padding chrome. With placement props (`place`, `cols`/`rows`, or
 * `box`), it sits on the slide's placed layer in canvas coordinates; without placement props, it
 * renders as an ordinary flow block.
 *
 * @throws Error when an unknown prop or invalid placement is passed.
 */
export function Text(props: TextProps): ReactNode {
  checkComponentProps('Text', props);
  const {
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

  const placed = hasPlacementProps(props);
  const style: (CSSProperties & Record<`--${string}`, string>) | undefined =
    color === undefined ? undefined : { '--kit-place-color': `var(--brand-color-${color})` };
  const dataAttributes: Record<string, string | undefined> = {
    ...extractDataAttributes(props),
    'data-export-text': 'true',
    ...(align === undefined ? {} : { 'data-align': align }),
    ...(anchor === undefined ? {} : { 'data-anchor': anchor }),
    ...(color === undefined ? {} : { 'data-colored': '' }),
  };

  const hasContent = children !== undefined && children !== null && children !== '';
  const body = hasContent ? (
    <FittedText
      as="div"
      className={`kit-text-body kit-prose kit-type-${type}`}
      maxLines={MAX_TEXT_LINES}
      {...(placed ? { boundary: '.kit-text' } : {})}>
      {children}
    </FittedText>
  ) : null;

  if (placed) {
    return (
      <PlacedBox
        kind="text"
        tagName="Text"
        placement={{ place, cols, rows, box, zone, width, height, inset }}
        name={name}
        at={at}
        effect={effect}
        className="kit-text"
        style={style}
        dataAttributes={dataAttributes}>
        {body}
      </PlacedBox>
    );
  }

  const inline = (
    <div className="kit-text" {...dataAttributes} style={style}>
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
