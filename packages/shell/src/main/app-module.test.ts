import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

import { APP_MODULE, appModuleFor } from '#main/app-module.ts';

describe('the app module the entry loads', () => {
  it('is the shell app by default', () => {
    expect(appModuleFor({})).toBe(APP_MODULE);
    expect(APP_MODULE).toBe('#main/main-app.ts');
  });

  it('is overridable only under the hidden test option', () => {
    const fixture = '/x/throwing-app.fixture.ts';
    expect(appModuleFor({ DECK_SHELL_TEST_APP_MODULE: fixture })).toBe(APP_MODULE);
    expect(appModuleFor({ DECK_SHELL_TEST_APP_MODULE: fixture, DECK_SHELL_TEST_CORNER: '1' })).toBe(
      APP_MODULE,
    );
    expect(appModuleFor({ DECK_SHELL_TEST_APP_MODULE: fixture, DECK_SHELL_TEST_HIDDEN: '1' })).toBe(
      pathToFileURL(fixture).href,
    );
    expect(appModuleFor({ DECK_SHELL_TEST_APP_MODULE: '', DECK_SHELL_TEST_HIDDEN: '1' })).toBe(
      APP_MODULE,
    );
  });
});
