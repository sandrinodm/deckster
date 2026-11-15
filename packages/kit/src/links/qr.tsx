import { useBrand } from '@deckster/brand/runtime';
import { useId, type ReactNode } from 'react';

import { checkComponentProps } from '#components/check-component-props.ts';
import { displayUrl, isExternalLink, linkAttributes } from '#links/link-target.ts';
import { qrColors } from '#links/qr-colors.ts';
import { qrShape } from '#links/qr-modules.ts';

/**
 * The quiet zone around the code, in modules; the QR standard asks for four.
 */
const QUIET_ZONE_MODULES = 4;

/**
 * The code's default width on the canvas, in pixels.
 */
const DEFAULT_SIZE_PX = 300;

/**
 * Where an address may break across lines: after each `/` and before each `.` that follows a
 * letter, so it never breaks inside a word.
 */
const ADDRESS_BREAKS = /(?<=\/)|(?<=\p{L})(?=\.)/u;

/**
 * An address with a line break opportunity (`<wbr>`) at each `/` and `.`, and none inside a word.
 *
 * @param address - The address as shown.
 */
export function breakableAddress(address: string): ReactNode[] {
  return address
    .split(ADDRESS_BREAKS)
    .flatMap((part, index) => (index === 0 ? [part] : [<wbr key={index} />, part]));
}

/**
 * Props of {@link QR}.
 */
export type QRProps = {
  /**
   * What the code opens, usually a URL.
   */
  value: string;

  /**
   * The code's width and height on the canvas in pixels, quiet zone included. Defaults to 300,
   * which a phone reads from the back of a room.
   */
  size?: number;

  /**
   * Whether to print the readable URL beneath the code. Defaults to `true`.
   */
  caption?: boolean;
};

/**
 * A QR code drawn as vector shapes at render time, in the brand's colors: the darker of the slide's
 * text and background colors for the modules, the lighter for the plate, so it scans on every
 * surface. The URL beneath it is a link, so the audience can type it instead. The code is
 * interactive, so a click does not move the deck, and it is crisp in an export.
 *
 * @throws RangeError when `value` is empty or too long to encode.
 */
export function QR(props: QRProps): ReactNode {
  checkComponentProps('QR', props);
  const { value, size = DEFAULT_SIZE_PX, caption = true } = props;
  const { surface } = useBrand();
  const titleId = useId();
  const shape = qrShape(value);
  const colors = qrColors(surface.roles.fg, surface.roles.bg);
  const extent = shape.size + 2 * QUIET_ZONE_MODULES;
  return (
    <figure className="kit-qr" data-deck-interactive="">
      <svg
        className="kit-qr-code"
        width={size}
        height={size}
        viewBox={`0 0 ${extent} ${extent}`}
        shapeRendering="crispEdges"
        aria-labelledby={titleId}>
        <title id={titleId}>{`QR code for ${displayUrl(value)}`}</title>
        <rect width={extent} height={extent} fill={colors.plate} />
        <path
          transform={`translate(${QUIET_ZONE_MODULES} ${QUIET_ZONE_MODULES})`}
          d={shape.path}
          fill={colors.modules}
        />
      </svg>
      {caption ? <QrCaption value={value} /> : null}
    </figure>
  );
}

/**
 * The text beneath the code: the URL as a link people can follow or type, or the value as it is.
 */
function QrCaption({ value }: { value: string }): ReactNode {
  const shown = isExternalLink(value) ? displayUrl(value) : value;
  const parts = breakableAddress(shown);
  const text = isExternalLink(value) ? <a {...linkAttributes(value)}>{parts}</a> : parts;
  return <figcaption className="kit-type-small kit-qr-caption">{text}</figcaption>;
}
