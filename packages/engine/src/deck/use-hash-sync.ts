import { useEffect, useState, type Dispatch } from 'react';

import { formatHash, parseHash } from '#navigation/hash.ts';
import {
  UNRESOLVED_LAST_STEP,
  type NavigationAction,
  type Position,
} from '#navigation/navigation.ts';

/**
 * Keeps `location.hash` and the deck position in step: the hash follows every move (replacing the
 * history entry, so Back leaves the deck), and editing the hash moves the deck. An edited hash that
 * names no slide (`#/99`, an empty hash) or a step past the slide's last is replaced with the
 * position the deck is on.
 *
 * @param position - The position on screen.
 * @param slideIds - Slide ids in deck order, for hashes that name a slide by id.
 * @param dispatch - The navigation dispatcher.
 */
export function useHashSync(
  position: Position,
  slideIds: readonly string[],
  dispatch: Dispatch<NavigationAction>,
): void {
  // Bumped on every hash edit, so the hash is rewritten even when the edit does not move the deck.
  const [hashEdits, setHashEdits] = useState(0);
  useEffect(() => {
    if (position.step === UNRESOLVED_LAST_STEP) {
      return;
    }

    const hash = formatHash(position);
    if (window.location.hash !== hash) {
      window.history.replaceState(window.history.state, '', hash);
    }
  }, [position, hashEdits]);

  useEffect(() => {
    /**
     * Moves the deck to the position an edited hash names, then has the hash rewritten to the
     * position the deck ends up on.
     */
    const onHashChange = () => {
      const target = parseHash(window.location.hash, slideIds);
      if (target !== undefined) {
        dispatch({ type: 'goto', position: target });
      }

      setHashEdits((edits) => edits + 1);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [slideIds, dispatch]);
}
