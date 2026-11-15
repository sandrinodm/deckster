import type { FeedbackDeck } from '@deckster/comments/node';
import type { FileSystem } from 'effect';

import { findDeck, loadDeck, type DeckBuildError } from '@deckster/vite-plugin';
import { Effect } from 'effect';

import { Workspace } from '#workspace.ts';

/**
 * Loads a deck for the comment store: its folder and the slides its config lists, in order.
 *
 * @param deck - The deck folder name.
 * @throws DeckBuildError in the error channel for a deck that does not exist or whose config does
 *   not load.
 */
export const loadCommentDeck = Effect.fn('loadCommentDeck')(function* (
  deck: string,
): Effect.fn.Return<FeedbackDeck, DeckBuildError, Workspace | FileSystem.FileSystem> {
  const { root } = yield* Workspace;
  const location = yield* findDeck(root, deck);
  const loaded = yield* loadDeck(root, location);
  return {
    id: location.id,
    dir: location.dir,
    slides: loaded.slides.map((slide) => ({ id: slide.id, file: slide.file })),
  };
});
