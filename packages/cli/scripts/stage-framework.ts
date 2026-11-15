import path from 'node:path';

import { runStageFramework } from '../src/release/stage-framework.ts';

runStageFramework({
  repoRoot: path.resolve(import.meta.dirname, '../../..'),
  cliDir: path.resolve(import.meta.dirname, '..'),
});
