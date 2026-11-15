import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { ShellConfig } from '#main/config.ts';
import type { DisplayLike } from '#main/displays.ts';
import type { ShellEvent, ShellPlan } from '#protocol/shell-messages.ts';

/**
 * What the fake Electron records; shared with the mocked module, which `vi.mock` hoists.
 */
const electron = vi.hoisted(() => {
  /**
   * One `loadURL` call.
   */
  type Load = { url: string; options: unknown };

  /**
   * What the window-open handler is called with.
   */
  type OpenDetails = {
    url: string;
    frameName: string;
    referrer: { url: string; policy: string };
  };

  /**
   * A listener of any event.
   */
  type Listener = (...args: never[]) => unknown;

  /**
   * Fake web contents: they keep listeners and the window-open handler and answer the shell's
   * `window.__deck` probes at once.
   */
  class FakeContents {
    listeners = new Map<string, Listener[]>();
    openHandler: ((details: OpenDetails) => unknown) | undefined;
    url = '';
    on(event: string, listener: Listener): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
      return this;
    }
    setWindowOpenHandler(handler: (details: OpenDetails) => unknown): void {
      this.openHandler = handler;
    }
    executeJavaScript(): Promise<boolean> {
      return Promise.resolve(true);
    }
    getURL(): string {
      return this.url;
    }
    getTitle(): string {
      return 'Deck';
    }
    isDestroyed(): boolean {
      return false;
    }
    send(): void {}
  }

  /**
   * A fake `BrowserWindow` that records its loads.
   */
  class FakeWindow {
    static created: FakeWindow[] = [];
    static deferLoads = false;
    static pending: Array<() => void> = [];
    static getFocusedWindow(): null {
      return null;
    }
    loads: Load[] = [];
    title = '';
    webContents = new FakeContents();
    options: unknown;
    constructor(options: unknown) {
      this.options = options;
      FakeWindow.created.push(this);
    }
    on(): this {
      return this;
    }
    once(): this {
      return this;
    }
    loadURL(url: string, options?: unknown): Promise<void> {
      this.loads.push({ url, options });
      if (!FakeWindow.deferLoads) {
        this.webContents.url = url;
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        FakeWindow.pending.push(() => {
          this.webContents.url = url;
          resolve();
        });
      });
    }
    getBounds() {
      return { x: 0, y: 0, width: 1920, height: 1080 };
    }
    isDestroyed(): boolean {
      return false;
    }
    isSimpleFullScreen(): boolean {
      return false;
    }
    isFullScreen(): boolean {
      return false;
    }
    destroy(): void {}
    focus(): void {}
    setBounds(): void {}
    setTitle(title: string): void {
      this.title = title;
    }
  }

  return { FakeWindow, opened: [] as string[] };
});

vi.mock('electron', () => ({
  BrowserWindow: electron.FakeWindow,
  shell: {
    openExternal: async (url: string) => {
      electron.opened.push(url);
    },
  },
}));

const { createWindowManager } = await import('#main/windows.ts');

const ORIGIN = 'http://127.0.0.1:5173';
const CODE = 'abcdefghijklmnop0123';
const NO_REFERRER = { url: '', policy: 'no-referrer' };
const PARTITION = 'deck-0123456789abcdef0123456789abcdef';

const DISPLAY: DisplayLike = {
  id: 1,
  label: 'Display 1',
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 2,
};

const AUDIENCE_ONLY: ShellPlan = { audience: { displayId: 1, fullscreen: false }, kiosk: false };

const PLAN: ShellPlan = { ...AUDIENCE_ONLY, presenter: { displayId: 1 } };

/**
 * A window manager over the fake Electron, hidden, with the given configuration.
 *
 * @param extra - Configuration fields to add.
 */
