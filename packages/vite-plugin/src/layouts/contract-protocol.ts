/**
 * The messages between the server and the process that checks a batch of contracts. The check
 * process runs contract code, which can reach `process` like any code in it, so the server treats
 * every message from it as untrusted data and reads it only through {@link readCheckMessage}.
 */

/**
 * The longest text the server keeps from a message of the check process, in characters.
 */
const MAX_TEXT_LENGTH = 2000;

/**
 * Why a contract failed in the check process: it threw (`error`), or it used something a contract
 * may not use, such as writing a file or reaching Node's built-in modules through `process`
 * (`denied`), which fails it even when it caught the error.
 */
export type CheckFailure = 'error' | 'denied';

/**
 * A message from the server to the check process.
 */
export type ServerMessage =
  | {
      /**
       * Evaluate these contracts.
       */
      readonly type: 'run';

      /**
       * The absolute `contract.ts` paths.
       */
      readonly files: readonly string[];
    }
  | {
      /**
       * The answer to an `invoke`.
       */
      readonly type: 'invoked';

      /**
       * The `invoke` it answers.
       */
      readonly id: number;

      /**
       * What Vite's module runner gets back: `{ result }` or `{ error }`.
       */
      readonly answer: unknown;
    };

/**
 * A message from the check process to the server.
 */
export type CheckMessage =
  | {
      /**
       * The process has started, with the permissions it must have, and waits for `run`.
       */
      readonly type: 'ready';
    }
  | {
      /**
       * The process does not run with the permissions it must have, so it runs nothing.
       */
      readonly type: 'unsafe';

      /**
       * What is wrong.
       */
      readonly message: string;
    }
  | {
      /**
       * A call of Vite's module runner to the server's environment (`fetchModule`, `getBuiltins`).
       */
      readonly type: 'invoke';

      /**
       * The call, answered with the same id.
       */
      readonly id: number;

      /**
       * The method.
       */
      readonly name: string;

      /**
       * Its arguments.
       */
      readonly args: readonly unknown[];
    }
  | {
      /**
       * A contract was evaluated and has a default export.
       */
      readonly type: 'loaded';

      /**
       * The absolute `contract.ts` path.
       */
      readonly file: string;
    }
  | {
      /**
       * A contract was evaluated and has no default export.
       */
      readonly type: 'no-default';

      /**
       * The absolute `contract.ts` path.
       */
      readonly file: string;
    }
  | {
      /**
       * A contract failed. It may follow `loaded` for the same file, when code of that contract
       * used something it may not after it finished loading.
       */
      readonly type: 'failed';

      /**
       * The absolute `contract.ts` path.
       */
      readonly file: string;

      /**
       * Why.
       */
      readonly reason: CheckFailure;

      /**
       * What went wrong, as a sentence.
       */
      readonly message: string;
    }
  | {
      /**
       * Every contract of the batch has an outcome.
       */
      readonly type: 'done';
    };

/**
 * Reads a message of the check process, or gives `undefined` for anything that is not one.
 *
 * @param value - What arrived.
 * @returns The message, with its texts cut to a bounded length.
 */
export function readCheckMessage(value: unknown): CheckMessage | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const type: unknown = Reflect.get(value, 'type');
  const file: unknown = Reflect.get(value, 'file');
  const message: unknown = Reflect.get(value, 'message');
  switch (type) {
    case 'ready':
    case 'done': {
      return { type };
    }

    case 'unsafe': {
      return typeof message === 'string' ? { type, message: bounded(message) } : undefined;
    }

    case 'invoke': {
      const id: unknown = Reflect.get(value, 'id');
      const name: unknown = Reflect.get(value, 'name');
      const args: unknown = Reflect.get(value, 'args');
      return Number.isSafeInteger(id) && typeof name === 'string' && Array.isArray(args)
        ? { type, id: Number(id), name, args }
        : undefined;
    }

    case 'loaded':
    case 'no-default': {
      return typeof file === 'string' ? { type, file } : undefined;
    }

    case 'failed': {
      const reason: unknown = Reflect.get(value, 'reason');
      return typeof file === 'string' &&
        typeof message === 'string' &&
        (reason === 'error' || reason === 'denied')
        ? { type, file, reason, message: bounded(message) }
        : undefined;
    }

    default: {
      return undefined;
    }
  }
}

/**
 * A text cut to {@link MAX_TEXT_LENGTH} characters.
 *
 * @param text - The text.
 */
function bounded(text: string): string {
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…` : text;
}
