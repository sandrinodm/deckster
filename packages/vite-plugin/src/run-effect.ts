import type { Effect, FileSystem } from 'effect';

import { NodeFileSystem } from '@effect/platform-node';
import { ManagedRuntime } from 'effect';

/**
 * Runs an effect that needs the file system and resolves to its value. A failure rejects with the
 * error itself, such as a `DeckBuildError`, so Vite reports it as a plugin error and its overlay
 * links to the file.
 */
export type RunEffect = <A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) => Promise<A>;

/**
 * The adapter between Vite's promise-based plugin hooks and the plugin's effects: one runtime with
 * Node's file system, built when the plugin is created.
 */
export function makeRunEffect(): RunEffect {
  const runtime = ManagedRuntime.make(NodeFileSystem.layer);
  return (effect) => runtime.runPromise(effect);
}
