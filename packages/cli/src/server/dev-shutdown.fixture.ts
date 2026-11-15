/**
 * A deck CLI process for the shutdown test: `deck dev hello --agent fake --port <port>` on a
 * scratch workspace with a copy of the hello deck, run as the real entry runs it
 * (`NodeRuntime.runMain(cliProgram(...))`). Run as `node dev-shutdown.fixture.ts <root> <port>`.
 */
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';

import { cliProgram } from '#cli.ts';
import { Workspace } from '#workspace.ts';

const [root, port] = process.argv.slice(2);
if (root === undefined || port === undefined) {
  throw new Error('usage: dev-shutdown.fixture.ts <root> <port>');
}

NodeRuntime.runMain(
  cliProgram(['dev', 'hello', '--agent', 'fake', '--port', port], Workspace.at(root)),
);
