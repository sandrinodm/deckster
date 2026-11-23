import { Predicate } from 'effect';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { EstreeNode, MdastNode } from '#mdx/mdast.ts';

import { frontmatterAssetKey, frontmatterIconKey } from '#foundation/frontmatter-assets.ts';
import { describeBase, PATH_RULE, resolveDeckPath, type DeckPath } from '#mdx/deck-path.ts';
import { failBuild, warn, type KitFile } from '#mdx/kit-file.ts';
import { defaultImport } from '#mdx/mdast.ts';
import { runKitEffect } from '#mdx/node-runtime.ts';
import { hasIcon, splitName, unknownIconFix, unknownIconReason } from '#mdx/remark-icons.ts';

/**
 * The parts of a vfile the plugin uses: the slide's frontmatter, which the build sets on
 * `file.data`, and warnings and failures.
 */
export type FrontmatterFile = Pick<KitFile, 'path' | 'message' | 'fail'> & {
  /**
   * Data the build attaches to the file; `frontmatter` on a slide.
   */
  data?: { frontmatter?: unknown };
};

/**
 * Options of {@link remarkKitFrontmatter}.
 */
export type FrontmatterOptions = {
  /**
   * The brand's Iconify set, which a bare icon name comes from.
   */
  set: string;

  /**
   * The absolute deck folder (it holds `deck.config.ts`): bare paths start there, and every file
   * must be inside it.
   */
  deckDir: string;
};

/**
 * Frontmatter keys whose value names an icon of the brand's set, such as a card's `icon`.
 */
const ICON_KEYS = new Set(['icon']);

/**
 * Frontmatter keys whose value is an image file, such as a team member's `photo` or a logo's `src`.
 * No layout field takes a video.
 */
const ASSET_KEYS = new Set(['photo', 'src']);

/**
 * The slide's own background, which takes a file as its whole value (`background: assets/hall.jpg`)
 * or under `src`; `none` is a keyword, not a file.
 */
const BACKGROUND_KEY = 'background';

/**
 * An inline image, which needs no file: `data:image/svg+xml,...`.
 */
const DATA_IMAGE = /^data:image\//iu;

/**
 * The module whose `registerFrontmatterAssets` a slide calls, by absolute path, so it resolves to
 * the same module the layouts import whatever the deck depends on.
 */
const REGISTRY_MODULE = fileURLToPath(
  new URL('../foundation/frontmatter-assets.ts', import.meta.url),
);

/**
 * The local name of the registry function in the slide module.
 */
const REGISTER = 'kitRegisterFrontmatterAssets';

/**
 * A value found in the frontmatter, with its path for messages.
 */
type Found = {
  /**
   * Where it is: `members[2].photo`.
   */
  at: string;

  /**
   * The key it is under.
   */
  key: string;

  /**
   * The string.
   */
  value: string;
};

/**
 * A remark plugin that resolves the icons and files a slide's layout fields name, such as `cards:
 * [{ icon: leaf }]` or `members: [{ photo: assets/dana.jpg }]`, which the frontmatter cannot import
 * itself. Each icon is checked against the brand's set (an unknown one fails the build with the
 * set's closest names) and imported from `~icons/<set>/<name>`. Each file path follows the deck's
 * path rule: a bare path (`assets/dana.jpg`) is relative to the deck folder, the one that holds
 * `deck.config.ts`; a path that starts with `./` or `../` is relative to the slide file; one that
 * starts with `/` names a file in the deck's `public/` folder, so an absolute path on the disk
 * (`/Users/me/dana.jpg`), which is not there, fails the build. The file, links followed, must be
 * inside the deck folder and be an image (.svg, .png, .jpg, .jpeg, .webp, .avif, .gif): anything
 * else fails the build naming the field (`members[2].photo`). A web address fails too, because a
 * slide must render the same offline, in `deckster shot` and in exports: the fix is to download the
 * file into `assets/`. A `data:image/` URI is kept as it is. A missing file is a `media-missing`
 * warning, which `deckster lint` reports as an error, and the layout draws its fallback until it is
 * there. Found files are imported so the bundler ships them, and the slide registers them by the
 * value as written (`registerFrontmatterAssets`), which is what the layout looks up.
 *
 * @param options - The brand's icon set and the deck folder.
 */
