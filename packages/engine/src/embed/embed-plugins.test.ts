import { describe, expect, it } from 'vite-plus/test';

import { embedPlugins } from '#embed/embed-plugins.ts';
import { engineDefaultLayout } from '#layouts/default-layout.tsx';
import { definePlugin } from '#plugins/deck-plugin.ts';

/**
 * A component standing in for chrome, a stage wrapper or an overlay.
 */
function Part() {
  return null;
}

describe('embedPlugins', () => {
  it('keeps layouts, components and chrome, and drops stages, overlays and handlers', () => {
    const tools = definePlugin({
      name: 'tools',
      layouts: [engineDefaultLayout],
      components: { Part },
      chrome: Part,
      stage: Part,
      overlay: Part,
      onKeyDown: () => true,
      onPointer: () => true,
    });
    expect(embedPlugins([tools])).toEqual([
      { name: 'tools', layouts: [engineDefaultLayout], components: { Part }, chrome: Part },
    ]);
  });

  it('keeps the plugin order and leaves the input unchanged', () => {
    const first = definePlugin({ name: 'first', overlay: Part });
    const second = definePlugin({ name: 'second' });
    expect(embedPlugins([first, second])).toEqual([{ name: 'first' }, { name: 'second' }]);
    expect(first.overlay).toBe(Part);
  });
});
