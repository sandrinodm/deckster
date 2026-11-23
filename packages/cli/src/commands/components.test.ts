import { expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { runCaptured } from '#cli.fixture.ts';

it.effect('deckster components --json prints every component with its props, use and example', () =>
  Effect.gen(function* () {
    const { code, output } = yield* runCaptured(['components', '--json']);
    expect(code).toBe(0);
    const catalog = JSON.parse(output) as {
      components: {
        name: string;
        kind: string;
        useWhen: string;
        props: Record<string, { type: string; required: boolean; description: string }>;
        example: string;
      }[];
      insight: Record<string, string>;
    };
    const names = catalog.components.map((component) => component.name);
    for (const name of ['Code', 'Terminal', 'Video', 'Download', 'AppFrame', 'Step', 'Notes']) {
      expect(names).toContain(name);
    }

    expect(names).not.toContain('BarChart');
    const download = catalog.components.find((component) => component.name === 'Download');
    expect(download?.props['file']?.required).toBe(true);
    expect(download?.props['href']).toBeUndefined();
    expect(catalog.insight['props']).toContain('did you mean `file`');
  }),
);

it.effect('deckster components lists each component with its props in plain text', () =>
  Effect.gen(function* () {
    const { code, output } = yield* runCaptured(['components']);
    expect(code).toBe(0);
    expect(output).toContain('<Terminal>  code');
    expect(output).toContain('Props: ');
  }),
);
