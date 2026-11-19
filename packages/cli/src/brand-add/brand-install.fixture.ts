import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const pauseAt = process.env['DECK_TEST_BRAND_PAUSE'];
const target = process.env['DECK_TEST_BRAND_TARGET'];
const rename = fs.rename;
const exec = Reflect.getOwnPropertyDescriptor(DatabaseSync.prototype, 'exec')?.value;
if (typeof exec !== 'function') {
  throw new Error('Could not observe locks in SQLite');
}

let waiting = false;

// This preload observes the lock and pauses one rename in an otherwise normal CLI process.
DatabaseSync.prototype.exec = function (sql: string): void {
  try {
    exec.call(this, sql);
  } catch (error) {
    if (sql === 'BEGIN IMMEDIATE' && !waiting) {
      waiting = true;
      process.send?.('waiting');
    }

    throw error;
  }
};

fs.rename = Object.assign((...args: Parameters<typeof rename>) => {
  const [, to] = args;
  const publishing = pauseAt === 'publish' && to === target;
  const retiring =
    pauseAt === 'retire' && typeof to === 'string' && path.basename(to) === 'retired';
  if (publishing || retiring) {
    process.once('message', () => rename(...args));
    process.send?.('paused');
    return;
  }

  rename(...args);
}, rename);

syncBuiltinESMExports();
