import type { ReactNode } from 'react';

import { checkComponentProps } from '#components/check-component-props.ts';
import { extractDataAttributes, PlacedBox, type PlacementProps } from '#place/placed-box.tsx';
import { hasPlacementProps } from '#place/resolve-place.ts';

/**
 * Props of {@link Place}.
 */
export type PlaceProps = PlacementProps & {
  /**
   * Any Markdown block, list or kit component (`<Icon>`, `<Image>`, `<QR>`, `<Button>`, `<Svg>`) to
   * position on the slide.
   */
  children?: ReactNode;
};

/**
 * Unstyled positioning wrapper that places arbitrary Markdown content, bullet lists or kit
 * components anywhere on a slide by named anchor, grid cell or explicit canvas box. Requires one
 * placement mode (`place`, `cols`/`rows`, or `box`).
 *
 * @throws Error when an unknown prop is passed or no placement prop is supplied.
 */
export function Place(props: PlaceProps): ReactNode {
  checkComponentProps('Place', props);
  if (!hasPlacementProps(props)) {
    throw new Error(
      '<Place> needs a placement: pass `place`, `cols` and `rows`, or `box`. ' +
        'Example: <Place place="bottom-left" zone="footer">Confidential</Place>',
    );
  }

  const { place, cols, rows, box, zone, width, height, inset, name, at, effect, children } = props;
  return (
    <PlacedBox
      kind="place"
      tagName="Place"
      placement={{ place, cols, rows, box, zone, width, height, inset }}
      name={name}
      at={at}
      effect={effect}
      className="kit-place kit-prose kit-type-body"
      dataAttributes={extractDataAttributes(props)}>
      {children}
    </PlacedBox>
  );
}
