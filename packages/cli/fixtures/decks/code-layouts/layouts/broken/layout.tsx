import { defineLayout, type LayoutDefinition } from '@deckster/engine';

/**
 * Fails the way a layout with a mistake at the top of its module does.
 */
function failToLoad(): LayoutDefinition {
  throw new Error('the broken fixture layout does not load');
}

export default failToLoad() ?? defineLayout({ name: 'broken', component: () => null });