function manager(extra: Partial<ShellConfig> = {}, setTarget = true) {
  const events: ShellEvent[] = [];
  const reports: string[] = [];
  const quits: number[] = [];
  const windows = createWindowManager({
    config: {
      title: 'Deck',
      backgroundColor: '#000000',
      stateKey: 'deck',
      watchParent: false,
      listOnly: false,
      ...extra,
    },
    test: { hidden: true, corner: false },
    screen: {
      getAllDisplays: () => [DISPLAY],
      getPrimaryDisplay: () => DISPLAY,
      getDisplayMatching: () => DISPLAY,
    },
    preloadPath: '/preload.cjs',
    send: (event) => events.push(event),
    power: { update: () => undefined, release: () => undefined },
    quit: () => quits.push(Date.now()),
    platform: 'darwin',
    report: (message) => reports.push(message),
  });
  if (setTarget) {
    windows.setTarget({
      url: extra.url ?? `${ORIGIN}/`,
      title: extra.title ?? 'Deck',
      backgroundColor: extra.backgroundColor ?? '#000000',
      partition: PARTITION,
      ...(extra.agentCode === undefined ? {} : { agentCode: extra.agentCode }),
    });
  }

  return { windows, events, reports, quits };
}

beforeEach(() => {
  electron.FakeWindow.created = [];
  electron.FakeWindow.deferLoads = false;
  electron.FakeWindow.pending = [];
  electron.opened.length = 0;
});

/**
 * Calls every listener a fake window's contents registered for an event.
 *
 * @param win - The fake window.
 * @param event - The event name.
 * @param args - The listener's arguments.
 */
function fire(
  win: InstanceType<typeof electron.FakeWindow> | undefined,
  event: string,
  ...args: unknown[]
): void {
  for (const listener of win?.webContents.listeners.get(event) ?? []) {
    (listener as (...values: unknown[]) => void)(...args);
  }
}

/**
 * The web preferences a fake window was created with.
 *
 * @param options - The window's constructor options.
 */
function preferences(options: unknown): Record<string, unknown> {
  return (options as { webPreferences?: Record<string, unknown> }).webPreferences ?? {};
}

describe('the agent code on the audience window', () => {
  it('goes with the first audience load only, never with the presenter window or a later load', async () => {
    const { windows } = manager({ agentCode: CODE });
    await windows.open(PLAN);
    const [audience, presenter] = electron.FakeWindow.created;
    expect(audience?.loads).toEqual([
      { url: `${ORIGIN}/`, options: { extraHeaders: `X-Deck-Agent-Code: ${CODE}\n` } },
    ]);
    expect(presenter?.loads).toHaveLength(1);
    expect(presenter?.loads[0]?.url).toContain('?presenter');
    expect(presenter?.loads[0]?.options).toBeUndefined();
    expect(JSON.stringify(presenter?.loads)).not.toContain(CODE);

    expect(JSON.stringify(electron.FakeWindow.created.map((win) => win.loads))).not.toContain(
      `?${CODE}`,
    );
  });

  it('sends no header without a code', async () => {
    const { windows } = manager();
    await windows.open(AUDIENCE_ONLY);
    expect(electron.FakeWindow.created[0]?.loads).toEqual([
      { url: `${ORIGIN}/`, options: undefined },
    ]);
  });
});

describe('navigation in the shell windows', () => {
  it('guards redirects and frames, and rate-limits links to the browser', async () => {
    const { windows, reports } = manager();
    await windows.open(AUDIENCE_ONLY);
    const contents = electron.FakeWindow.created[0]?.webContents;
    /**
     * Fires a navigation event on the audience window and says whether it was stopped.
     */
    const fire = (event: string, url: string, isMainFrame: boolean): boolean => {
      let prevented = false;
      for (const listener of contents?.listeners.get(event) ?? []) {
        (listener as (details: unknown) => void)({
          url,
          isMainFrame,
          preventDefault: () => (prevented = true),
        });
      }

      return prevented;
    };
    expect(fire('will-redirect', 'https://evil.example/', true)).toBe(true);
    expect(fire('will-frame-navigate', 'file:///etc/passwd', false)).toBe(true);
    expect(fire('will-frame-navigate', `${ORIGIN}/apps/counter/`, false)).toBe(false);
    for (let index = 0; index < 20; index += 1) {
      expect(
        contents?.openHandler?.({
          url: `https://example.com/${index}`,
          frameName: '',
          referrer: NO_REFERRER,
        }),
      ).toEqual({ action: 'deny' });
    }

    expect(electron.opened).toHaveLength(3);
    expect(electron.opened[0]).toBe('https://evil.example/');
    expect(reports.some((message) => message.includes('dropped'))).toBe(true);
  });
});

