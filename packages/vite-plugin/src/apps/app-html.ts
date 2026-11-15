/**
 * An `src` or `href` attribute whose value starts with `./`, which in dev must point at the app's
 * own folder because the page is served from the engine's root.
 */
const RELATIVE_ATTRIBUTE_PATTERN = /(\s(?:src|href)=)(["'])\.\/([^"']*)\2/g;

/**
 * The `<title>` element of an HTML page.
 */
const TITLE_PATTERN = /<title>[\s\S]*?<\/title>/;

/**
 * Points an app page's relative `src` and `href` attributes at its folder through Vite's `/@fs/`
 * prefix, so the dev server serves `./main.tsx` from `decks/<deck>/apps/<name>/` although the page
 * is requested at `apps/<name>/`. A build resolves them as usual and does not need this.
 *
 * @param html - The app's `index.html`.
 * @param appDir - The absolute app folder, with forward slashes.
 */
export function pointAtAppFolder(html: string, appDir: string): string {
  return html.replace(
    RELATIVE_ATTRIBUTE_PATTERN,
    (_, attribute: string, quote: string, file: string) =>
      `${attribute}${quote}/@fs${appDir}/${file}${quote}`,
  );
}

/**
 * Puts the app page's own `<title>` back after the deck's `transformIndexHtml` hook replaced it
 * with the deck's title.
 *
 * @param transformed - The page after Vite's transforms.
 * @param original - The page as the app wrote it.
 */
export function restoreTitle(transformed: string, original: string): string {
  const title = TITLE_PATTERN.exec(original)?.[0];
  return title === undefined ? transformed : transformed.replace(TITLE_PATTERN, () => title);
}
