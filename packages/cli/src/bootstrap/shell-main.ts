import path from 'node:path';
import { pathToFileURL } from 'node:url';

import './hooks.ts';

/**
 * The Electron entry of the published package: registers the hooks, which the shell's TypeScript
 * needs inside `node_modules`, then runs the shell's own entry from its staged source.
 */
const entry = pathToFileURL(
  path.join(import.meta.dirname, 'framework', 'packages', 'shell', 'src', 'main', 'main.ts'),
);
await import(entry.href);
