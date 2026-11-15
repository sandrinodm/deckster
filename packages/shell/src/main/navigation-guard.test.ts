import { describe, expect, it } from 'vite-plus/test';

import {
  createExternalOpener,
  decideSubFrameNavigation,
  EXTERNAL_OPEN_LIMIT,
  EXTERNAL_OPEN_WINDOW_MS,
  installNavigationGuards,
  MAX_EXTERNAL_URL,
  type GuardedContents,
  type NavigationEventLike,
} from '#main/navigation-guard.ts';

const ORIGIN = 'http://127.0.0.1:5173';

/**
 * An external opener on a fake clock that records what it hands to the system.
 */
function opener() {
  const opened: string[] = [];
  const reports: string[] = [];
  let time = 1_000_000;
  const open = createExternalOpener({
    openExternal: async (url) => void opened.push(url),
    report: (message) => reports.push(message),
    now: () => time,
  });
  return {
    open,
    opened,
    reports,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

/**
 * Fake web contents that keep the guards' listeners, and a function that fires one.
 */
function contents() {
  const listeners = new Map<string, (details: NavigationEventLike) => void>();
  const target: GuardedContents = {
    on: (event: string, listener: (details: NavigationEventLike) => void) =>
      listeners.set(event, listener),
  };
  return {
    target,
    fire: (event: string, url: string, isMainFrame: boolean): boolean => {
      let prevented = false;
      listeners.get(event)?.({ url, isMainFrame, preventDefault: () => (prevented = true) });
      return prevented;
    },
  };
}

describe('opening links outside the app', () => {
  it('opens web and mail links only', () => {
    const { open, opened, reports } = opener();
    expect(open('https://example.com/')).toBe(true);
    expect(open('mailto:a@example.com')).toBe(true);
    expect(open('file:///etc/passwd')).toBe(false);
    expect(open('javascript:alert(1)')).toBe(false);
    expect(open('ms-settings:display')).toBe(false);
    expect(opened).toEqual(['https://example.com/', 'mailto:a@example.com']);
    expect(reports).toHaveLength(3);
  });

  it(`opens at most ${EXTERNAL_OPEN_LIMIT} links per shell in ${EXTERNAL_OPEN_WINDOW_MS} ms`, () => {
    const { open, opened, reports, advance } = opener();
    for (let index = 0; index < 50; index += 1) {
      open(`https://example.com/${index}`);
    }

    expect(opened).toHaveLength(EXTERNAL_OPEN_LIMIT);
    expect(reports).toHaveLength(50 - EXTERNAL_OPEN_LIMIT);
    expect(reports[0]).toContain('dropped');
    advance(EXTERNAL_OPEN_WINDOW_MS);
    expect(open('https://example.com/later')).toBe(true);
    expect(opened).toHaveLength(EXTERNAL_OPEN_LIMIT + 1);
  });

  it('hands the system the parsed URL, never the raw string', () => {
    const { open, opened } = opener();
    expect(open('ht\ttp://x.example/')).toBe(true);
    expect(open('  https://EXAMPLE.com/a b')).toBe(true);
    expect(open('\u0001https://example.com/c')).toBe(true);
    expect(opened).toEqual([
      'http://x.example/',
      'https://example.com/a%20b',
      'https://example.com/c',
    ]);
  });

  it('keeps only the subject and body of a mail link', () => {
    const { open, opened } = opener();
    expect(open('  mailto:a@b.c?attach=/etc/passwd')).toBe(true);
    expect(open('mailto:a@b.c?Subject=Hi there&body=a+b&attachment=x&cc=boss@corp.example')).toBe(
      true,
    );
    expect(opened).toEqual(['mailto:a@b.c', 'mailto:a@b.c?subject=Hi%20there&body=a%2Bb']);
  });

  it(`refuses links longer than ${MAX_EXTERNAL_URL} characters`, () => {
    const { open, opened, reports } = opener();
    expect(open(`https://example.com/${'a'.repeat(MAX_EXTERNAL_URL)}`)).toBe(false);
    expect(opened).toEqual([]);
    expect(reports[0]).toContain('longer than');
  });
});

describe('sub-frame navigation', () => {
  it('lets frames load the deck, web pages and blank documents', () => {
    expect(decideSubFrameNavigation(`${ORIGIN}/apps/counter/`, ORIGIN)).toBe('allow');
    expect(decideSubFrameNavigation('https://example.com/', ORIGIN)).toBe('allow');
    expect(decideSubFrameNavigation('about:blank', ORIGIN)).toBe('allow');
    expect(decideSubFrameNavigation('about:srcdoc', ORIGIN)).toBe('allow');
  });

  it('blocks every other scheme', () => {
    for (const url of [
      'file:///etc/passwd',
      'data:text/html,hi',
      'javascript:alert(1)',
      'ms-settings:display',
      'about:config',
      'not a url',
    ]) {
      expect(decideSubFrameNavigation(url, ORIGIN)).toBe('blocked');
    }
  });
});

describe('the navigation guards', () => {
  it('keeps the main frame on the deck server and sends links out once', () => {
    const { open, opened } = opener();
    const { target, fire } = contents();
    installNavigationGuards(target, ORIGIN, open);
    expect(fire('will-navigate', `${ORIGIN}/#/2/0`, true)).toBe(false);
    expect(fire('will-navigate', 'https://example.com/', true)).toBe(true);
    expect(fire('will-frame-navigate', 'https://example.com/', true)).toBe(false);
    expect(fire('will-navigate', 'file:///etc/passwd', true)).toBe(true);
    expect(opened).toEqual(['https://example.com/']);
  });

  it('stops a server redirect of the main frame to another origin', () => {
    const { open, opened } = opener();
    const { target, fire } = contents();
    installNavigationGuards(target, ORIGIN, open);
    expect(fire('will-redirect', `${ORIGIN}/decks/hello/`, true)).toBe(false);
    expect(fire('will-redirect', 'https://evil.example/', true)).toBe(true);
    expect(fire('will-redirect', 'file:///etc/passwd', true)).toBe(true);
    expect(opened).toEqual(['https://evil.example/']);
  });

  it('keeps sub-frames in their frame and never opens the browser for them', () => {
    const { open, opened } = opener();
    const { target, fire } = contents();
    installNavigationGuards(target, ORIGIN, open);
    expect(fire('will-frame-navigate', `${ORIGIN}/apps/counter/`, false)).toBe(false);
    expect(fire('will-frame-navigate', 'https://example.com/', false)).toBe(false);
    expect(fire('will-frame-navigate', 'file:///etc/passwd', false)).toBe(true);
    expect(fire('will-frame-navigate', 'data:text/html,x', false)).toBe(true);
    expect(fire('will-redirect', 'file:///etc/passwd', false)).toBe(true);
    expect(fire('will-redirect', 'https://example.com/next', false)).toBe(false);
    expect(opened).toEqual([]);
  });
});