describe('the shell windows against a hostile deck', () => {
  it('puts every window, the presenter popup included, in the partition the target names', async () => {
    const { windows } = manager();
    await windows.open(AUDIENCE_ONLY);
    const popup = electron.FakeWindow.created[0]?.webContents.openHandler?.({
      url: `${ORIGIN}/?presenter`,
      frameName: 'deck-presenter',
      referrer: { url: `${ORIGIN}/`, policy: 'default' },
    }) as { action: string; overrideBrowserWindowOptions?: unknown } | undefined;
    expect(popup?.action).toBe('allow');
    windows.openPresenter();
    const [audience, presenter] = electron.FakeWindow.created;
    for (const options of [
      audience?.options,
      presenter?.options,
      popup?.overrideBrowserWindowOptions,
    ]) {
      expect(preferences(options)['partition']).toBe(PARTITION);
      expect(preferences(options)['session']).toBeUndefined();
    }
  });

  it('turns off native dialogs in every window and never lets beforeunload keep one open', async () => {
    const { windows } = manager();
    await windows.open(PLAN);
    for (const win of electron.FakeWindow.created) {
      expect(preferences(win.options)['disableDialogs']).toBe(true);
      let ignored = false;
      fire(win, 'will-prevent-unload', { preventDefault: () => (ignored = true) });
      expect(ignored).toBe(true);
    }
  });

  it('refuses a window.open that a frame of another origin started', async () => {
    const { windows, reports } = manager();
    await windows.open(AUDIENCE_ONLY);
    const contents = electron.FakeWindow.created[0]?.webContents;
    for (const referrer of ['https://evil.example/frame.html', 'null', 'about:srcdoc']) {
      expect(
        contents?.openHandler?.({
          url: 'https://phish.example/',
          frameName: '',
          referrer: { url: referrer, policy: 'default' },
        }),
      ).toEqual({ action: 'deny' });
    }

    expect(electron.opened).toEqual([]);
    expect(reports.some((message) => message.includes('frame'))).toBe(true);
    contents?.openHandler?.({
      url: 'https://example.com/',
      frameName: '',
      referrer: { url: `${ORIGIN}/#/3`, policy: 'strict-origin-when-cross-origin' },
    });
    contents?.openHandler?.({
      url: 'https://example.com/2',
      frameName: '',
      referrer: { url: '', policy: 'no-referrer' },
    });
    expect(electron.opened).toEqual(['https://example.com/', 'https://example.com/2']);
  });

  it('counts links to the browser across every window', async () => {
    const { windows } = manager();
    await windows.open(PLAN);
    const [audience, presenter] = electron.FakeWindow.created;
    for (let index = 0; index < 3; index += 1) {
      audience?.webContents.openHandler?.({
        url: `https://example.com/${index}`,
        frameName: '',
        referrer: NO_REFERRER,
      });
    }

    presenter?.webContents.openHandler?.({
      url: 'https://example.com/presenter',
      frameName: '',
      referrer: NO_REFERRER,
    });
    expect(electron.opened).toHaveLength(3);
  });

  it('ignores auto-repeated Cmd+Q in kiosk mode', async () => {
    const { windows, quits } = manager();
    await windows.open({ ...AUDIENCE_ONLY, kiosk: true });
    const audience = electron.FakeWindow.created[0];
    /**
     * Presses Cmd+Q on the audience window.
     */
    const press = (isAutoRepeat: boolean): void =>
      fire(
        audience,
        'before-input-event',
        { preventDefault: () => undefined },
        {
          type: 'keyDown',
          key: 'q',
          meta: true,
          control: false,
          isAutoRepeat,
        },
      );
    press(false);
    press(true);
    press(true);
    expect(quits).toHaveLength(0);
    press(false);
    expect(quits).toHaveLength(1);
  });

  it('refuses a second open instead of losing track of the first audience window', async () => {
    const { windows } = manager();
    await windows.open(AUDIENCE_ONLY);
    const first = electron.FakeWindow.created[0];
    await expect(windows.open(AUDIENCE_ONLY)).rejects.toThrow('already open');
    expect(electron.FakeWindow.created).toHaveLength(1);
    expect(windows.audience()).toBe(first);
  });

  it('queues a presenter request until the audience page has a URL', async () => {
    electron.FakeWindow.deferLoads = true;
    const { windows, events } = manager();
    const opening = windows.open(AUDIENCE_ONLY);
    expect(() => windows.openPresenter()).not.toThrow();
    expect(electron.FakeWindow.created).toHaveLength(1);
    for (const resolve of electron.FakeWindow.pending.splice(0)) {
      resolve();
    }

    await opening;
    for (const resolve of electron.FakeWindow.pending.splice(0)) {
      resolve();
    }

    expect(electron.FakeWindow.created).toHaveLength(2);
    expect(electron.FakeWindow.created[1]?.loads[0]?.url).toBe(`${ORIGIN}/?presenter`);
    expect(events.some((event) => event.type === 'window-opened')).toBe(true);
  });

  it('finds each window by its role', async () => {
    const { windows } = manager();
    await windows.open(PLAN);
    const [audience, presenter] = electron.FakeWindow.created;
    expect(windows.window('audience')).toBe(audience);
    expect(windows.window('presenter')).toBe(presenter);
  });

  it('titles each window itself, after the product and the deck', async () => {
    const { windows } = manager();
    await windows.open(PLAN);
    const [audience, presenter] = electron.FakeWindow.created;
    expect(audience?.title).toBe('Deckster: Deck');
    expect(presenter?.title).toBe('Deckster: Deck · Presenter');
  });
});

