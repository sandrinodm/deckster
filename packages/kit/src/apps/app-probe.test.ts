import { describe, expect, it } from 'vite-plus/test';

import { probeTarget } from '#apps/app-probe.ts';
import { resolveAppTarget } from '#apps/app-target.ts';

/**
 * The deck's page, which targets resolve against.
 */
const BASE = 'http://deck.test/talk/';

/**
 * A fetch that answers every request with a status.
 *
 * @param status - The HTTP status.
 */
function answering(status: number): typeof fetch {
  return async () => new Response('', { status });
}

/**
 * A fetch that fails like an unreachable host.
 */
const unreachable: typeof fetch = async () => {
  throw new TypeError('Failed to fetch');
};

describe('probeTarget', () => {
  const bundled = resolveAppTarget({ app: 'agent-demo', src: undefined, base: BASE });
  const external = resolveAppTarget({ app: undefined, src: 'https://example.com/', base: BASE });

  it('finds an app the deck does not have from the 404, and the deck page never loads', async () => {
    expect(await probeTarget({ target: bundled, bundledApp: true, fetcher: answering(404) })).toBe(
      'missing',
    );
    expect(await probeTarget({ target: bundled, bundledApp: true, fetcher: answering(200) })).toBe(
      'ok',
    );
  });

  it('does not call a bundled app missing when the fetch itself fails (a file:// deck)', async () => {
    expect(await probeTarget({ target: bundled, bundledApp: true, fetcher: unreachable })).toBe(
      'ok',
    );
  });

  it('counts an external host that fails or does not answer in time as unreachable', async () => {
    expect(await probeTarget({ target: external, bundledApp: false, fetcher: unreachable })).toBe(
      'unreachable',
    );
    /**
     * A fetch that never answers until it is aborted.
     */
    const silent: typeof fetch = (_, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted')));
      });
    expect(
      await probeTarget({ target: external, bundledApp: false, fetcher: silent, timeoutMs: 10 }),
    ).toBe('unreachable');
    expect(
      await probeTarget({ target: external, bundledApp: false, fetcher: answering(200) }),
    ).toBe('ok');
  });
});
