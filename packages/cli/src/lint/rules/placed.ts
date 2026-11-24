import type { BrandTokens, SpacingTokens } from '@deckster/brand';
import type { PlacedZone } from '@deckster/engine/manifest';

import {
  nearestPlaceSuggestion,
  PLACED_MAX_COUNT,
  PLACED_MAX_SAFE_AREA_RATIO,
  PLACED_MAX_WORDS_PER_ELEMENT,
  PLACED_MAX_WORDS_PER_SLIDE,
  PLACED_ZONES,
  zoneRect,
} from '@deckster/kit/place-resolve';

import type {
  Box,
  BrandContext,
  DeckContext,
  ElementSnapshot,
  RuleViolation,
  SlideContext,
  SlideRule,
  StepSnapshot,
} from '#lint/types.ts';

import { MIN_VISIBLE_OPACITY, OVERFLOW_TOLERANCE_PX } from '#lint/limits.ts';
import { describeElement } from '#lint/rules/describe.ts';
import { ancestorsOf, glyphBands, overlapOf, visibleTextElements } from '#lint/rules/elements.ts';

/**
 * The `data-*` attribute (without its prefix) marking a placed element root (`place`, `shape` or
 * `text`).
 */
const PLACED_ATTRIBUTE = 'placed';

/**
 * The `data-*` attribute (without its prefix) recording the zone a placed element was resolved in.
 */
const PLACED_ZONE_ATTRIBUTE = 'placed-zone';

/**
 * The `data-*` attribute (without its prefix) recording the placement mode (`place`, `grid` or
 * `box`).
 */
const PLACED_MODE_ATTRIBUTE = 'placed-mode';

/**
 * The `data-*` attribute (without its prefix) recording the placement specification string.
 */
const PLACED_SPEC_ATTRIBUTE = 'placed-spec';

/**
 * The `data-*` attribute (without its prefix) holding the optional author-supplied element name.
 */
const PLACED_NAME_ATTRIBUTE = 'placed-name';

/**
 * Horizontal reach from each slide edge that corner chrome occupies inside the top or bottom margin
 * band, in canvas pixels, matching `@deckster/kit`'s `planChrome`.
 */
const CHROME_CORNER_WIDTH_PX = 560;

/**
 * Multiplier turning a ratio into a whole percentage for messages.
 */
const PERCENT = 100;

/**
 * Pattern splitting text into whitespace-separated words.
 */
const WHITESPACE_PATTERN = /\s+/u;

/**
 * A slide corner that can hold brand chrome.
 */
type ChromeCorner = BrandTokens['chrome']['pageNumber']['corner'];

/**
 * How far a box extends past each edge of a boundary, in canvas pixels; negative when inside.
 */
type EdgeOverhang = {
  /**
   * Past the left edge.
   */
  left: number;

  /**
   * Past the top edge.
   */
  top: number;

  /**
   * Past the right edge.
   */
  right: number;

  /**
   * Past the bottom edge.
   */
  bottom: number;
};

/**
 * A placed element whose bounding box leaves the 1920x1080 canvas or its declared zone (`safe`,
 * `header`, `footer` or `canvas`). Covers empty `<Shape>` elements, which decoration checks skip.
 */
