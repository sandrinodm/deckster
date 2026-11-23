import { describe, expect, it } from 'vite-plus/test';

import { appRequest, missingAppMessage } from '#apps/app-requests.ts';

describe('appRequest', () => {
  it('reads the app of a page request and of a file request', () => {
    expect(appRequest('/apps/agent-demo/')).toEqual({ name: 'agent-demo', page: true });
    expect(appRequest('/apps/agent-demo/index.html?x=1')).toEqual({
      name: 'agent-demo',
      page: true,
    });
    expect(appRequest('/apps/agent-demo/assets/main.js')).toEqual({
      name: 'agent-demo',
      page: false,
    });
    expect(appRequest('/apps/agent-demo')).toEqual({ name: 'agent-demo', page: false });
  });

  it('marks bad percent-encoding instead of throwing', () => {
    for (const url of ['/apps/%/', '/apps/%E0%A4%A/', '/apps/%zz/index.html']) {
      expect(() => appRequest(url), url).not.toThrow();
      expect(appRequest(url)?.malformed, url).toBe(true);
    }
  });

  it('ignores paths outside apps/', () => {
    expect(appRequest('/')).toBeUndefined();
    expect(appRequest('/assets/apps/x/')).toBeUndefined();
    expect(appRequest('/apps-list/')).toBeUndefined();
  });
});

describe('missingAppMessage', () => {
  it('lists the apps the deck has and how to create the missing one', () => {
    const message = missingAppMessage('demo', 'nope', ['agent-demo', 'counter']);
    expect(message).toContain('"nope"');
    expect(message).toContain('Apps: agent-demo, counter.');
    expect(message).toContain('pnpm deckster new app demo nope');
  });

  it('says so when the deck has none', () => {
    expect(missingAppMessage('demo', 'nope', [])).toContain('no apps yet');
  });
});
