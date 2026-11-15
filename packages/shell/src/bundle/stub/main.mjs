// Replaces Electron's default app in the branded Deckster.app: runs the entry file given as the
// first argument, and nothing else. The import is awaited at the top level, which holds Electron's
// `ready` until the entry has run (it sets the profile folder and the app name first). Opened
// without an entry (a double click in Finder), it exits with code 64 instead of showing Electron's
// welcome window.
import { app } from 'electron';
import { pathToFileURL } from 'node:url';

const entry = process.argv.slice(1).find((arg) => !arg.startsWith('-'));
if (entry === undefined) {
  app.exit(64);
} else {
  try {
    await import(pathToFileURL(entry).href);
  } catch (error) {
    process.stderr.write(`shell failed to start: ${error?.stack ?? error}\n`, () => app.exit(1));
  }
}