export const placedOffCanvasRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'placed-off-canvas',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Placed content extending off the canvas or outside its zone fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'A placed element extends outside its declared zone or the 1920x1080 canvas.',

  /**
   * Reports every visible placed element whose box leaves the canvas or its zone.
   */
  check: ({ snapshot, brand }) => {
    const canvasBox: Box = {
      x: 0,
      y: 0,
      width: snapshot.canvas.width,
      height: snapshot.canvas.height,
    };
    const violations: RuleViolation[] = [];
    for (const element of placedElements(snapshot)) {
      const canvasSides = overhangPast(element.rect, canvasBox);
      const outsideCanvas = exceedingEdges(canvasSides);
      if (outsideCanvas.length > 0) {
        violations.push({
          message:
            `${describePlaced(element)} extends past the canvas: ` +
            `${formatOverhang(canvasSides, outsideCanvas)}.`,
          fix: 'Move or shrink the placed element so it stays inside the 1920x1080 canvas.',
          selector: element.selector,
        });
        continue;
      }

      const zone = placedZoneOf(element);
      if (zone === 'canvas') {
        continue;
      }

      const bounds = zoneBox(zone, brand.tokens.spacing);
      const zoneSides = overhangPast(element.rect, bounds);
      const outsideZone = exceedingEdges(zoneSides);
      if (outsideZone.length > 0) {
        violations.push({
          message:
            `${describePlaced(element)} extends outside the ${zone} zone: ` +
            `${formatOverhang(zoneSides, outsideZone)}.`,
          fix:
            'Move or shrink the placed element so it fits inside its zone, or set `zone="canvas"` ' +
            'if it should bleed to the slide edge.',
          selector: element.selector,
        });
      }
    }

    return violations;
  },
};

/**
 * A placed element (`<Shape>`, `<Text>` or `<Place>`) whose bounding box intersects the glyphs of
 * slide text outside placed elements.
 */
export const placedCoversTextRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'placed-covers-text',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Covering slide text makes it unreadable and fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'A placed element covers slide text outside placed elements.',

  /**
   * Reports every visible placed element whose box overlaps a non-placed text element's glyph
   * bands.
   */
  check: ({ snapshot }) => {
    const placed = placedElements(snapshot);
    if (placed.length === 0) {
      return [];
    }

    const roots = allPlacedRootIndexes(snapshot);
    const slotTexts = visibleTextElements(snapshot).filter(
      (element) => !isInsidePlaced(element, snapshot, roots),
    );
    const violations: RuleViolation[] = [];
    for (const item of placed) {
      const covered = slotTexts.find((textEl) =>
        glyphBands(textEl).some((band) => {
          const overlap = overlapOf(item.rect, band);
          return overlap.width > OVERFLOW_TOLERANCE_PX && overlap.height > OVERFLOW_TOLERANCE_PX;
        }),
      );
      if (covered !== undefined) {
        violations.push({
          message: `${describePlaced(item)} covers slide text ${describeElement(covered)}.`,
          fix:
            'Move the placed element to another corner or grid cell, shrink it, or give it a ' +
            'fixed `height` so it does not grow into slide text.',
          selector: item.selector,
        });
      }
    }

    return violations;
  },
};

/**
 * A placed element that overlaps visible slide chrome or occupies a corner whose brand chrome had
 * to move or hide for it.
 */
export const placedChromeRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'placed-chrome',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Chrome collision or displacement is a warning so the author can confirm the tradeoff.
   */
  severity: 'warning',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'A placed element overlaps slide chrome or forces corner chrome to move or hide.',

  /**
   * Reports placed elements that directly overlap measured `.kit-chrome` items or cover a corner
   * configured with active brand chrome.
   */
  check: ({ snapshot, slide, deck, brand }) => {
    const placed = placedElements(snapshot);
    if (placed.length === 0) {
      return [];
    }

    const measuredChrome = snapshot.chrome ?? [];
    const activeCorners = configuredChromeCorners(brand, slide, deck);
    const violations: RuleViolation[] = [];
    for (const item of placed) {
      const hit = measuredChrome.find((chromeItem) => {
        const overlap = overlapOf(item.rect, chromeItem.box);
        return overlap.width > OVERFLOW_TOLERANCE_PX && overlap.height > OVERFLOW_TOLERANCE_PX;
      });
      if (hit !== undefined) {
        violations.push({
          message:
            `${describePlaced(item)} overlaps slide chrome ` + `(${hit.kind} in ${hit.corner}).`,
          fix:
            'Move the placed element out of the chrome corner, or hide chrome on this slide ' +
            'with `chrome: false` in frontmatter.',
          selector: item.selector,
        });
        continue;
      }

      if (activeCorners.size === 0) {
        continue;
      }

      const coveredCorner = cornersCoveredByBox(
        item.rect,
        brand.tokens.spacing.margin,
        snapshot.canvas,
      ).find((corner) => activeCorners.has(corner));
      if (coveredCorner !== undefined) {
        const items = activeCorners.get(coveredCorner) ?? [];
        violations.push({
          message:
            `${describePlaced(item)} sits in the ${coveredCorner} chrome corner, causing the ` +
            `slide's ${items.join(' and ')} to move or hide.`,
          fix:
            'Move the placed element to an open corner or inside the safe zone, or hide chrome ' +
            'on this slide with `chrome: false`.',
          selector: item.selector,
        });
      }
    }

    return violations;
  },
};

