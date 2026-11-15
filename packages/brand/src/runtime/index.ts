import { definePlugin } from '@deckster/engine';
import 'virtual:deck/brand.css';

export { backgroundUrl, getBrand, useBrand, type BrandView } from '#runtime/use-brand.ts';

/**
 * The brand's runtime plugin, loaded into every deck by `@deckster/vite-plugin` before the kit. Its
 * import brings in the deck brand's stylesheet: Tailwind, the brand's custom properties scoped by
 * `[data-brand]` and `[data-surface]`, and its `@font-face` rules.
 */
export default definePlugin({ name: '@deckster/brand' });
