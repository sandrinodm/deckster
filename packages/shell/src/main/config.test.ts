import { describe, expect, it } from 'vite-plus/test';

import { readConfig, readTestOptions } from '#main/config.ts';
import { buildMenuTemplate, type MenuActions } from '#main/menu.ts';

const NOOP = () => undefined;
const ACTIONS: MenuActions = {
  toggleFullscreen: NOOP,
  openPresenter: NOOP,
  moveToNextDisplay: NOOP,
  reload: NOOP,
  toggleDevTools: NOOP,
  quit: NOOP,
};

describe('the shell configuration', () => {
  it('reads the URL, title and colour, with defaults', () => {
    const config = readConfig({
      DECK_SHELL_CONFIG: JSON.stringify({
        url: 'http://127.0.0.1:5173/',
        backgroundColor: '#112233',
      }),
    });
    expect(config).toEqual({
      url: 'http://127.0.0.1:5173/',
      title: 'Deck',
      backgroundColor: '#112233',
      stateKey: 'deck',
      watchParent: true,
      listOnly: false,
    });
  });

  it('starts without a deck: the URL is optional, the other defaults stay', () => {
    expect(readConfig({ DECK_SHELL_CONFIG: JSON.stringify({ stateKey: 'hello' }) })).toEqual({
      title: 'Deck',
      backgroundColor: '#000000',
      stateKey: 'hello',
      watchParent: true,
      listOnly: false,
    });
  });

  it('still validates a URL when one is given', () => {
    expect(() => readConfig({ DECK_SHELL_CONFIG: '{"url":3}' })).toThrow('must be a URL');
    expect(() => readConfig({ DECK_SHELL_CONFIG: '{"url":"https://example.com/"}' })).toThrow(
      'loopback',
    );
  });

  it('accepts a plan and turns parent watching off', () => {
    const config = readConfig({
      DECK_SHELL_CONFIG: JSON.stringify({
        url: 'http://127.0.0.1:5173/',
        watchParent: false,
        plan: { audience: { displayId: 1, fullscreen: false }, kiosk: false },
      }),
    });
    expect(config.watchParent).toBe(false);
    expect(config.plan?.audience.displayId).toBe(1);
  });

  it('rejects missing, malformed and invalid configuration', () => {
    expect(() => readConfig({})).toThrow('DECK_SHELL_CONFIG is not set');
    expect(() => readConfig({ DECK_SHELL_CONFIG: '{"url":"nope"}' })).toThrow('must be a URL');
    expect(() => readConfig({ DECK_SHELL_CONFIG: '[]' })).toThrow('JSON object');
    expect(() =>
      readConfig({ DECK_SHELL_CONFIG: '{"url":"http://127.0.0.1/","plan":{"kiosk":1}}' }),
    ).toThrow('valid window plan');
  });

  it('takes only an http(s) URL on a loopback host', () => {
    /**
     * Reads a configuration with the given URL.
     */
    const read = (url: string) => readConfig({ DECK_SHELL_CONFIG: JSON.stringify({ url }) });
    for (const url of [
      'http://127.0.0.1:5173/',
      'http://localhost:5173/',
      'https://localhost/',
      'http://[::1]:5173/',
      'http://127.0.0.2/',
    ]) {
      expect(read(url).url).toBe(url);
    }

    for (const url of [
      'file:///etc/passwd',
      'data:text/html,hi',
      'about:blank',
      'https://example.com/',
      'http://192.168.1.10:5173/',
      'http://0.0.0.0:5173/',
      'http://127.0.0.1.example.com/',
      'http://localhost.example.com/',
      'ftp://127.0.0.1/',
    ]) {
      expect(() => read(url), url).toThrow('loopback');
    }
  });

  it('reads the profile folder and the agent code', () => {
    const config = readConfig({
      DECK_SHELL_CONFIG: JSON.stringify({
        url: 'http://127.0.0.1:5173/',
        profileDir: '/work/.deck/shell/profile',
        agentCode: 'abcDEF0123456789_-xyz',
      }),
    });
    expect(config.profileDir).toBe('/work/.deck/shell/profile');
    expect(config.agentCode).toBe('abcDEF0123456789_-xyz');
  });

  it('rejects an agent code without a URL', () => {
    expect(() =>
      readConfig({ DECK_SHELL_CONFIG: JSON.stringify({ agentCode: 'abcDEF0123456789_-xyz' }) }),
    ).toThrow('agentCode needs DECK_SHELL_CONFIG.url');
  });

  it('rejects a relative profile folder and a malformed agent code', () => {
    /**
     * Reads a configuration with extra fields.
     */
    const read = (extra: Record<string, unknown>) =>
      readConfig({
        DECK_SHELL_CONFIG: JSON.stringify({ url: 'http://127.0.0.1:5173/', ...extra }),
      });
    expect(() => read({ profileDir: 'relative/profile' })).toThrow('absolute path');
    expect(() => read({ profileDir: 3 })).toThrow('absolute path');
    expect(() => read({ agentCode: 'short' })).toThrow('URL-safe');
    expect(() => read({ agentCode: 'a'.repeat(129) })).toThrow('URL-safe');
    expect(() => read({ agentCode: 'abcdefgh ijklmnopq' })).toThrow('URL-safe');
    expect(() => read({ agentCode: 'abcdefgh\nX-Other: 1' })).toThrow('URL-safe');
    expect(() => read({ agentCode: 1234567890123456 })).toThrow('URL-safe');
  });

  it('reads the test options from the environment', () => {
    expect(readTestOptions({})).toEqual({ hidden: false, corner: false });
    expect(
      readTestOptions({
        DECK_SHELL_TEST_HIDDEN: '1',
        DECK_SHELL_TEST_CORNER: '1',
        DECK_SHELL_TEST_CAPTURE: '/tmp/a.png',
      }),
    ).toEqual({ hidden: true, corner: true, capture: '/tmp/a.png' });
  });
});

describe('the menu', () => {
  it('has no menu in kiosk mode', () => {
    expect(buildMenuTemplate(ACTIONS, 'darwin', 'Deck', true)).toBeUndefined();
  });

  it('has an application menu on macOS and a quit entry in File elsewhere', () => {
    const mac = buildMenuTemplate(ACTIONS, 'darwin', 'Deck', false);
    expect(mac?.[0]?.label).toBe('Deck');
    const linux = buildMenuTemplate(ACTIONS, 'linux', 'Deck', false);
    expect(linux?.[0]?.label).toBe('File');
    expect(JSON.stringify(linux?.map((item) => item.label))).toContain('Present');
  });
});
