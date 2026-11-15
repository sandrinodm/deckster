import { describe, expect, it } from 'vite-plus/test';

import catalog from '#catalog.ts';
import runtime from '#runtime.ts';

describe('the kit catalog', () => {
  it('has a contract for every layout the runtime plugin registers, and nothing else', () => {
    const registered = (runtime.layouts ?? []).map((layout) => layout.name);
    expect(catalog.layouts.map((contract) => contract.name)).toEqual(registered);
  });
});
