import { describe, expect, it } from 'vite-plus/test';

import {
  clearSession,
  FRAME_SANDBOX,
  frameSandboxHeaders,
  freshPartition,
  installFrameSandbox,
  type HeadersSessionLike,
} from '#main/deck-session.ts';

const ORIGIN = 'http://127.0.0.1:5173';

describe('the session of a run', () => {
  it('is a fresh in-memory partition each time', () => {
    const first = freshPartition();
    const second = freshPartition();
    expect(first).toMatch(/^deck-[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
    expect(first.startsWith('persist:')).toBe(false);
  });
});

describe('the sandbox of frames from other origins', () => {
  it('adds a CSP sandbox without popups, modals or top navigation to a foreign frame', () => {
    const headers = frameSandboxHeaders(
      { url: 'https://evil.example/app.html', responseHeaders: { 'Content-Type': ['text/html'] } },
      ORIGIN,
    );
    expect(headers?.['Content-Type']).toEqual(['text/html']);
    expect(headers?.['Content-Security-Policy']).toEqual([`sandbox ${FRAME_SANDBOX}`]);
    expect(FRAME_SANDBOX).not.toMatch(/allow-popups|allow-modals|allow-top-navigation/);
  });

  it("keeps the page's own policy next to the sandbox, whatever case its header has", () => {
    const headers = frameSandboxHeaders(
      {
        url: 'https://evil.example/',
        responseHeaders: { 'content-security-policy': ["default-src 'self'"] },
      },
      ORIGIN,
    );
    expect(headers?.['content-security-policy']).toEqual([
      "default-src 'self'",
      `sandbox ${FRAME_SANDBOX}`,
    ]);
    expect(Object.keys(headers ?? {})).toHaveLength(1);
  });

  it("leaves the deck server's own frames alone", () => {
    expect(frameSandboxHeaders({ url: `${ORIGIN}/apps/counter/` }, ORIGIN)).toBeUndefined();
  });

  it('installs the rule for sub-frame responses only', () => {
    let filter: unknown;
    let listener:
      | ((
          details: { url: string; responseHeaders?: Record<string, string[]> },
          callback: (response: { responseHeaders?: Record<string, string[]> }) => void,
        ) => void)
      | undefined;
    const session: HeadersSessionLike = {
      webRequest: {
        onHeadersReceived: (givenFilter, givenListener) => {
          filter = givenFilter;
          listener = givenListener;
        },
      },
    };
    installFrameSandbox(session, ORIGIN);
    expect(filter).toEqual({ urls: ['<all_urls>'], types: ['subFrame'] });
    const responses: unknown[] = [];
    listener?.({ url: 'https://evil.example/' }, (response) => responses.push(response));
    listener?.({ url: `${ORIGIN}/apps/x/`, responseHeaders: { A: ['1'] } }, (response) =>
      responses.push(response),
    );
    expect(responses).toEqual([
      { responseHeaders: { 'Content-Security-Policy': [`sandbox ${FRAME_SANDBOX}`] } },
      {},
    ]);
  });
});

describe('clearing a session', () => {
  it('clears it, and survives a session that fails to clear', async () => {
    let cleared = 0;
    await clearSession({ clearStorageData: async () => void (cleared += 1) });
    expect(cleared).toBe(1);
    await expect(
      clearSession({ clearStorageData: () => Promise.reject(new Error('busy')) }),
    ).resolves.toBeUndefined();
  });
});