describe('a target given after the window manager exists', () => {
  it('refuses to open before it has a target', async () => {
    const { windows } = manager({}, false);
    expect(windows.hasTarget()).toBe(false);
    await expect(windows.open(AUDIENCE_ONLY)).rejects.toThrow('No deck is set');
    expect(electron.FakeWindow.created).toHaveLength(0);
  });

  it('opens the deck it was given, with its title, colour, partition and agent code', async () => {
    const { windows } = manager({}, false);
    windows.setTarget({
      url: 'http://127.0.0.1:5391/deck/',
      title: 'Late',
      backgroundColor: '#112233',
      partition: 'deck-late-target',
      agentCode: CODE,
    });
    expect(windows.hasTarget()).toBe(true);
    await windows.open(PLAN);
    const [audience, presenter] = electron.FakeWindow.created;
    expect(audience?.loads).toEqual([
      {
        url: 'http://127.0.0.1:5391/deck/',
        options: { extraHeaders: `X-Deck-Agent-Code: ${CODE}\n` },
      },
    ]);
    expect(audience?.title).toBe('Deckster: Late');
    expect(presenter?.title).toBe('Deckster: Late · Presenter');
    expect((audience?.options as { backgroundColor?: string } | undefined)?.backgroundColor).toBe(
      '#112233',
    );
    expect(preferences(audience?.options)['partition']).toBe('deck-late-target');
    expect(preferences(presenter?.options)['partition']).toBe('deck-late-target');
    expect(presenter?.loads[0]?.url).toBe('http://127.0.0.1:5391/deck/?presenter');
  });

  it('keeps the navigation guard on the late origin', async () => {
    const { windows } = manager({}, false);
    windows.setTarget({
      url: 'http://127.0.0.1:5391/',
      title: 'Late',
      backgroundColor: '#000000',
      partition: PARTITION,
    });
    await windows.open(AUDIENCE_ONLY);
    const contents = electron.FakeWindow.created[0]?.webContents;
    let prevented = 0;
    for (const listener of contents?.listeners.get('will-redirect') ?? []) {
      (listener as (details: unknown) => void)({
        url: `${ORIGIN}/`,
        isMainFrame: true,
        preventDefault: () => (prevented += 1),
      });
    }

    expect(prevented).toBe(1);
  });

  it('refuses a second target', () => {
    const { windows } = manager();
    expect(() =>
      windows.setTarget({
        url: 'http://127.0.0.1:5399/',
        title: 'x',
        backgroundColor: '#000',
        partition: PARTITION,
      }),
    ).toThrow('already set');
  });
});
