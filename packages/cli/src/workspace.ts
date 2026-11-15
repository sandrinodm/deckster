import { Context, Layer } from 'effect';
import path from 'node:path';

/**
 * The deck `dev`, `preview`, `present`, `layouts` and `mcp` use when no deck is named and `DECK` is
 * unset.
 */
export const DEFAULT_DECK = 'hello';

/**
 * The workspace root: the folder that contains `decks/` and `packages/`.
 */
export const WORKSPACE_ROOT = path.resolve(import.meta.dirname, '../../..');

/**
 * The folder `deck shot` writes to by default, relative to the workspace root.
 */
export const DEFAULT_SHOT_DIR = path.join('.deck', 'shots');

/**
 * The logical slide size in canvas pixels, which every screenshot and lint check assumes.
 */
export const CANVAS_SIZE = {
  /**
   * The canvas width in canvas pixels.
   */
  width: 1920,

  /**
   * The canvas height in canvas pixels.
   */
  height: 1080,
} as const;

/**
 * The workspace a command works in: the folder with `decks/`, `brands/` and `packages/`. Tests
 * provide a scratch workspace instead of the real one.
 */
export class Workspace extends Context.Service<
  Workspace,
  {
    /**
     * The absolute workspace root.
     */
    readonly root: string;
  }
>()('cli/Workspace') {
  /**
   * The framework's own workspace, the folder that contains this package.
   */
  static readonly layer = Layer.succeed(Workspace, Workspace.of({ root: WORKSPACE_ROOT }));

  /**
   * A workspace at another folder, such as a test's scratch folder.
   *
   * @param root - The absolute workspace root.
   */
  static at(root: string): Layer.Layer<Workspace> {
    return Layer.succeed(Workspace, Workspace.of({ root }));
  }
}
