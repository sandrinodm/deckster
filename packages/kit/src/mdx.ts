import { defineMdxExtension } from '@deckster/engine/mdx';

import { remarkKitDiagrams } from '#diagrams/remark-diagrams.ts';
import { remarkKitSvg } from '#diagrams/remark-svg.ts';
import { remarkKitApps } from '#mdx/remark-apps.ts';
import { remarkKitCode } from '#mdx/remark-code.ts';
import { remarkKitFrontmatter } from '#mdx/remark-frontmatter.ts';
import { remarkKitIcons } from '#mdx/remark-icons.ts';
import { remarkKitMedia } from '#mdx/remark-media.ts';
import { remarkKitProps } from '#mdx/remark-props.ts';
import { remarkKitPunctuation } from '#mdx/remark-punctuation.ts';

/**
 * The kit's build-time MDX extension, loaded in Node by `@deckster/vite-plugin`. It highlights code
 * blocks (`<Code>`, fences and `<CodeMove>`) with Shiki so the browser ships no highlighter for
 * them, turns the file paths of `<Image>`, `<Video>`, `<Lottie>`, posters and markdown images into
 * imports with warnings for missing files (converting local GIFs to video when `ffmpeg` is
 * installed) and inlines `<Svg src>` drawings; every path must name a file of the right kind inside
 * the deck folder (`./` and `../` from the slide file, a bare path from the deck folder), or the
 * build fails. It fails the build for an `<AppFrame app>` the deck does not have, resolves `<Icon
 * name>` against the brand's icon set (and the icons and image paths that layout fields such as
 * `cards[].icon` and `members[].photo` name), and sets typographic quotes, apostrophes, ellipses
 * and dashes in the prose. Its warnings carry a rule id (`media-missing`, `code-unknown-language`,
 * ...) that `deck lint` reports them under.
 */
export default defineMdxExtension({
  /**
   * The name used in error messages.
   */
  name: '@deckster/kit',

  /**
   * The plugins for one deck: the brand decides the icon set.
   */
  plugins: ({ brand, deckDir, workspaceRoot }) => ({
    remarkPlugins: [
      remarkKitProps,
      remarkKitCode,
      [remarkKitMedia, { deckDir, workspaceRoot }],
      [remarkKitApps, { deckDir }],
      [remarkKitIcons, { set: brand.icons.set }],
      [remarkKitFrontmatter, { set: brand.icons.set, deckDir }],
      [remarkKitSvg, { deckDir }],
      [remarkKitDiagrams, { set: brand.icons.set }],
      remarkKitPunctuation,
    ],
  }),
});
