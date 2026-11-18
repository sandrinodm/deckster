/**
 * A deck CLI process for tests that need the real exit: the command in `argv`, on a workspace, run
 * as the real entry runs it (`NodeRuntime.runMain(cliProgram(...))`). Run as `node
 * cli-process.fixture.ts <root> <command> [args...]`.
 */
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';

import { cliProgram } from '#cli.ts';
import { Workspace } from '#workspace.ts';

const [root, ...argv] = process.argv.slice(2);
if (root === undefined || argv.length === 0) {
  throw new Error('usage: cli-process.fixture.ts <root> <command> [args...]');
}

NodeRuntime.runMain(cliProgram(argv, Workspace.at(root)));
