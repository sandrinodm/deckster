import { app } from 'electron';
import { writeFileSync } from 'node:fs';

// Run only as the hidden shell's test app. Port 0 confines the CDP endpoint to loopback and lets
// Chromium select a free port. The real shell still owns the windows and its temporary profile.
app.commandLine.appendSwitch('remote-debugging-port', '0');
await import('../../../shell/src/main/main-app.ts');

const profileMarker = process.env['DECK_CHOOSER_TEST_PROFILE'];
if (profileMarker === undefined || profileMarker === '') {
  throw new Error('The test profile marker was not supplied.');
}

writeFileSync(profileMarker, app.getPath('userData'));
