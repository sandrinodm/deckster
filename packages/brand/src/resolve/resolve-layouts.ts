import type {
  BackgroundLayerTokens,
  BrandLayoutRegionTokens,
  BrandLayoutTitleTokens,
  BrandLayoutTokens,
  GradientTokens,
} from '#resolve/brand-tokens.ts';
import type { ColorResolver } from '#resolve/color-resolver.ts';
import type { BackgroundLayer } from '#schema/background-schema.ts';
import type { BrandLayoutSpec } from '#schema/layout-schema.ts';

import { ALL_SURFACES_KEY } from '#resolve/layout-layers.ts';
import { resolveBackgroundLayers } from '#resolve/resolve-background.ts';

/**
 * The type step a text region bound to a slot uses when it names none.
 */
const DEFAULT_SLOT_TYPE = 'body';

/**
 * The type step a text region bound to a frontmatter field uses when it names none.
 */
const DEFAULT_FIELD_TYPE = 'label';

/**
 * The type step of a layout's title when it names none.
 */
const DEFAULT_TITLE_TYPE = 'title';

/**
 * What a layout resolves against: the brand's color resolver and gradients.
 */
export type LayoutResolveContext = {
  /**
   * The brand's color resolver, which records bad references.
   */
  colors: ColorResolver;

  /**
   * Every gradient, already compiled.
   */
  gradients: Readonly<Record<string, GradientTokens>>;
};

/**
 * Resolves decoded layouts to tokens: fills in every default and resolves each layout's art to
 * layers, keyed by surface name (`*` for art written for every surface).
 *
 * @param layouts - The decoded layouts.
 * @param context - The brand's colors and gradients.
 */
export function resolveLayouts(
  layouts: readonly BrandLayoutSpec[],
  context: LayoutResolveContext,
): BrandLayoutTokens[] {
  return layouts.map((layout, index) => resolveLayout(layout, `layouts[${index}]`, context));
}

/**
 * Resolves one layout.
 *
 * @param layout - The decoded layout.
 * @param path - Its path, such as `layouts[2]`.
 * @param context - The brand's colors and gradients.
 */
function resolveLayout(
  layout: BrandLayoutSpec,
  path: string,
  context: LayoutResolveContext,
): BrandLayoutTokens {
  return {
    name: layout.name,
    label: layout.label,
    description: layout.description,
    fallback: layout.fallback,
    surface: layout.surface,
    title: layout.title === false ? false : resolveTitle(layout.title),
    regions: layout.regions.map(resolveRegion),
    layers: resolveArt(layout.background, `${path}.background`, context),
    layersMode: layout.layers ?? 'replace',
    fields: layout.fields ?? [],
    chrome: layout.chrome ?? {},
    budget: layout.budget ?? {},
    source: layout.source,
  };
}

/**
 * The title's tokens with defaults filled in.
 *
 * @param title - The title as written.
 */
function resolveTitle(title: Exclude<BrandLayoutSpec['title'], false>): BrandLayoutTitleTokens {
  return {
    box: title.box,
    type: title.type ?? DEFAULT_TITLE_TYPE,
    align: title.align ?? 'start',
    anchor: title.anchor ?? 'end',
    color: title.color,
  };
}

/**
 * A region's tokens with defaults filled in: kind, alignment, anchor, and the type step of a text
 * region or the fit of a media region.
 *
 * @param region - The region as written.
 */
function resolveRegion(region: BrandLayoutSpec['regions'][number]): BrandLayoutRegionTokens {
  const kind = region.kind ?? 'text';
  const fallbackType = 'slot' in region.bind ? DEFAULT_SLOT_TYPE : DEFAULT_FIELD_TYPE;
  return {
    bind: region.bind,
    box: region.box,
    kind,
    type: kind === 'text' ? (region.type ?? fallbackType) : undefined,
    align: region.align ?? 'start',
    anchor: region.anchor ?? 'start',
    color: region.color,
    fit: kind === 'media' ? (region.fit ?? 'cover') : undefined,
    treatment: region.treatment,
  };
}

/**
 * Resolves a layout's `background`: a list becomes the `*` key, a map keeps its surface keys, and
 * no background gives no layers.
 *
 * @param background - The background as written.
 * @param path - The `background` field's path.
 * @param context - The brand's colors and gradients.
 */
function resolveArt(
  background: BrandLayoutSpec['background'],
  path: string,
  context: LayoutResolveContext,
): Record<string, readonly BackgroundLayerTokens[]> {
  if (background === undefined) {
    return {};
  }

  if (Array.isArray(background)) {
    return {
      [ALL_SURFACES_KEY]: resolveList(background, path, context),
    };
  }

  return Object.fromEntries(
    Object.entries(background).map(([surface, layers]) => [
      surface,
      resolveList(layers, `${path}.${surface}`, context),
    ]),
  );
}

/**
 * Resolves one list of layers.
 *
 * @param layers - The layers as written.
 * @param path - The list's path.
 * @param context - The brand's colors and gradients.
 */
function resolveList(
  layers: readonly BackgroundLayer[],
  path: string,
  context: LayoutResolveContext,
): BackgroundLayerTokens[] {
  return resolveBackgroundLayers(layers, path, context.colors, context.gradients);
}
