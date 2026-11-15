import { app, dialog } from 'electron';

import { appModuleFor } from '#main/app-module.ts';
import { installHardening } from '#main/hardening.ts';

/**
 * The shell's Electron entry. It imports only what hardening needs and installs hardening before
 * anything else runs, then loads the app: a module that fails to load (a bad import, a malformed
 * configuration) reports on standard error and exits non-zero, never through a native dialog. The
 * import is awaited at the top level so the app's `app.setPath` calls run before `ready`.
 */
installHardening({
  dialog,
  app,
  process,
  report: (message) => process.stderr.write(`${message}\n`, () => undefined),
});

try {
  await import(appModuleFor(process.env));
} catch (error) {
  setTimeout(() => app.exit(1), 200);
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`shell failed to start: ${detail}\n`, () => app.exit(1));
}