export function remarkKitFrontmatter(
  options: FrontmatterOptions,
): (tree: MdastNode, file: FrontmatterFile) => Promise<void> {
  return async (tree, file) => {
    const found = collect(file.data?.frontmatter, '');
    const entries: { key: string; local: string }[] = [];
    const imports: MdastNode[] = [];
    const seen = new Map<string, string>();
    /**
     * Imports a specifier once and records the registry key it fills.
     */
    const add = (key: string, specifier: string): void => {
      if (seen.has(key)) {
        return;
      }

      const local = `kitFrontmatter${seen.size}`;
      seen.set(key, local);
      imports.push(defaultImport(local, specifier));
      entries.push({ key, local });
    };

    for (const item of found) {
      if (ICON_KEYS.has(item.key)) {
        const { set, icon } = splitName(item.value, options.set);
        if (!hasIcon(set, icon)) {
          failBuild(
            file,
            {
              rule: 'icon-unknown',
              problem: `\`${item.at}: ${item.value}\` ${unknownIconReason(set)}`,
              fix: unknownIconFix(set, icon),
            },
            undefined,
          );
        }

        add(frontmatterIconKey(item.value, options.set), `~icons/${set}/${icon}`);
      } else if (file.path !== undefined) {
        const resolved = await runKitEffect(
          resolveDeckPath({
            source: item.value,
            slideFile: file.path,
            deckDir: options.deckDir,
            kind: 'image',
          }),
        );
        const specifier = checkAsset(item, resolved, file);
        if (specifier !== undefined) {
          // A path relative to the slide names a different file in each folder, so its key
          // carries the slide; a deck-relative path shares one key.
          const slideFile = item.value.startsWith('.')
            ? path.relative(options.deckDir, file.path).split(path.sep).join('/')
            : undefined;
          add(frontmatterAssetKey(item.value, slideFile), specifier);
        }
      }
    }

    if (entries.length > 0) {
      tree.children = [...imports, registration(entries), ...(tree.children ?? [])];
    }
  };
}

/**
 * Checks one resolved file field: fails the build for a path the deck does not accept, warns for a
 * missing file, and gives the import of a file in the deck.
 *
 * @param item - The field.
 * @param resolved - Its value, resolved.
 * @param file - The vfile.
 * @returns The import specifier; `undefined` for a value that needs no import or a missing file.
 */
function checkAsset(item: Found, resolved: DeckPath, file: FrontmatterFile): string | undefined {
  const field = `\`${item.at}: ${item.value}\``;
  switch (resolved.type) {
    case 'local':
      return resolved.specifier;
    case 'public':
      return undefined;
    case 'missing':
      if (resolved.base === 'public') {
        return failBuild(
          file,
          {
            rule: 'media-path',
            problem:
              `${field} is an absolute path, and the deck's public/ folder has no such file ` +
              `(looked for ${resolved.looked}).`,
            fix:
              "A path that starts with / names a file in the deck's public/ folder, not on the " +
              `disk. Copy the image into the deck's assets/ folder and write \`${item.key}: ` +
              `assets/<file>\`.`,
          },
          undefined,
        );
      }

      warn(
        file,
        {
          rule: 'media-missing',
          problem: `${field} does not exist (looked for ${resolved.looked}).`,
          fix:
            `Add the file, or fix the path, which is ${describeBase(resolved.base)}. ` +
            `${PATH_RULE} The layout draws its fallback until the file is there.`,
        },
        undefined,
      );
      return undefined;
    case 'rejected':
      return failBuild(
        file,
        { rule: 'media-path', problem: `${field} ${resolved.reason}`, fix: resolved.fix },
        undefined,
      );
    case 'url':
      if (DATA_IMAGE.test(item.value)) {
        return undefined;
      }

      return failBuild(
        file,
        {
          rule: 'media-path',
          problem:
            resolved.scheme === 'http' || resolved.scheme === 'https' || resolved.scheme === ''
              ? `${field} is a web address; a layout field takes a file in the deck.`
              : `${field} is a ${resolved.scheme}: URL; a layout field takes an image file ` +
                'in the deck or a `data:image/` URI.',
          fix:
            "Download the image into the deck's assets/ folder and write its path, such as " +
            `\`${item.key}: assets/${webFileName(item.value)}\`, so the slide renders the same ` +
            'offline, in `deckster shot` and in exports.',
        },
        undefined,
      );
  }
}

