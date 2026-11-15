import { useDeck, type DeckControls } from '@deckster/engine';
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';

import {
  channelName,
  createPositionSync,
  parseSyncMessage,
  type SyncMessage,
} from '#sync/sync-protocol.ts';
import { uiState, updateUi, useUiState, type BlackoutMode, type LaserPoint } from '#ui/ui-state.ts';
import { windowKind } from '#ui/window-kind.ts';

/**
 * How long the presenter window waits after the audience window says `bye` for one to say `hello`
 * again (a reload) before it closes itself, in milliseconds.
 */
export const AUDIENCE_GONE_MS = 2000;

/**
 * How long the presenter window keeps waiting for a reloading audience window while it still has an
 * opener that is open, in milliseconds. A slow dev server can take longer than
 * {@link AUDIENCE_GONE_MS} to serve the page again; a window that is really gone has a closed
 * opener and is not waited for.
 */
export const AUDIENCE_RELOAD_MS = 60_000;

/**
 * Keeps the audience and presenter windows together over `BroadcastChannel`: navigating in either
 * moves the other, a blackout set in either covers the audience window, and the presenter window's
 * laser point shows on the audience screen. When the audience window closes, the presenter window
 * closes too; a reload of the audience window does not close it, however long the reload takes, as
 * long as the window that opened the presenter is still open (up to {@link AUDIENCE_RELOAD_MS}); a
 * presenter window the browser will not let a script close says the audience window is gone
 * instead. It renders nothing.
 */
export function SyncBridge(): ReactNode {
  const deck = useDeck();
  const { blackout, laserPoint } = useUiState();
  const [windowId] = useState(createWindowId);
  const [role] = useState(() => windowKind());
  const [positionSync] = useState(createPositionSync);
  const channel = useRef<BroadcastChannel | undefined>(undefined);
  const sentBlackout = useRef<BlackoutMode | undefined>(undefined);
  const sentLaser = useRef<LaserPoint | undefined>(undefined);
  const closing = useRef<number | undefined>(undefined);
  const latest = useEffectEvent((): DeckControls => deck);

  /**
   * Posts a message to the other windows, naming this one as the sender.
   */
  const post = useEffectEvent((message: DistributiveOmit<SyncMessage, 'from' | 'role'>) => {
    channel.current?.postMessage({ ...message, from: windowId, role });
  });

  const receive = useEffectEvent((message: SyncMessage) => {
    const controls = latest();
    if (message.role === 'audience' && message.kind !== 'bye') {
      window.clearTimeout(closing.current);
      closing.current = undefined;
      if (uiState.get().audienceGone) {
        updateUi({ audienceGone: false });
      }
    }

    switch (message.kind) {
      case 'hello':
        post({ kind: 'position', ...controls.position });
        post({ kind: 'blackout', mode: uiState.get().blackout ?? null });
        return;
      case 'bye':
        if (role === 'presenter' && message.role === 'audience') {
          window.clearTimeout(closing.current);
          closing.current = window.setTimeout(
            () => closeAfterAudience(closing, Date.now()),
            AUDIENCE_GONE_MS,
          );
          post({ kind: 'hello' });
        }

        return;
      case 'position': {
        const target = positionSync.remote(
          { slide: message.slide, step: message.step },
          controls.position,
        );
        if (target !== undefined) {
          moveTo(controls, target.slide, target.step);
        }

        return;
      }

      case 'blackout':
        sentBlackout.current = message.mode ?? undefined;
        updateUi({ blackout: message.mode ?? undefined });
        return;
      case 'laser':
        updateUi({ remoteLaser: message.point ?? undefined });
        return;
    }
  });

  useEffect(() => {
    const opened = new BroadcastChannel(channelName(deck.manifest.id));
    channel.current = opened;
    opened.onmessage = (event: MessageEvent) => {
      const message = parseSyncMessage(event.data);
      if (message !== undefined && message.from !== windowId) {
        receive(message);
      }
    };
    sentBlackout.current = uiState.get().blackout;
    post({ kind: 'hello' });
    /**
     * Tells the other windows this page is going away.
     */
    const onPageHide = () => post({ kind: 'bye' });
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.clearTimeout(closing.current);
      opened.close();
      channel.current = undefined;
    };
  }, [deck.manifest.id, windowId]);

  useEffect(() => {
    const move = positionSync.local(deck.position);
    if (move !== undefined) {
      post({ kind: 'position', slide: move.slide, step: move.step });
    }
  }, [deck.position, positionSync]);

  useEffect(() => {
    if (sentBlackout.current !== blackout) {
      sentBlackout.current = blackout;
      post({ kind: 'blackout', mode: blackout ?? null });
    }
  }, [blackout]);

  useEffect(() => {
    if (sentLaser.current !== laserPoint) {
      sentLaser.current = laserPoint;
      post({ kind: 'laser', point: laserPoint ?? null });
    }
  }, [laserPoint]);

  return null;
}

/**
 * `Omit` that keeps a union's members apart.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * Moves the deck to a position a peer sent. A slide that does not exist here, such as when the
 * windows run different versions of the deck, is ignored.
 *
 * @param deck - The deck's controls.
 * @param slide - The zero-based slide.
 * @param step - The step.
 */
function moveTo(deck: DeckControls, slide: number, step: number): void {
  if (slide >= deck.slides.length) {
    return;
  }

  deck.goto(slide, step);
}

/**
 * Closes the presenter window once its audience window is gone. While the window that opened this
 * one is still open the audience page may only be reloading, so the decision is put off, up to
 * {@link AUDIENCE_RELOAD_MS} after the `bye`; a `hello` in the meantime cancels it. A window the
 * user opened by hand cannot be closed by a script; it then shows that the audience window is
 * gone.
 *
 * @param timer - Holds the pending timeout, so a later `hello` can cancel it.
 * @param since - When the `bye` arrived, in milliseconds since the epoch.
 */
function closeAfterAudience(timer: { current: number | undefined }, since: number): void {
  if (openerIsOpen() && Date.now() - since < AUDIENCE_RELOAD_MS) {
    timer.current = window.setTimeout(() => closeAfterAudience(timer, since), AUDIENCE_GONE_MS);
    return;
  }

  updateUi({ audienceGone: true });
  window.close();
}

/**
 * Whether the window that opened this one still exists. Reading `closed` of a window of another
 * origin is allowed; a window that cannot be read counts as gone.
 */
function openerIsOpen(): boolean {
  try {
    const opener: Window | null = window.opener;
    return opener !== null && !opener.closed;
  } catch {
    return false;
  }
}

/**
 * A random id for this window, so it can ignore its own messages.
 */
function createWindowId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