/**
 * Too many placed elements on a single slide: more than {@link PLACED_MAX_COUNT} indicates the
 * slide is being composed by hand instead of using a layout.
 */
export const placedCountRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'placed-count',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Exceeding the placed-element cap fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: `A slide has more than ${PLACED_MAX_COUNT} placed elements.`,

  /**
   * Reports slides with more than {@link PLACED_MAX_COUNT} visible placed elements.
   */
  check: ({ snapshot }) => {
    const placed = placedElements(snapshot);
    if (placed.length <= PLACED_MAX_COUNT) {
      return [];
    }

    return [
      {
        message:
          `The slide has ${placed.length} placed elements; the maximum is ` +
          `${PLACED_MAX_COUNT}.`,
        fix:
          'Use a layout (such as `split`, `columns`, `cards` or `bento`) instead of placing many ' +
          'boxes by hand, and keep placed elements to brief callouts, badges or labels.',
        selector: null,
        key: 'placed-count',
      },
    ];
  },
};

/**
 * Placed elements carrying too many words, either inside a single element (over
 * {@link PLACED_MAX_WORDS_PER_ELEMENT}) or across all placed elements on the slide (over
 * {@link PLACED_MAX_WORDS_PER_SLIDE}).
 */
export const placedWordsRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'placed-words',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Wordy placed elements warn so long copy moves back into layout slots.
   */
  severity: 'warning',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description:
    `Placed elements exceed ${PLACED_MAX_WORDS_PER_ELEMENT} words in one box or ` +
    `${PLACED_MAX_WORDS_PER_SLIDE} words across the slide.`,

  /**
   * Reports individual placed elements and slides whose placed text exceeds the word caps.
   */
  check: ({ snapshot }) => {
    const placed = placedElements(snapshot);
    if (placed.length === 0) {
      return [];
    }

    const violations: RuleViolation[] = [];
    let totalWords = 0;
    for (const item of placed) {
      const words = placedWordCount(item.index, snapshot);
      totalWords += words;
      if (words > PLACED_MAX_WORDS_PER_ELEMENT) {
        violations.push({
          message:
            `${describePlaced(item)} holds ${words} words; the maximum per placed element is ` +
            `${PLACED_MAX_WORDS_PER_ELEMENT}.`,
          fix: 'Shorten the text to a brief label or callout, or move longer copy into a layout slot.',
          selector: item.selector,
        });
      }
    }

    if (totalWords > PLACED_MAX_WORDS_PER_SLIDE) {
      violations.push({
        message:
          `Placed elements on this slide hold ${totalWords} words in total; the maximum is ` +
          `${PLACED_MAX_WORDS_PER_SLIDE}.`,
        fix: 'Trim placed copy or move the content into a layout slot instead of floating boxes.',
        selector: null,
        key: 'placed-words-slide',
      });
    }

    return violations;
  },
};

/**
 * A placed element outside `zone="canvas"` that covers more than {@link PLACED_MAX_SAFE_AREA_RATIO}
 * of the safe area: a box that large belongs in a layout.
 */
