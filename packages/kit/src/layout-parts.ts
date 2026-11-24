/**
 * The building blocks a layout draws with, for the kit's own layouts and for code layouts in a
 * brand or a deck: `import { Frame, SlideHeader, useEnter } from '@deckster/kit/layout-parts'`.
 * Inside the kit the same module is `#layout-parts.ts`.
 *
 * Importing this module loads the stylesheets of the parts it exports, so it runs in the browser
 * only. A contract (loaded in Node) imports from `@deckster/kit/layout-fields` instead.
 *
 * Three of the parts keep state that a copy would not share with the kit: the registry of
 * frontmatter pictures and icons (`frontmatterAsset`, `frontmatterIcon`), the table settings
 * context (`TableLayoutContext`) and the reveal state behind `useStillMotion`, `StatValue` and
 * `StatDelta`. A layout must use these exports and never a copy of them. Removing or renaming a
 * name is a breaking change, and the kit's API test fails until the change is made on purpose.
 */
export {
  Eyebrow,
  FittedText,
  Footnote,
  Frame,
  Region,
  SlideHeader,
} from '#foundation/slide-parts.tsx';
export { useFitGroupWidth, useRenderOnFontLoad, type FitRung } from '#foundation/fit-text.ts';
export { useFitLevel } from '#foundation/fit-level.ts';
export { TreatedMedia } from '#foundation/media-treatment.tsx';
export { BrandLogo } from '#foundation/brand-logo.tsx';
export { smartPunctuation } from '#foundation/smart-punctuation.ts';
export {
  frontmatterAsset,
  frontmatterIcon,
  type IconComponent,
} from '#foundation/frontmatter-assets.ts';
export { TableLayoutContext, type TableLayoutSettings } from '#foundation/table-context.ts';
export { useStillMotion } from '#motion/still-motion.ts';
export { StatDelta, StatValue } from '#foundation/stat-figure.tsx';
export { enterProps, MAX_ENTER_ORDER, useEnter, type EnterProps } from '#motion/enter.ts';
export { Step } from '#motion/step.tsx';