/**
 * A file name for a downloaded copy of a web address, for the fix: the last part of its path.
 *
 * @param value - The address.
 */
function webFileName(value: string): string {
  const last = value
    .split(/[?#]/u)[0]
    ?.split('/')
    .findLast((part) => part !== '');
  return last === undefined || !last.includes('.') || last.includes(':') ? 'image.png' : last;
}

/**
 * Every icon and file value in the frontmatter, depth first.
 *
 * @param value - A frontmatter value.
 * @param at - Its path.
 */
function collect(value: unknown, at: string): Found[] {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, index) => collect(item, `${at}[${index}]`));
  }

  if (!Predicate.isObject(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, item]): Found[] => {
    const where = at === '' ? key : `${at}.${key}`;
    if (typeof item === 'string' && (ICON_KEYS.has(key) || ASSET_KEYS.has(key))) {
      return [{ at: where, key, value: item }];
    }

    if (at === '' && key === BACKGROUND_KEY && typeof item === 'string' && item !== 'none') {
      return [{ at: where, key, value: item }];
    }

    return collect(item, where);
  });
}

/**
 * The ESM block that imports the registry and registers the slide's icons and files: `export const
 * kitFrontmatterAssets = kitRegisterFrontmatterAssets({ ... })`.
 *
 * @param entries - Registry keys and the local bindings of their imports.
 */
function registration(entries: readonly { key: string; local: string }[]): MdastNode {
  const properties: EstreeNode[] = entries.map(({ key, local }) => ({
    type: 'Property',
    kind: 'init',
    method: false,
    shorthand: false,
    computed: false,
    key: { type: 'Literal', value: key, raw: JSON.stringify(key) },
    value: { type: 'Identifier', name: local },
  }));
  const object = entries.map(({ key, local }) => `${JSON.stringify(key)}: ${local}`).join(', ');
  const registryPath = JSON.stringify(REGISTRY_MODULE);
  return {
    type: 'mdxjsEsm',
    value:
      `import { registerFrontmatterAssets as ${REGISTER} } from ${registryPath}\n` +
      `export const kitFrontmatterAssets = ${REGISTER}({ ${object} })`,
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        comments: [],
        body: [
          {
            type: 'ImportDeclaration',
            attributes: [],
            specifiers: [
              {
                type: 'ImportSpecifier',
                imported: { type: 'Identifier', name: 'registerFrontmatterAssets' },
                local: { type: 'Identifier', name: REGISTER },
              },
            ],
            source: {
              type: 'Literal',
              value: REGISTRY_MODULE,
              raw: JSON.stringify(REGISTRY_MODULE),
            },
          },
          {
            type: 'ExportNamedDeclaration',
            attributes: [],
            specifiers: [],
            source: null,
            declaration: {
              type: 'VariableDeclaration',
              kind: 'const',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: 'kitFrontmatterAssets' },
                  init: {
                    type: 'CallExpression',
                    optional: false,
                    callee: { type: 'Identifier', name: REGISTER },
                    arguments: [{ type: 'ObjectExpression', properties }],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  };
}