export const placedSizeRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'placed-size',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Oversized placed elements warn and steer toward a layout.
   */
  severity: 'warning',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description:
    `A placed element outside zone="canvas" covers more than ` +
    `${Math.round(PLACED_MAX_SAFE_AREA_RATIO * PERCENT)}% of the safe area.`,

  /**
   * Reports every non-canvas placed element covering more than the safe-area ratio cap.
   */
  check: ({ snapshot, brand }) => {
    const [, , safeW, safeH] = zoneRect('safe', brand.tokens.spacing);
    const safeArea = safeW * safeH;
    if (safeArea <= 0) {
      return [];
    }

    const maxPercent = Math.round(PLACED_MAX_SAFE_AREA_RATIO * PERCENT);
    const violations: RuleViolation[] = [];
    for (const item of placedElements(snapshot)) {
      if (placedZoneOf(item) === 'canvas') {
        continue;
      }

      const ratio = (item.rect.width * item.rect.height) / safeArea;
      if (ratio > PLACED_MAX_SAFE_AREA_RATIO) {
        const coveredPercent = Math.round(ratio * PERCENT);
        violations.push({
          message:
            `${describePlaced(item)} covers ${coveredPercent}% of the safe area; placed ` +
            `elements should stay under ${maxPercent}%.`,
          fix:
            'A box this large is a layout, not a callout. Pick a layout such as `split`, ' +
            '`columns` or `cards`, shrink the box, or use `zone="canvas"` for full-bleed art.',
          selector: item.selector,
        });
      }
    }

    return violations;
  },
};

/**
 * A placed element using raw canvas pixel coordinates (`box={[x, y, w, h]}`), reported at `info`
 * severity with the nearest named `place` or grid cell suggestion.
 */
export const placedPixelsRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'placed-pixels',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * What is visible changes with the step.
   */
  scope: 'step',

  /**
   * Pixel coordinates are allowed as an escape hatch and reported as info, never failing lint.
   */
  severity: 'info',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: 'A placed element uses raw pixel coordinates instead of a named place or grid cell.',

  /**
   * Reports every visible placed element placed in `box` mode with its nearest idiomatic place.
   */
  check: ({ snapshot, brand }) => {
    const violations: RuleViolation[] = [];
    for (const item of placedElements(snapshot)) {
      if (item.data[PLACED_MODE_ATTRIBUTE] !== 'box') {
        continue;
      }

      const box: [number, number, number, number] = [
        Math.round(item.rect.x),
        Math.round(item.rect.y),
        Math.round(item.rect.width),
        Math.round(item.rect.height),
      ];
      const suggestion = nearestPlaceSuggestion(box, brand.tokens.spacing);
      violations.push({
        message: `${describePlaced(item)} uses pixel coordinates (\`box={[${box.join(', ')}]}\`).`,
        fix: `Replace \`box\` with \`${suggestion}\` so it follows the brand's margins and grid.`,
        selector: item.selector,
      });
    }

    return violations;
  },
};

/**
 * Visible placed element roots on the slide, skipping hidden or unrevealed `<Step>` elements and
 * zero-size boxes.
 *
 * @param snapshot - The measured slide.
 */
function placedElements(snapshot: StepSnapshot): ElementSnapshot[] {
  return snapshot.elements.filter(
    (element) =>
      element.data[PLACED_ATTRIBUTE] !== undefined &&
      element.opacity >= MIN_VISIBLE_OPACITY &&
      element.rect.width > 0 &&
      element.rect.height > 0,
  );
}

/**
 * Indexes of every placed element root in the snapshot, regardless of opacity, so text inside an
 * unrevealed placed element is still recognized as placed.
 *
 * @param snapshot - The measured slide.
 */
