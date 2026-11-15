import { decodeEvent, encodeMessage } from '@deckster/shell/protocol';
import { spawn } from 'node:child_process';

/**
 * A helper process for the parent-death test: it starts the shell hidden, opens a window, prints
 * the shell's pid as one JSON line once the page has loaded, and then waits to be killed. Run as
 * `node parent-death.fixture.ts <executable> <entry> <url>`.
 */
const [executable, entry, url] = process.argv.slice(2);
if (executable === undefined || entry === undefined || url === undefined) {
  throw new Error('usage: parent-death.fixture.ts <executable> <entry> <url>');
}

const child = spawn(executable, [entry], {
  stdio: ['pipe', 'pipe', 'ignore'],
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: undefined,
    DECK_SHELL_TEST_HIDDEN: '1',
    DECK_SHELL_CONFIG: JSON.stringify({ url, title: 'parent death', backgroundColor: '#000000' }),
  },
});
let buffered = '';
child.stdout.on('data', (chunk: Buffer) => {
  buffered += chunk.toString();
  for (const line of buffered.split('\n').slice(0, -1)) {
    const decoded = decodeEvent(line);
    if (decoded.ok && decoded.message.type === 'displays') {
      const display = decoded.message.displays[0];
      if (display !== undefined) {
        child.stdin.write(
          encodeMessage({
            type: 'open',
            plan: { audience: { displayId: display.id, fullscreen: false }, kiosk: false },
          }),
        );
      }
    }

    if (decoded.ok && decoded.message.type === 'ready') {
      process.stdout.write(`${JSON.stringify({ shellPid: child.pid })}\n`);
    }
  }

  buffered = buffered.slice(buffered.lastIndexOf('\n') + 1);
});
setInterval(() => undefined, 1000);
