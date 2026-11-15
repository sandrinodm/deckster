import type { ChildProcessSpawner } from 'effect/process';

import { NodeServices } from '@effect/platform-node';
import { ManagedRuntime, type Effect, type FileSystem, type Path } from 'effect';

/**
 * What the kit's build-time effects may need: the file system, paths and child processes.
 */
export type KitNodeServices =
  | FileSystem.FileSystem
  | Path.Path
  | ChildProcessSpawner.ChildProcessSpawner;

/**
 * The one runtime the kit's remark plugins run their effects in, with Node's services. Remark
 * plugins are the edge here: unified calls them with promises, so each runs its effect once.
 */
const runtime = ManagedRuntime.make(NodeServices.layer);

/**
 * Runs a build-time effect of the kit and resolves to its value; a failure rejects with the error.
 *
 * @param effect - The effect, needing at most Node's services.
 */
export function runKitEffect<A, E>(effect: Effect.Effect<A, E, KitNodeServices>): Promise<A> {
  return runtime.runPromise(effect);
}