function allPlacedRootIndexes(snapshot: StepSnapshot): ReadonlySet<number> {
  return new Set(
    snapshot.elements
      .filter((element) => element.data[PLACED_ATTRIBUTE] !== undefined)
      .map((element) => element.index),
  );
}

/**
 * Whether an element is a placed root or sits inside one.
 *
 * @param element - A measured element.
 * @param snapshot - The measured slide.
 * @param placedRoots - Indexes of all placed root elements.
 */
function isInsidePlaced(
  element: ElementSnapshot,
  snapshot: StepSnapshot,
  placedRoots: ReadonlySet<number>,
): boolean {
  return (
    placedRoots.has(element.index) ||
    ancestorsOf(element, snapshot).some((ancestor) => placedRoots.has(ancestor))
  );
}

/**
 * Counts words across a placed element and all its visible, non-decorative descendants.
 *
 * @param rootIndex - Index of the placed root element.
 * @param snapshot - The measured slide.
 */
function placedWordCount(rootIndex: number, snapshot: StepSnapshot): number {
  let words = 0;
  for (const element of snapshot.elements) {
    const belongs =
      element.index === rootIndex || ancestorsOf(element, snapshot).includes(rootIndex);
    if (!belongs || element.decorative || element.opacity < MIN_VISIBLE_OPACITY) {
      continue;
    }

    const trimmed = element.text.trim();
    if (trimmed !== '') {
      words += trimmed.split(WHITESPACE_PATTERN).length;
    }
  }

  return words;
}

/**
 * Names a placed element cleanly for lint messages.
 *
 * @param element - A placed root element.
 */
function describePlaced(element: ElementSnapshot): string {
  const kind = element.data[PLACED_ATTRIBUTE];
  let tag = '<Place>';
  if (kind === 'shape') {
    tag = '<Shape>';
  } else if (kind === 'text') {
    tag = '<Text>';
  }

  const name = element.data[PLACED_NAME_ATTRIBUTE];
  if (name !== undefined && name !== '') {
    return `${tag} "${name}"`;
  }

  const spec = element.data[PLACED_SPEC_ATTRIBUTE];
  return spec !== undefined && spec !== '' ? `${tag} (${spec})` : `${tag} \`${element.selector}\``;
}

/**
 * Reads a placed element's zone attribute, defaulting to `safe`.
 *
 * @param element - A placed root element.
 */
function placedZoneOf(element: ElementSnapshot): PlacedZone {
  const raw = element.data[PLACED_ZONE_ATTRIBUTE];
  if (raw !== undefined && (PLACED_ZONES as readonly string[]).includes(raw)) {
    return raw as PlacedZone;
  }

  return 'safe';
}

/**
 * Converts a {@link PlacedZone} rectangle into a {@link Box}.
 *
 * @param zone - The slide zone.
 * @param spacing - Brand spacing tokens.
 */
function zoneBox(zone: PlacedZone, spacing: SpacingTokens): Box {
  const [x, y, width, height] = zoneRect(zone, spacing);
  return { x, y, width, height };
}

/**
 * Computes how far `rect` sticks past each edge of `bounds`.
 *
 * @param rect - The element's box.
 * @param bounds - The containing boundary.
 */
function overhangPast(rect: Box, bounds: Box): EdgeOverhang {
  return {
    left: bounds.x - rect.x,
    top: bounds.y - rect.y,
    right: rect.x + rect.width - (bounds.x + bounds.width),
    bottom: rect.y + rect.height - (bounds.y + bounds.height),
  };
}

/**
 * The edge names where overhang exceeds {@link OVERFLOW_TOLERANCE_PX}.
 *
 * @param sides - Overhang distances per edge.
 */
function exceedingEdges(sides: EdgeOverhang): (keyof EdgeOverhang)[] {
  const names: (keyof EdgeOverhang)[] = ['left', 'top', 'right', 'bottom'];
  return names.filter((name) => sides[name] > OVERFLOW_TOLERANCE_PX);
}

