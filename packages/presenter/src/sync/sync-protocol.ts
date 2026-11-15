import type { Position } from '@deckster/engine';

import type { ShortcutWindow } from '#shortcuts/shortcut-registry.ts';
import type { BlackoutMode, LaserPoint } from '#ui/ui-state.ts';

/**
 * What the audience and presenter windows say to each other over `BroadcastChannel`. Every message
 * carries the id of the window that sent it, so a window can ignore its own, and which kind of
 * window that is. `bye` is sent when a window's page goes away (closed or reloaded).
 */
export type SyncMessage =
  | { kind: 'hello'; from: string; role: ShortcutWindow }
  | { kind: 'bye'; from: string; role: ShortcutWindow }
  | { kind: 'position'; from: string; role: ShortcutWindow; slide: number; step: number }
  | { kind: 'blackout'; from: string; role: ShortcutWindow; mode: BlackoutMode | null }
  | { kind: 'laser'; from: string; role: ShortcutWindow; point: LaserPoint | null };

/**
 * The channel name for a deck, so two decks open in one browser never move each other.
 *
 * @param deckId - The deck's folder name.
 */
export function channelName(deckId: string): string {
  return `deck-sync:${deckId}`;
}

/**
 * Reads a message from a channel, which may be anything another page posts.
 *
 * @param data - The `MessageEvent.data`.
 * @returns The message, or `undefined` when it is not one of ours.
 */
export function parseSyncMessage(data: unknown): SyncMessage | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }

  const kind: unknown = Reflect.get(data, 'kind');
  const from: unknown = Reflect.get(data, 'from');
  const role: unknown = Reflect.get(data, 'role');
  if (typeof from !== 'string' || from === '' || (role !== 'audience' && role !== 'presenter')) {
    return undefined;
  }

  switch (kind) {
    case 'hello':
    case 'bye':
      return { kind, from, role };
    case 'position': {
      const slide: unknown = Reflect.get(data, 'slide');
      const step: unknown = Reflect.get(data, 'step');
      const isPosition = isIndex(slide) && isIndex(step);
      return isPosition ? { kind, from, role, slide, step } : undefined;
    }

    case 'blackout': {
      const mode: unknown = Reflect.get(data, 'mode');
      return mode === 'black' || mode === 'white' || mode === null
        ? { kind, from, role, mode }
        : undefined;
    }

    case 'laser': {
      const point = parsePoint(Reflect.get(data, 'point'));
      return point === undefined ? undefined : { kind, from, role, point: point.value };
    }

    default:
      return undefined;
  }
}

/**
 * Remembers the last position the two windows agreed on, so a move one window makes is sent once
 * and a move it receives is not sent back.
 */
export type PositionSync = {
  /**
   * Called with the window's own position after every render.
   *
   * @returns The position to send, or `undefined` when it is the one already agreed on. The first
   *   call only records the position: a window that has just opened takes its peer's position
   *   instead of imposing its own.
   */
  local: (position: Position) => Position | undefined;

  /**
   * Called with a position a peer sent.
   *
   * @returns The position to move to, or `undefined` when the window is there already.
   */
  remote: (position: Position, current: Position) => Position | undefined;
};

/**
 * Creates the echo guard for one window. It remembers every position a peer sent that the window
 * has not shown yet, because a peer that moves several steps quickly sends several positions before
 * this window renders the first: the window then passes through positions it was sent, and none of
 * them may go back as if it were its own move.
 */
export function createPositionSync(): PositionSync {
  let agreed: Position | undefined;
  let received: Position[] = [];
  return {
    local: (position) => {
      const previous = agreed;
      agreed = position;
      const applied = received.findIndex((entry) => isSame(entry, position));
      if (applied !== -1) {
        received = received.slice(applied + 1);
        return undefined;
      }

      if (previous === undefined || isSame(previous, position)) {
        return undefined;
      }

      received = [];
      return position;
    },
    remote: (position, current) => {
      agreed = position;
      received = [...received, position];
      return isSame(position, current) ? undefined : position;
    },
  };
}

/**
 * Whether two positions are the same slide and step.
 *
 * @param a - A position.
 * @param b - Another position.
 */
function isSame(a: Position, b: Position): boolean {
  return a.slide === b.slide && a.step === b.step;
}

/**
 * Whether a value is a non-negative integer.
 *
 * @param value - Any value.
 */
function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Reads a laser point or `null`.
 *
 * @param value - Any value.
 * @returns `{ value }` with the point or `null`, or `undefined` when the value is neither.
 */
function parsePoint(value: unknown): { value: LaserPoint | null } | undefined {
  if (value === null) {
    return { value: null };
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  const x: unknown = Reflect.get(value, 'x');
  const y: unknown = Reflect.get(value, 'y');
  /**
   * Whether a value is a fraction of the slide.
   */
  const isFraction = (fraction: unknown): fraction is number =>
    typeof fraction === 'number' && fraction >= 0 && fraction <= 1;
  return isFraction(x) && isFraction(y) ? { value: { x, y } } : undefined;
}
