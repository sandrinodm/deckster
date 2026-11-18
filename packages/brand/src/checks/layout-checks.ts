import type { BackgroundLayer } from '#schema/background-schema.ts';
import type { BrandLayoutSpec } from '#schema/layout-schema.ts';
import type { BrandProblem } from '#validate/brand-error.ts';

import {
  LAYOUT_CANVAS_HEIGHT,
  LAYOUT_CANVAS_WIDTH,
  MIN_BOX_SIZE_PX,
} from '#schema/layout-schema.ts';
import { pickFrom } from '#validate/suggest.ts';

/**
 * The names a layout may refer to in the brand it belongs to.
 */
export type LayoutNames = {
  /**
   * Every surface name, the derived required ones included.
   */
  surfaces: readonly string[];

  /**
   * Every image treatment name, `plain` included.
   */
  treatments: readonly string[];

  /**
   * Every gradient name.
   */
  gradients: readonly string[];
};

/**
 * What the layout checks found: errors stop the build, warnings do not.
 */
export type LayoutFindings = {
  /**
   * Problems that make a layout unusable.
   */
  errors: BrandProblem[];

  /**
   * Problems that make a layout look wrong but still work.
   */
  warnings: BrandProblem[];
};

/**
 * One box and where it is, for the overlap check.
 */
type PlacedText = {
  /**
   * The field path, such as `layouts[1].regions[0]`.
   */
  path: string;

  /**
   * What the box shows, for the message: `the title` or `slot "body"`.
   */
  what: string;

  /**
   * `[x, y, width, height]`.
   */
  box: readonly [number, number, number, number];
};

/**
 * Checks that need no layout catalog: unique names, boxes inside the canvas, one binding once,
 * options on the right kind of region, names that exist in the brand, a title or a region in every
 * layout; and a warning for text boxes that overlap.
 *
 * @param layouts - The decoded layouts.
 * @param names - The surfaces, treatments and gradients the brand defines.
 */
export function checkLayouts(
  layouts: readonly BrandLayoutSpec[],
  names: LayoutNames,
): LayoutFindings {
  const errors = [...duplicateNames(layouts)];
  const warnings: BrandProblem[] = [];
  layouts.forEach((layout, index) => {
    const path = `layouts[${index}]`;
    errors.push(
      ...emptyLayout(layout, path),
      ...boxProblems(layout, path),
      ...duplicateBindings(layout, path),
      ...fieldProblems(layout, path),
      ...regionOptionProblems(layout, path),
      ...nameProblems(layout, path, names),
    );
    warnings.push(...overlapWarnings(layout, path));
  });
  return { errors, warnings };
}

/**
 * A problem for each layout whose name an earlier layout already has.
 *
 * @param layouts - The decoded layouts.
 */
function duplicateNames(layouts: readonly BrandLayoutSpec[]): BrandProblem[] {
  const seen = new Map<string, number>();
  return layouts.flatMap((layout, index) => {
    const first = seen.get(layout.name);
    if (first === undefined) {
      seen.set(layout.name, index);
      return [];
    }

    return [
      {
        path: `layouts[${index}].name`,
        message: `"${layout.name}" is also the name of layouts[${first}].`,
        fix: 'Give each layout its own name; a slide picks a layout by it.',
      },
    ];
  });
}

/**
 * A problem for a layout with neither a title nor a region, which would draw nothing.
 *
 * @param layout - The layout.
 * @param path - Its path.
 */
function emptyLayout(layout: BrandLayoutSpec, path: string): BrandProblem[] {
  if (layout.title !== false || layout.regions.length > 0) {
    return [];
  }

  return [
    {
      path,
      message: `"${layout.name}" has no title and no regions, so a slide on it would show nothing.`,
      fix: 'Add a `title: { box: [...] }`, or at least one entry in `regions`.',
    },
  ];
}

/**
 * Problems for every box that leaves the canvas or is too small to hold anything.
 *
 * @param layout - The layout.
 * @param path - Its path.
 */
function boxProblems(layout: BrandLayoutSpec, path: string): BrandProblem[] {
  const boxes = [
    ...(layout.title === false ? [] : [{ path: `${path}.title.box`, box: layout.title.box }]),
    ...layout.regions.map((region, index) => ({
      path: `${path}.regions[${index}].box`,
      box: region.box,
    })),
    ...(Array.isArray(layout.chrome?.pageNumber)
      ? [{ path: `${path}.chrome.pageNumber`, box: layout.chrome.pageNumber }]
      : []),
  ];
  return boxes.flatMap(({ path: boxPath, box }) => {
    const [x, y, width, height] = box;
    if (width < MIN_BOX_SIZE_PX || height < MIN_BOX_SIZE_PX) {
      return [
        {
          path: boxPath,
          message: `The box is ${width}x${height}; it must be at least ${MIN_BOX_SIZE_PX}x${MIN_BOX_SIZE_PX}.`,
          fix: 'Write the box as [x, y, width, height] with a width and a height in canvas pixels.',
        },
      ];
    }

    if (x < 0 || y < 0 || x + width > LAYOUT_CANVAS_WIDTH || y + height > LAYOUT_CANVAS_HEIGHT) {
      return [
        {
          path: boxPath,
          message:
            `The box [${box.join(', ')}] leaves the ${LAYOUT_CANVAS_WIDTH}x` +
            `${LAYOUT_CANVAS_HEIGHT} canvas.`,
          fix: 'Keep x and y at 0 or more, x + width within 1920 and y + height within 1080.',
        },
      ];
    }

    return [];
  });
}

