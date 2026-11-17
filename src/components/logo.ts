/**
 * The site's logo, drawn once for every place it appears: the header and the
 * docs layout (Logo.astro) and the social cards (src/pages/og/_card.ts).
 * It is the deckster mark from assets/brand on main, reduced to one card: a
 * solid card with a grid of six squares cut out of it, one of them vermilion.
 * Each place fills the card with its text colour and the cut-outs with its
 * background, so the mark reads on the black header and on white alike.
 * public/favicon.svg is a copy, so change it together with this file.
 */
export const logo = {
  /** The drawing's box, on a whole-pixel grid at 32 × 24. */
  width: 32,
  height: 24,
  card: { x: 0, y: 0, width: 32, height: 24, radius: 3 },
  /** The squares, left to right and top to bottom, each `size` wide. */
  size: 6,
  squares: [
    [5, 5],
    [13, 5],
    [21, 5],
    [5, 13],
    [13, 13],
    [21, 13],
  ] as const,
  /** The square drawn in vermilion: top right, as on the brand mark. */
  accentIndex: 2,
  accent: "#ff4f2b",
};
