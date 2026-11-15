#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The oldest Node major version the framework supports; it matches `engines.node`.
 */
const MIN_NODE_MAJOR = 26;

/**
 * The environment variable messages read to name the command to type (`deckCommand`). It is the
 * same name as `DECK_COMMAND_ENV` in the engine; this file may import only `node:` modules.
 */
const COMMAND_ENV = 'DECKSTER_COMMAND';

/**
 * The environment variable that tells framework code where the hooks file is, so a child process
 * that runs framework TypeScript (the watchdog, the Electron shell) can load the hooks first.
 */
const HOOKS_ENV = 'DECKSTER_HOOKS';

/**
 * The `deck` command of the published package: refuses an old Node with one line (before any
 * framework code could fail in a confusing way), registers the hooks, then runs the framework's own
 * entry point from its staged source.
 */
const major = Number.parseInt(process.versions.node, 10);
if (major < MIN_NODE_MAJOR) {
  process.stderr.write(
    `deck needs Node ${MIN_NODE_MAJOR} or later, found v${process.versions.node}.\n`,
  );
  process.exit(1);
}

process.env[COMMAND_ENV] = 'deck';
process.env[HOOKS_ENV] = path.join(import.meta.dirname, 'hooks.js');
await import('./hooks.ts');
await import(
  pathToFileURL(path.join(import.meta.dirname, 'framework', 'packages', 'cli', 'src', 'bin.ts'))
    .href
);
