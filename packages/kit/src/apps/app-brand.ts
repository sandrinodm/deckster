import type { BridgeBrand } from '@deckster/app-bridge';
import type { BrandView } from '@deckster/brand/runtime';

import { brandVariables as v, FAMILY_ROLES, TYPE_STEPS } from '@deckster/brand';

/**
 * A CSS `url(...)` reference, quoted or not, capturing the quote and the address.
 */
const URL_REFERENCE = /url\(\s*(['"]?)(.*?)\1\s*\)/g;

/**
 * An address that needs no base: one with a scheme (`https:`, `data:`, `blob:`) or a bare fragment.
 */
const ABSOLUTE_ADDRESS = /^(?:[a-z][a-z0-9+.-]*:|#)/i;

/**
 * The brand's tokens for one surface, in the two forms an app receives them.
 */
export type AppTheme = {
  /**
   * The typed object.
   */
  brand: BridgeBrand;

  /**
   * The same tokens as CSS custom properties, named as the deck names them.
   */
  cssVariables: Record<string, string>;
};

/**
 * Builds what the bridge's `init` carries from the brand as one surface shows it: the roles, paint,
 * font stacks, type scale, radii, strokes, spacing, shadows and chart colors, once as a typed
 * object and once as custom properties (`--brand-color-fg`, `--brand-font-display`,
 * `--brand-type-body-size`, `--brand-data-1`, ...) with the names the deck's own stylesheet uses,
 * so an app styles itself with the same variables a slide does.
 *
 * @param view - The brand and the surface, from `useBrand()`.
 * @returns The typed brand and the custom properties.
 */
export function appTheme(view: BrandView): AppTheme {
  const { brand, surface } = view;
  const fonts = Object.fromEntries(
    FAMILY_ROLES.map((role) => [role, brand.typography.families[role].stack]),
  );
  const type = Object.fromEntries(
    TYPE_STEPS.map((step) => {
      const tokens = brand.typography.scale[step];
      const family = brand.typography.families[tokens.family].stack;
      return [
        step,
        { family, size: tokens.size, lineHeight: tokens.lineHeight, weight: tokens.weight },
      ];
    }),
  );
  const shadow = Object.fromEntries(
    Object.entries(surface.shadow).map(([name, tokens]) => [name, tokens.css]),
  );
  const { categorical, context } = surface.data;
  const bridgeBrand: BridgeBrand = {
    name: brand.name,
    label: brand.label,
    surface: surface.name,
    scheme: surface.scheme,
    roles: { ...surface.roles },
    background: surface.background,
    fonts,
    type,
    radius: { ...brand.shape.radius },
    stroke: { ...brand.shape.stroke },
    space: { ...brand.spacing.scale },
    shadow,
    data: { categorical: [...categorical], context },
  };
  return { brand: bridgeBrand, cssVariables: themeVariables(view) };
}

/**
 * The page's `@font-face` rules as one stylesheet text, for an app to declare the brand's fonts.
 * Each rule's `url(...)` is made absolute against the stylesheet it came from (or the page, for an
 * inline `<style>`), because the app's document lives at `apps/<name>/` and would resolve a
 * relative font path there; in a build the fonts sit next to the deck's own CSS. Sheets the page
 * may not read are skipped.
 *
 * @param scope - The document to read; defaults to the page's.
 * @returns The rules, or an empty string when there are none.
 */
export function collectFontFaces(scope: Document = document): string {
  const rules: string[] = [];
  for (const sheet of scope.styleSheets) {
    readFontFaces(sheet, scope, rules);
  }

  return rules.join('\n');
}

/**
 * Rewrites every relative `url(...)` in a piece of CSS to an absolute URL against `base`. `data:`,
 * `blob:` and already absolute URLs are kept.
 *
 * @param css - The CSS text, such as one `@font-face` rule.
 * @param base - The URL relative references resolve against: the stylesheet's own address.
 */
export function absoluteUrls(css: string, base: string): string {
  return css.replace(URL_REFERENCE, (whole, quote: string, address: string) => {
    if (address === '' || ABSOLUTE_ADDRESS.test(address)) {
      return whole;
    }

    try {
      return `url(${quote}${new URL(address, base).href}${quote})`;
    } catch {
      return whole;
    }
  });
}

/**
 * The custom properties of a surface: roles, the roles' small-text colors, paint, fonts, type
 * steps, shape, spacing, shadows and data colors.
 *
 * @param view - The brand and the surface.
 */
function themeVariables(view: BrandView): Record<string, string> {
  const { brand, surface } = view;
  const entries: [string, string][] = [
    ...Object.entries(surface.roles).map(([role, color]): [string, string] => [
      v.role(role),
      color,
    ]),
    ...Object.entries(surface.text).map(([tone, color]): [string, string] => [v.text(tone), color]),
    [v.background, surface.background],
    ...FAMILY_ROLES.map((role): [string, string] => [
      v.font(role),
      brand.typography.families[role].stack,
    ]),
    ...TYPE_STEPS.flatMap((step) => typeEntries(step, view)),
    ...Object.entries(brand.shape.radius).map(([name, size]): [string, string] => [
      v.radius(name),
      `${size}px`,
    ]),
    ...Object.entries(brand.shape.stroke).map(([name, size]): [string, string] => [
      v.stroke(name),
      `${size}px`,
    ]),
    ...Object.entries(brand.spacing.scale).map(([name, size]): [string, string] => [
      v.space(name),
      `${size}px`,
    ]),
    ...Object.entries(surface.shadow).map(([name, tokens]): [string, string] => [
      v.shadow(name),
      tokens.css,
    ]),
    ...surface.data.categorical.map((color, index): [string, string] => [
      v.categorical(index),
      color,
    ]),
    [v.context, surface.data.context],
    [v.plate, surface.data.plate],
  ];
  return Object.fromEntries(entries);
}

/**
 * The custom properties of one type step.
 *
 * @param step - The step name.
 * @param view - The brand.
 */
function typeEntries(step: (typeof TYPE_STEPS)[number], view: BrandView): [string, string][] {
  const tokens = view.brand.typography.scale[step];
  const family = view.brand.typography.families[tokens.family].stack;
  return [
    [v.type(step, 'family'), family],
    [v.type(step, 'size'), `${tokens.size}px`],
    [v.type(step, 'line-height'), String(tokens.lineHeight)],
    [v.type(step, 'tracking'), `${tokens.tracking}em`],
    [v.type(step, 'weight'), String(tokens.weight)],
  ];
}

/**
 * Appends the `@font-face` rules of one sheet to `rules`. A sheet the page may not read, such as
 * another origin's, throws when its rules are read; the rules read before the throw are kept, and
 * the sheet's remaining ones are skipped.
 *
 * @param sheet - The stylesheet to read.
 * @param scope - The document the sheet belongs to, whose base address a relative sheet uses.
 * @param rules - The list the rules are appended to.
 */
function readFontFaces(sheet: CSSStyleSheet, scope: Document, rules: string[]): void {
  try {
    for (const rule of sheet.cssRules) {
      if (rule instanceof CSSFontFaceRule) {
        rules.push(absoluteUrls(rule.cssText, sheet.href ?? scope.baseURI));
      }
    }
  } catch {
    // Reading the rules failed, so the sheet has nothing more this page can use.
  }
}
