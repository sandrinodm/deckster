import { APPS_DIR } from '#apps/discover-apps.ts';

/**
 * Any request under `/apps/<name>/`, capturing the name: the page, its scripts and its assets.
 */
const APP_PATH_PATTERN = new RegExp(`^/${APPS_DIR}/([^/?#]+)(?:[/?#]|$)`);

/**
 * The request path of a mini app's page: `/apps/<name>/` or `/apps/<name>/index.html`, capturing
 * the name.
 */
const APP_PAGE_PATTERN = new RegExp(`^/${APPS_DIR}/([a-z0-9-]+)/(?:index\\.html)?(?:[?#].*)?$`);

/**
 * What a request under `/apps/` asks for.
 */
export type AppRequest = {
  /**
   * The app folder name the path names.
   */
  name: string;

  /**
   * Whether the request is for the app's page rather than one of its files.
   */
  page: boolean;

  /**
   * Set when the name is not valid percent-encoding, such as `/apps/%/`. The request is a 400, and
   * `name` is the raw text.
   */
  malformed?: true;
};

/**
 * Reads the app a request path is for; `undefined` for a path outside `/apps/<name>/`. A name with
 * bad percent-encoding is marked `malformed` instead of throwing.
 *
 * @param url - The request URL as the server sees it, such as `/apps/agent-demo/`.
 */
export function appRequest(url: string): AppRequest | undefined {
  const name = APP_PATH_PATTERN.exec(url)?.[1];
  if (name === undefined) {
    return undefined;
  }

  const page = APP_PAGE_PATTERN.test(url);
  try {
    return { name: decodeURIComponent(name), page };
  } catch {
    return { name, page, malformed: true };
  }
}

/**
 * The text of the 404 a request for an app the deck does not have gets, naming the apps it has and
 * how to create the missing one. Answering 404 keeps the server's single-page fallback from serving
 * the deck's own page, which would load the deck inside its own frame, again and again.
 *
 * @param deck - The deck folder name.
 * @param name - The app name the request asked for.
 * @param apps - The names of the apps the deck has.
 */
export function missingAppMessage(deck: string, name: string, apps: readonly string[]): string {
  const known = apps.length === 0 ? 'The deck has no apps yet.' : `Apps: ${apps.join(', ')}.`;
  return (
    `There is no mini app "${name}" in decks/${deck}/${APPS_DIR}/. ${known} ` +
    `Create it with \`pnpm deck new app ${deck} ${name}\`, or fix the name in <AppFrame app>.\n`
  );
}