/**
 * Formats overhanging edges for a finding message, such as `24px past the right edge`.
 *
 * @param sides - Overhang distances per edge.
 * @param edges - Edges that exceed the tolerance.
 */
function formatOverhang(sides: EdgeOverhang, edges: readonly (keyof EdgeOverhang)[]): string {
  return edges.map((name) => `${Math.round(sides[name])}px past the ${name} edge`).join(', ');
}

/**
 * Corners whose chrome band a placed box overlaps, mirroring `cornersCoveredByPlaced` in
 * `@deckster/kit` with sub-pixel tolerance so boxes flush with the safe area do not
 * false-positive.
 *
 * @param rect - The placed element's bounding box.
 * @param margin - Brand slide margins in canvas pixels.
 * @param canvas - Canvas dimensions in canvas pixels.
 */
function cornersCoveredByBox(
  rect: Box,
  margin: SpacingTokens['margin'],
  canvas: { width: number; height: number },
): ChromeCorner[] {
  const inTop = rect.y < margin.y - OVERFLOW_TOLERANCE_PX && rect.y + rect.height > 0;
  const inBottom =
    rect.y + rect.height > canvas.height - margin.y + OVERFLOW_TOLERANCE_PX &&
    rect.y < canvas.height;
  const inLeft = rect.x < CHROME_CORNER_WIDTH_PX && rect.x + rect.width > 0;
  const inRight =
    rect.x + rect.width > canvas.width - CHROME_CORNER_WIDTH_PX && rect.x < canvas.width;
  const corners: ChromeCorner[] = [];
  if (inTop && inLeft) {
    corners.push('top-left');
  }

  if (inTop && inRight) {
    corners.push('top-right');
  }

  if (inBottom && inLeft) {
    corners.push('bottom-left');
  }

  if (inBottom && inRight) {
    corners.push('bottom-right');
  }

  return corners;
}

/**
 * Maps each corner that holds active brand chrome on this slide to the human-readable names of the
 * chrome items configured there. Empty when chrome is hidden on this slide.
 *
 * @param brand - The brand resolved for the slide's surface.
 * @param slide - The slide context.
 * @param deck - The deck context, used to detect the first shown slide for `skipFirst`.
 */
function configuredChromeCorners(
  brand: BrandContext,
  slide: SlideContext,
  deck: DeckContext,
): Map<ChromeCorner, string[]> {
  const corners = new Map<ChromeCorner, string[]>();
  if (slide.frontmatter['chrome'] === false) {
    return corners;
  }

  const { chrome, logo, layouts } = brand.tokens;
  const firstShown = deck.slides.find((candidate) => !candidate.hidden)?.index;
  if (chrome.skipFirst && firstShown === slide.index) {
    return corners;
  }

  const ownChrome = layouts.find((layout) => layout.name === slide.layout)?.chrome;

  /**
   * Records one chrome item name in a corner.
   *
   * @param corner - The corner holding the item.
   * @param label - Human-readable item name.
   */
  const add = (corner: ChromeCorner, label: string): void => {
    const existing = corners.get(corner);
    if (existing === undefined) {
      corners.set(corner, [label]);
    } else {
      existing.push(label);
    }
  };

  const hasLogoVariant = logo.variants[brand.surface.logo] !== undefined;
  if (chrome.logo.show && hasLogoVariant && ownChrome?.logo !== false) {
    add(logo.placement.corner, 'logo');
  }

  if (chrome.footer.show && chrome.footer.text !== '' && ownChrome?.footer !== false) {
    add(chrome.footer.corner, 'footer');
  }

  const hasCustomPageBox = Array.isArray(ownChrome?.pageNumber);
  if (
    chrome.pageNumber.show &&
    !slide.hidden &&
    ownChrome?.pageNumber !== false &&
    !hasCustomPageBox
  ) {
    add(chrome.pageNumber.corner, 'page number');
  }

  return corners;
}
