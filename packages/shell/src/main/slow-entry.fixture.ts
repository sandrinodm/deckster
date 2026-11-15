import { app } from 'electron';
import { writeFileSync } from 'node:fs';

/**
 * A stand-in for the shell's entry, for the test that the branded app holds Electron's `ready`
 * until the entry has loaded: it awaits 300 ms at the top level, writes whether the app was ready
 * by then to the file `DECK_SLOW_ENTRY_OUT` names, and exits. It hides the Dock icon first and
 * keeps Electron's folders in `DECK_SLOW_ENTRY_DIR`, as the shell does.
 */
app.dock?.hide();
for (const name of ['userData', 'sessionData', 'logs', 'crashDumps'] as const) {
  app.setPath(name, process.env['DECK_SLOW_ENTRY_DIR'] ?? '');
}

await new Promise<void>((resolve) => setTimeout(resolve, 300));
writeFileSync(process.env['DECK_SLOW_ENTRY_OUT'] ?? '', String(app.isReady()));
app.exit(0);
