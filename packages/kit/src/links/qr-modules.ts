import { encode } from 'uqr';

/**
 * The error correction level: 15% of the code can be damaged or covered, which survives a
 * projector's blur and a logo-free code without growing it much.
 */
const ERROR_CORRECTION = 'M';

/**
 * A QR code ready to draw as one SVG path.
 */
export type QrShape = {
  /**
   * The width and height of the code in modules, without the quiet zone.
   */
  size: number;

  /**
   * SVG path data that fills every dark module, one unit square per module; horizontal runs are
   * merged, so the path stays small.
   */
  path: string;
};

/**
 * Encodes a value as a QR code.
 *
 * @param value - The text to encode, usually a URL.
 * @throws RangeError when the value is empty or too long for a QR code.
 */
export function qrShape(value: string): QrShape {
  if (value === '') {
    throw new RangeError(
      '<QR> needs a value to encode, for example `<QR value="https://example.com" />`.',
    );
  }

  const { data, size } = encode(value, { ecc: ERROR_CORRECTION, border: 0 });
  return { size, path: modulesToPath(data) };
}

/**
 * Turns the module matrix into path data, merging each row's horizontal runs of dark modules.
 *
 * @param rows - Rows of modules, `true` for dark.
 */
function modulesToPath(rows: readonly (readonly boolean[])[]): string {
  const parts: string[] = [];
  for (const [y, row] of rows.entries()) {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== true) {
        x += 1;
        continue;
      }

      const start = x;
      while (row[x] === true) {
        x += 1;
      }

      const length = x - start;
      parts.push(`M${start} ${y}h${length}v1h-${length}z`);
    }
  }

  return parts.join('');
}
