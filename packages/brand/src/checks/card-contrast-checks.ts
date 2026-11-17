import type { BrandTokens, Hex, SurfaceTokens } from '#resolve/brand-tokens.ts';
import type { Brand } from '#schema/brand-schema.ts';
import type { CardIconStyle } from '#schema/diagram-schema.ts';
import type { BrandProblem } from '#validate/brand-error.ts';

import { GRAPHIC_CONTRAST, TEXT_CONTRAST } from '#checks/contrast-thresholds.ts';
import { formatHex, fromHex, type Rgba } from '#color/color.ts';
import { contrastRatio, ensureContrastOnAll, worstContrast } from '#color/contrast.ts';
import { ownValue } from '#resolve/own-value.ts';
import {
  cardBackgrounds,
  iconBackgrounds,
  writtenCardColors,
  type CardColorField,
} from '#resolve/resolve-diagram.ts';

/**
 * One color of a card to measure: what it is called in messages, the field that sets it, the field
 * it sits on, and its minimum.
 */
type CardPair = {
  /**
   * The color's field on the card, such as `text` or `icon.color`.
   */
  field: CardColorField;

  /**
   * The field of what it sits on, such as `fill` or `icon.fill`.
   */
  on: CardColorField;

  /**
   * The lowest WCAG contrast ratio that passes.
   */
  minimum: number;
};

/**
 * The card colors that carry text: title and subtitle on the fill, at 4.5:1.
 */
const TEXT_PAIRS: readonly CardPair[] = [
  { field: 'text', on: 'fill', minimum: TEXT_CONTRAST },
  { field: 'subtext', on: 'fill', minimum: TEXT_CONTRAST },
];

/**
 * Checks the card colors on one surface, as explicit diagram overrides are checked: a pair is
 * measured when the brand writes either of its colors (a title color, or the fill it sits on), on
 * the card or as the surface's recoloring of it, with the fill painted over every backdrop color
 * first. Problems name the field that wrote the color, the surface's when it recolors the card.
 * Derived colors reach their targets by construction, so a pair the brand writes neither side of is
 * not measured; a fill no derived color reads on is caught here because the fill is written.
 *
 * @param brand - The decoded brand, to tell written card colors from derived ones.
 * @param tokens - The resolved tokens, for each card's icon style.
 * @param surface - The resolved surface.
 * @returns One problem per failing pair, with a passing color in the fix.
 */
export function checkCardContrast(
  brand: Brand,
  tokens: BrandTokens,
  surface: SurfaceTokens,
): BrandProblem[] {
  const sources = {
    diagram: brand.diagram,
    surfaceName: surface.name,
    recolors: ownValue(brand.color.surfaces, surface.name)?.diagram?.cards,
  };
  const backdrop = surface.backdrop.map(fromHex);
  return Object.entries(tokens.diagram.cards).flatMap(([name, geometry]) => {
    const colors = surface.diagramCards[name];
    const written = writtenCardColors(sources, name);
    if (colors === undefined || Object.keys(written).length === 0) {
      return [];
    }

    const under = cardBackgrounds(colors.fill, backdrop);
    const icon = iconBackgrounds(geometry.icon, {
      under,
      iconFill: colors.iconFill,
      bg: surface.roles.bg,
    });
    const measured: Readonly<Record<string, { color: Hex; on: readonly Rgba[] }>> = {
      text: { color: colors.text, on: under },
      subtext: { color: colors.subtext, on: under },
      'icon.color': { color: colors.iconColor, on: icon },
    };
    return cardPairs(geometry.icon).flatMap((pair) => {
      const field = written[pair.field] === undefined ? pair.on : pair.field;
      const source = written[field];
      const values = measured[pair.field];
      if (source === undefined || values === undefined) {
        return [];
      }

      return checkCardPair({
        surface: surface.name,
        card: name,
        field,
        path: source.path,
        pair,
        ...values,
      });
    });
  });
}

