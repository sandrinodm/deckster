import { useReadyHold } from '@deckster/engine';
import { useEffect, useState } from 'react';

import type { AppTarget } from '#apps/app-target.ts';

/**
 * How long an external host gets to answer before the frame counts it as unreachable and plays the
 * recorded fallback, in milliseconds.
 */
export const PROBE_TIMEOUT_MS = 4000;

/**
 * The HTTP status of an app the deck does not have.
 */
const NOT_FOUND = 404;

/**
 * The element id of a deck page's root, which an app's page never has.
 */
export const DECK_ROOT_ID = 'deck-root';

/**
 * What probing a frame's address found: still asking, reachable, an app the deck does not have
 * (404), or a host that does not answer.
 */
export type ProbeResult = 'pending' | 'ok' | 'missing' | 'unreachable';

/**
 * What {@link probeTarget} asks.
 */
export type ProbeRequest = {
  /**
   * The frame's target.
   */
  target: AppTarget;

  /**
   * Whether the target is an app of the deck (`app="name"`), which the server answers 404 for when
   * the deck does not have it.
   */
  bundledApp: boolean;

  /**
   * The fetch to use; the page's by default.
   */
  fetcher?: typeof fetch;

  /**
   * How long an external host gets, in milliseconds.
   */
  timeoutMs?: number;
};

/**
 * Asks whether a frame's address will load before the frame mounts. An app of the deck is fetched
 * and a 404 means the deck has no such app (a page that would otherwise fall back to the deck's own
 * page). An external address is fetched opaquely (`no-cors`), so any answer counts; a network
 * failure or no answer within the timeout counts as unreachable. Other same-origin paths are not
 * probed.
 *
 * @param request - The target, its kind and the fetch.
 * @returns What the probe found; never `pending`.
 */
export async function probeTarget(request: ProbeRequest): Promise<ProbeResult> {
  const { target, bundledApp, fetcher = fetch, timeoutMs = PROBE_TIMEOUT_MS } = request;
  if (bundledApp) {
    try {
      const response = await fetcher(target.url, { cache: 'no-store' });
      return response.status === NOT_FOUND ? 'missing' : 'ok';
    } catch {
      return 'ok';
    }
  }

  if (target.kind !== 'external') {
    return 'ok';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetcher(target.url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    return 'ok';
  } catch {
    return 'unreachable';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probes a frame's address once per target, holding the slide's `ready()` until the answer, so
 * `deck shot` and `deck lint` see a missing app. Nothing is probed while `enabled` is false.
 *
 * @param target - The frame's target.
 * @param bundledApp - Whether it is an app of the deck.
 * @param enabled - Whether to probe at all.
 */
export function useProbe(target: AppTarget, bundledApp: boolean, enabled: boolean): ProbeResult {
  const [result, setResult] = useState<{ url: string; found: ProbeResult } | undefined>();
  const current = result?.url === target.url ? result.found : 'pending';
  useReadyHold(enabled && current === 'pending');
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let live = true;
    void probeTarget({ target, bundledApp }).then((found) => {
      if (live) {
        setResult({ url: target.url, found });
      }
    });
    return () => {
      live = false;
    };
  }, [target, bundledApp, enabled]);
  return enabled ? current : 'ok';
}

/**
 * Whether the network is up, following the browser's `online` and `offline` events.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    /**
     * The browser is back online.
     */
    const up = (): void => setOnline(true);
    /**
     * The browser went offline.
     */
    const down = (): void => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

/**
 * Whether this page is itself running inside a mini app's frame of a deck: then its own frames must
 * not load, or a deck that ended up in its own frame would nest itself again and again.
 *
 * @param scope - The window to ask about; the page's own by default.
 */
export function isInsideAppFrame(scope: Window = window): boolean {
  try {
    return scope.frameElement?.classList.contains('kit-app-iframe') === true;
  } catch {
    return false;
  }
}

/**
 * Whether a loaded frame shows a deck page (it has the deck's root element) instead of an app: what
 * a host that serves the deck for every unknown path does with a missing app. Frames on another
 * origin cannot be read and never count.
 *
 * @param frame - The frame, after its `load` event.
 */
export function showsDeckPage(frame: HTMLIFrameElement): boolean {
  try {
    return (frame.contentDocument?.getElementById(DECK_ROOT_ID) ?? null) !== null;
  } catch {
    return false;
  }
}