/**
 * The key a region's binding is written under, such as `slot:body`.
 *
 * @param region - The region.
 */
function bindingKey(region: BrandLayoutSpec['regions'][number]): string {
  return 'slot' in region.bind ? `slot "${region.bind.slot}"` : `field "${region.bind.field}"`;
}

/**
 * A problem for each region that binds what an earlier region already shows.
 *
 * @param layout - The layout.
 * @param path - Its path.
 */
function duplicateBindings(layout: BrandLayoutSpec, path: string): BrandProblem[] {
  const seen = new Map<string, number>();
  return layout.regions.flatMap((region, index) => {
    const key = bindingKey(region);
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, index);
      return [];
    }

    return [
      {
        path: `${path}.regions[${index}].bind`,
        message: `${key} is already shown by regions[${first}].`,
        fix: 'Bind each slot or field once; to show a slot in two places, use two layouts.',
      },
    ];
  });
}

/**
 * Problems for a `fields` entry that is listed twice or that a region also binds: a field a region
 * draws is accepted already.
 *
 * @param layout - The layout.
 * @param path - Its path.
 */
function fieldProblems(layout: BrandLayoutSpec, path: string): BrandProblem[] {
  const bound = new Set(
    layout.regions.flatMap((region) => ('field' in region.bind ? [region.bind.field] : [])),
  );
  const seen = new Set<string>();
  return (layout.fields ?? []).flatMap((field, index) => {
    const fieldPath = `${path}.fields[${index}]`;
    if (seen.has(field)) {
      return [
        {
          path: fieldPath,
          message: `"${field}" is listed twice in \`fields\`.`,
          fix: 'List each field once.',
        },
      ];
    }

    seen.add(field);
    return bound.has(field)
      ? [
          {
            path: fieldPath,
            message: `A region already binds the field "${field}", so \`fields\` need not list it.`,
            fix: 'Remove it from `fields`; list only fallback fields the layout does not draw.',
          },
        ]
      : [];
  });
}

/**
 * Problems for options on a region of the wrong kind: a field that is not text, `fit` or
 * `treatment` off a media region, and `type` or `color` off a text region.
 *
 * @param layout - The layout.
 * @param path - Its path.
 */
function regionOptionProblems(layout: BrandLayoutSpec, path: string): BrandProblem[] {
  const regions = layout.regions.flatMap((region, index) => {
    const regionPath = `${path}.regions[${index}]`;
    const kind = region.kind ?? 'text';
    return [
      ...fieldKindProblem(region, kind, regionPath),
      ...misplacedOption(region.fit, 'fit', kind === 'media', 'a media region', regionPath),
      ...misplacedOption(
        region.treatment,
        'treatment',
        kind === 'media',
        'a media region',
        regionPath,
      ),
      ...misplacedOption(region.type, 'type', kind === 'text', 'a text region', regionPath),
      ...misplacedOption(region.color, 'color', kind === 'text', 'a text region', regionPath),
    ];
  });
  return regions;
}

/**
 * A problem for a field binding on a region that is not text.
 *
 * @param region - The region.
 * @param kind - Its kind, with the default applied.
 * @param path - The region's path.
 */
function fieldKindProblem(
  region: BrandLayoutSpec['regions'][number],
  kind: string,
  path: string,
): BrandProblem[] {
  if (!('field' in region.bind) || kind === 'text') {
    return [];
  }

  return [
    {
      path: `${path}.kind`,
      message: `A field shows frontmatter text, so its region cannot be "${kind}".`,
      fix: 'Remove `kind`, or set `kind: "text"`; bind a slot to show media or content.',
    },
  ];
}

/**
 * A problem for an option set on a region that cannot use it.
 *
 * @param value - The option's value, if the region sets it.
 * @param name - The option's name.
 * @param allowed - Whether the region's kind takes the option.
 * @param where - The kind that takes it, for the message.
 * @param path - The region's path.
 */
function misplacedOption(
  value: unknown,
  name: string,
  allowed: boolean,
  where: string,
  path: string,
): BrandProblem[] {
  if (value === undefined || allowed) {
    return [];
  }

  return [
    {
      path: `${path}.${name}`,
      message: `\`${name}\` applies only to ${where}.`,
      fix: `Remove \`${name}\`, or change the region's \`kind\`.`,
    },
  ];
}