/**
 * The pairs to measure on a card: the text pairs, and the icon glyph at 3:1 on what its style puts
 * under it (the solid tile's fill, the card's fill for a plain glyph, the `bg` tile of a chip,
 * which the brand does not write here). A card without an icon has no icon pair.
 *
 * @param icon - The card's icon style.
 */
function cardPairs(icon: CardIconStyle): CardPair[] {
  switch (icon) {
    case 'none': {
      return [...TEXT_PAIRS];
    }

    case 'chip': {
      return [...TEXT_PAIRS, { field: 'icon.color', on: 'icon.color', minimum: GRAPHIC_CONTRAST }];
    }

    case 'solid': {
      return [...TEXT_PAIRS, { field: 'icon.color', on: 'icon.fill', minimum: GRAPHIC_CONTRAST }];
    }

    case 'plain': {
      return [...TEXT_PAIRS, { field: 'icon.color', on: 'fill', minimum: GRAPHIC_CONTRAST }];
    }
  }
}

/**
 * One card color measured against the worst of its backgrounds.
 */
type CardMeasure = {
  /**
   * The surface name, for the message.
   */
  surface: string;

  /**
   * The card name.
   */
  card: string;

  /**
   * The card field written: the color itself, or the fill under it.
   */
  field: CardColorField;

  /**
   * Where that field was written, where the problem is reported.
   */
  path: string;

  /**
   * The pair being measured.
   */
  pair: CardPair;

  /**
   * The color on this surface.
   */
  color: Hex;

  /**
   * The opaque colors under it.
   */
  on: readonly Rgba[];
};

/**
 * Checks one card color. A written color that falls short gets a passing color in the fix when one
 * exists; a derived color that falls short means nothing reads on the written fill, so the fix is
 * to change the fill.
 *
 * @param measure - The color, what it sits on and where it was written.
 */
function checkCardPair(measure: CardMeasure): BrandProblem[] {
  const color = fromHex(measure.color);
  const ratio = worstContrast(color, measure.on);
  const { minimum } = measure.pair;
  if (ratio >= minimum) {
    return [];
  }

  const worst = [...measure.on].sort(
    (a, b) => contrastRatio(color, a) - contrastRatio(color, b),
  )[0];
  const what = measure.pair.field === 'icon.color' ? 'icon' : measure.pair.field;
  const measured =
    `${measure.color} on ${worst === undefined ? 'its background' : formatHex(worst)} has ` +
    `contrast ${ratio.toFixed(2)}:1; it needs ${minimum}:1`;
  const where = `On the ${measure.surface} surface, the "${measure.card}" card's`;
  const { path, field } = measure;
  const recolor = recolorHint(measure, path);
  if (field !== measure.pair.field) {
    return [
      {
        path,
        message: `${where} \`${field}\` has no ${what} color that reads on it: the best, ${measured}.`,
        fix: `Change \`${field}\` to a color ${what} can be read on${recolor}.`,
      },
    ];
  }

  const candidate = ensureContrastOnAll(color, measure.on, minimum);
  const fix =
    worstContrast(candidate, measure.on) >= minimum
      ? `Use a ${what} color with more contrast${recolor}, such as "${formatHex(candidate)}", ` +
        `or leave \`${field}\` out to derive a readable one.`
      : `No single ${what} color reads on every background here; change \`${measure.pair.on}\`.`;
  return [{ path, message: `${where} ${what} color ${measured}.`, fix }];
}

/**
 * How to keep a brand-wide card color elsewhere and change it on this surface only, or nothing when
 * the surface already wrote it.
 *
 * @param measure - The failing color.
 * @param path - The field that wrote it.
 */
function recolorHint(measure: CardMeasure, path: string): string {
  if (path.startsWith('color.surfaces.')) {
    return '';
  }

  return ` (on this surface only, under color.surfaces.${measure.surface}.diagram.cards.${measure.card})`;
}
