/**
 * An app module that fails as it loads, for the test that the shell's entry survives a broken app
 * module without a native dialog: point `DECK_SHELL_TEST_APP_MODULE` at this file.
 */
throw new Error('throwing-app.fixture.ts failed on import, as intended.');
