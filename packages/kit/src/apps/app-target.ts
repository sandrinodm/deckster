/**
 * The folder, relative to the deck's page, where a deck's built apps are served.
 */
export const APPS_PATH = 'apps';

/**
 * Letters, digits and hyphens: the form `deck new app` names an app folder in.
 */
const APP_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The `sandbox` tokens every frame gets: scripts, its own origin (so the app's module scripts and
 * fonts load) and forms. Popups, downloads and top navigation stay off unless the author asks.
 */
const BUNDLED_SANDBOX: readonly string[] = ['allow-scripts', 'allow-same-origin', 'allow-forms'];

/**
 * The extra tokens an external page usually needs to work as it does in a browser tab.
 */
const EXTERNAL_SANDBOX: readonly string[] = ['allow-popups', 'allow-presentation'];

/**
 * The `allow` features of a bundled app.
 */
const BUNDLED_ALLOW: readonly string[] = ['autoplay'];

/**
 * The `allow` features of an external page.
 */
const EXTERNAL_ALLOW: readonly string[] = ['autoplay', 'fullscreen', 'clipboard-write'];

/**
 * Where a mini app's frame points and how much the deck trusts it.
 */
export type AppTarget = {
  /**
   * The absolute URL the iframe loads.
   */
  url: string;

  /**
   * The origin of that URL, which bridge messages must come from and go to.
   */
  origin: string;

  /**
   * `bundled` for an app of the deck (`app="name"`) or a path on the deck's own origin; `external`
   * for another origin, which gets the bridge only when the author opts in.
   */
  kind: 'bundled' | 'external';

  /**
   * The host and path to show in a browser frame's address bar.
   */
  display: string;
};

/**
 * What {@link resolveAppTarget} reads from the component's props.
 */
export type AppTargetInput = {
  /**
   * The name of a folder under the deck's `apps/`.
   */
  app: string | undefined;

  /**
   * A URL or a path, absolute or relative to the page.
   */
  src: string | undefined;

  /**
   * The page's own URL, which relative paths resolve against and which decides what is external.
   */
  base: string;
};

/**
 * Works out the frame's URL from `app` or `src`. An app name is served at `apps/<name>/` next to
 * the deck's page; a `src` on another origin is external.
 *
 * @param input - The props and the page URL.
 * @returns The target.
 * @throws Error naming the fix when neither or both of `app` and `src` are given, when `app` is not
 *   a kebab-case name, or when `src` is not a URL.
 */
export function resolveAppTarget(input: AppTargetInput): AppTarget {
  const { app, src, base } = input;
  if (app !== undefined && src === undefined) {
    return bundledTarget(app, base);
  }

  if (src !== undefined && app === undefined) {
    return srcTarget(src, base);
  }

  throw new Error(
    '<AppFrame> needs exactly one of `app` (a folder under decks/<deck>/apps/) or `src` (a URL).',
  );
}

/**
 * The `sandbox` attribute value for a frame: the defaults for its kind, then the author's extra
 * tokens, without duplicates.
 *
 * @param kind - Bundled or external.
 * @param extra - Tokens the author adds, such as `allow-downloads`.
 */
export function sandboxAttribute(kind: AppTarget['kind'], extra: readonly string[]): string {
  const defaults = kind === 'bundled' ? BUNDLED_SANDBOX : [...BUNDLED_SANDBOX, ...EXTERNAL_SANDBOX];
  return [...new Set([...defaults, ...extra])].join(' ');
}

/**
 * The `allow` attribute value for a frame: the defaults for its kind, then the author's extra
 * features (each a feature name such as `microphone`), without duplicates.
 *
 * @param kind - Bundled or external.
 * @param extra - Features the author adds.
 */
export function allowAttribute(kind: AppTarget['kind'], extra: readonly string[]): string {
  const defaults = kind === 'bundled' ? BUNDLED_ALLOW : EXTERNAL_ALLOW;
  return [...new Set([...defaults, ...extra])].join('; ');
}

/**
 * The target of an app folder served by the deck.
 *
 * @param app - The folder name.
 * @param base - The page URL.
 */
function bundledTarget(app: string, base: string): AppTarget {
  if (!APP_NAME_PATTERN.test(app)) {
    throw new Error(
      `<AppFrame app="${app}"> is not an app name. Use the kebab-case folder name under ` +
        'decks/<deck>/apps/, such as "agent-demo".',
    );
  }

  const url = new URL(`${APPS_PATH}/${app}/`, base);
  return { url: url.href, origin: url.origin, kind: 'bundled', display: `${app}.app` };
}

/**
 * The target of a `src` URL.
 *
 * @param src - The URL or path.
 * @param base - The page URL.
 */
function srcTarget(src: string, base: string): AppTarget {
  let url: URL;
  try {
    url = new URL(src, base);
  } catch {
    throw new Error(`<AppFrame src="${src}"> is not a URL. Write a full URL such as https://...`);
  }

  const kind = url.origin === new URL(base).origin ? 'bundled' : 'external';
  const path = url.pathname === '/' ? '' : url.pathname;
  return { url: url.href, origin: url.origin, kind, display: `${url.host}${path}` };
}
