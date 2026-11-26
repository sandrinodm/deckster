import { describe, expect, it } from 'vite-plus/test';

import catalog, { kitLayoutModule } from '#catalog.ts';
import allLayouts from '#layouts/all-layouts.ts';
import runtime from '#runtime.ts';

describe('the kit catalog', () => {
  it('has a contract for every layout the runtime plugin registers, and nothing else', () => {
    const registered = (runtime.layouts ?? []).map((layout) => layout.name);
    expect(catalog.layouts.map((contract) => contract.name)).toEqual(registered);
  });

  it('lists every layout in all-layouts.ts in catalog order', () => {
    expect(allLayouts.map((layout) => layout.name)).toEqual(
      catalog.layouts.map((contract) => contract.name),
    );
  });

  it('exports each layout from the module the deck plugin imports it from, under its name', async () => {
    for (const [index, contract] of catalog.layouts.entries()) {
      const { file, exportName } = kitLayoutModule(contract.name);
      const url = new URL(file, import.meta.url).href;
      const loaded: Record<string, unknown> = await import(/* @vite-ignore */ url);
      expect(loaded[exportName], `${exportName} in ${file}`).toBe(allLayouts[index]);
    }
  });
});

describe('kitLayoutModule', () => {
  it('names the module and the camelCase export of a kebab-case layout', () => {
    expect(kitLayoutModule('do-dont')).toEqual({
      file: 'layouts/do-dont-layout.tsx',
      exportName: 'doDontLayout',
    });
    expect(kitLayoutModule('default')).toEqual({
      file: 'layouts/default-layout.tsx',
      exportName: 'defaultLayout',
    });
  });
});