/**
 * Problems for a surface, a background key, a treatment or a gradient the brand does not define.
 *
 * @param layout - The layout.
 * @param path - Its path.
 * @param names - The names the brand defines.
 */
function nameProblems(layout: BrandLayoutSpec, path: string, names: LayoutNames): BrandProblem[] {
  const lists = backgroundLists(layout.background, `${path}.background`);
  return [
    ...unknownName(layout.surface, names.surfaces, `${path}.surface`, 'surface'),
    ...lists.flatMap((list) =>
      list.surface === undefined
        ? []
        : unknownName(list.surface, names.surfaces, list.path, 'surface'),
    ),
    ...lists.flatMap((list) => layerNameProblems(list.layers, list.path, names)),
    ...layout.regions.flatMap((region, index) =>
      unknownName(
        region.treatment,
        names.treatments,
        `${path}.regions[${index}].treatment`,
        'image treatment',
      ),
    ),
  ];
}

/**
 * One list of layers of a layout's background, with where it is and the surface it is keyed by.
 */
type BackgroundList = {
  /**
   * The list's path.
   */
  path: string;

  /**
   * The surface the list is keyed by; `undefined` for a list written for every surface.
   */
  surface: string | undefined;

  /**
   * The layers.
   */
  layers: readonly BackgroundLayer[];
};

/**
 * The lists of layers a layout's `background` holds: one for a plain list, one per surface for a
 * keyed object, none without a background.
 *
 * @param background - The background as written.
 * @param path - The `background` field's path.
 */
function backgroundLists(
  background: BrandLayoutSpec['background'],
  path: string,
): BackgroundList[] {
  if (background === undefined) {
    return [];
  }

  if (Array.isArray(background)) {
    return [{ path, surface: undefined, layers: background }];
  }

  return Object.entries(background).map(([surface, layers]) => ({
    path: `${path}.${surface}`,
    surface,
    layers,
  }));
}

/**
 * Problems for a layer's gradient or image treatment that the brand does not define.
 *
 * @param layers - The layers.
 * @param path - The list's path.
 * @param names - The names the brand defines.
 */
function layerNameProblems(
  layers: readonly BackgroundLayer[],
  path: string,
  names: LayoutNames,
): BrandProblem[] {
  return layers.flatMap((layer, index) => {
    if (layer.type === 'gradient') {
      return unknownName(layer.gradient, names.gradients, `${path}[${index}].gradient`, 'gradient');
    }

    return layer.type === 'image'
      ? unknownName(
          layer.treatment,
          names.treatments,
          `${path}[${index}].treatment`,
          'image treatment',
        )
      : [];
  });
}

/**
 * A problem when a name the brand should define is not among them.
 *
 * @param name - The name as written; nothing is checked when it is `undefined`.
 * @param known - The names the brand defines.
 * @param path - The field's path.
 * @param what - What the name is, such as `surface`.
 */
function unknownName(
  name: string | undefined,
  known: readonly string[],
  path: string,
  what: string,
): BrandProblem[] {
  if (name === undefined || known.includes(name)) {
    return [];
  }

  return [
    {
      path,
      message: `The brand has no ${what} "${name}".`,
      fix: `${pickFrom(name, known, what)} Or define it in brand.ts.`,
    },
  ];
}

/**
 * Warnings for text boxes (the title and text regions) that overlap, since their text would run
 * into each other.
 *
 * @param layout - The layout.
 * @param path - Its path.
 */
function overlapWarnings(layout: BrandLayoutSpec, path: string): BrandProblem[] {
  const texts: PlacedText[] = [
    ...(layout.title === false
      ? []
      : [{ path: `${path}.title`, what: 'the title', box: layout.title.box }]),
    ...layout.regions.flatMap((region, index) =>
      (region.kind ?? 'text') === 'text'
        ? [{ path: `${path}.regions[${index}]`, what: bindingKey(region), box: region.box }]
        : [],
    ),
  ];
  return texts.flatMap((later, laterIndex) =>
    texts.slice(0, laterIndex).flatMap((earlier) =>
      overlaps(earlier.box, later.box)
        ? [
            {
              path: `${later.path}.box`,
              message: `The box of ${later.what} overlaps the box of ${earlier.what}.`,
              fix: 'Move or shrink one of the boxes so their text cannot run into each other.',
            },
          ]
        : [],
    ),
  );
}

/**
 * Whether two boxes share any area; boxes that only touch do not overlap.
 *
 * @param first - The first box.
 * @param second - The second box.
 */
function overlaps(first: PlacedText['box'], second: PlacedText['box']): boolean {
  const [ax, ay, aw, ah] = first;
  const [bx, by, bw, bh] = second;
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}
