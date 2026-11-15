/**
 * Shows what broke a deck that never started. `index.html` loads this module before `main.tsx`, and
 * it has no imports, so it runs even when the deck's own modules cannot: a slide that imports a
 * name its module does not export fails to link the whole page, `main.tsx` never runs, and the page
 * would stay blank with the error only in the console. Until `window.__deck` exists, every uncaught
 * error, unhandled rejection and module that fails to load is listed in `#deck-root`, with the file
 * it came from; once the deck renders, React replaces the panel. In dev, the next hot update
 * reloads the page, so saving the fix shows the deck. `deck shot`, `deck lint` and `deck export`
 * read the same panel (`[data-deck-start-error]`) to name the file: each problem carries the module
 * path in `data-file` and the browser's own message in `data-message`.
 */

/**
 * The id of the element the deck renders into, where the panel goes.
 */
const ROOT_ELEMENT_ID = 'deck-root';

/**
 * Marks the panel for tools; each problem in it is a `[data-deck-start-problem]` item.
 */
const PANEL_ATTRIBUTE = 'data-deck-start-error';

/**
 * The URL prefix Vite serves files outside its root under, followed by the absolute path.
 */
const FS_PREFIX = '/@fs';

/**
 * A `/@fs/...` module path inside an error message, capturing the absolute path.
 */
const FS_PATH = /\/@fs(\/[^\s'"`]+)/g;

/**
 * The folders a workspace path is shown from, most specific first: `decks/talk/slides/x.tsx`, not
 * the absolute path. The last occurrence counts, so a deck inside a package's fixtures still shows
 * from its `decks/` folder.
 */
const WORKSPACE_FOLDERS = ['/decks/', '/brands/', '/packages/'];

/**
 * The panel's inline styles: the deck's stylesheets load with `main.tsx`, so they may be missing.
 */
const PANEL_STYLE = [
  'position: fixed',
  'inset: 0',
  'overflow: auto',
  'box-sizing: border-box',
  'margin: 0',
  'padding: 48px 56px',
  'background: #fff4f2',
  'color: #7a1c0f',
  'font: 16px/1.5 system-ui, sans-serif',
].join(';');

/**
 * The style of each problem's message.
 */
const MESSAGE_STYLE = [
  'margin: 4px 0 24px',
  'font: 15px/1.5 ui-monospace, monospace',
  'white-space: pre-wrap',
  'overflow-wrap: anywhere',
].join(';');

/**
 * One thing that went wrong before the deck started.
 */
type StartProblem = {
  /**
   * What the browser reported, such as `SyntaxError: The requested module ... does not provide an
   * export named 'x'`.
   */
  message: string;

  /**
   * The absolute path (or URL path) of the module it came from, or empty when unknown. For a module
   * that failed to link, it is the module whose import failed.
   */
  file: string;
};

/**
 * The problems seen so far, oldest first.
 */
const problems: StartProblem[] = [];

window.addEventListener('error', onError, true);
window.addEventListener('unhandledrejection', (event) => {
  record({ message: describe(event.reason), file: '' });
});
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', reloadAfterFailure);
}

/**
 * Records an uncaught error, or a script or stylesheet that failed to load (those reach the window
 * only while capturing).
 *
 * @param event - The error event.
 */
function onError(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLScriptElement || target instanceof HTMLLinkElement) {
    const url = target instanceof HTMLScriptElement ? target.src : target.href;
    record({
      message: `The page could not load ${urlPath(url)} or a module it imports.`,
      file: filePath(url),
    });
    return;
  }

  if (event instanceof ErrorEvent) {
    const error: unknown = event.error;
    record({
      message: error === undefined || error === null ? event.message : describe(error),
      file: filePath(event.filename),
    });
  }
}

/**
 * Adds a problem and shows the panel, unless the deck has started: from then on the slides show
 * their own errors.
 *
 * @param problem - What went wrong.
 */
function record(problem: StartProblem): void {
  if (window.__deck !== undefined) {
    return;
  }

  problems.push(problem);
  const root = document.getElementById(ROOT_ELEMENT_ID);
  if (root !== null) {
    root.replaceChildren(panel());
  }
}

/**
 * The panel listing every problem.
 */
function panel(): HTMLElement {
  const element = document.createElement('div');
  element.setAttribute(PANEL_ATTRIBUTE, '');
  element.setAttribute('role', 'alert');
  element.setAttribute('style', PANEL_STYLE);
  const heading = document.createElement('h1');
  heading.setAttribute('style', 'margin: 0 0 24px; font-size: 24px');
  heading.textContent = 'The deck could not start';
  element.append(heading);
  for (const problem of problems) {
    element.append(problemItem(problem));
  }

  const hint = document.createElement('p');
  hint.setAttribute('style', 'margin: 0');
  hint.textContent = import.meta.hot
    ? 'Fix the file and save it; the page reloads.'
    : 'Fix the file and rebuild the deck.';
  element.append(hint);
  return element;
}

/**
 * One problem: the file it came from and the message.
 *
 * @param problem - The problem.
 */
function problemItem(problem: StartProblem): HTMLElement {
  const item = document.createElement('section');
  item.setAttribute('data-deck-start-problem', '');
  item.setAttribute('data-file', problem.file);
  if (problem.file !== '') {
    const file = document.createElement('p');
    file.setAttribute('style', 'margin: 0; font-weight: 700');
    file.textContent = shownPath(problem.file);
    item.append(file);
  }

  const message = document.createElement('pre');
  message.setAttribute('data-message', problem.message);
  message.setAttribute('style', MESSAGE_STYLE);
  message.textContent = problem.message.replaceAll(FS_PATH, (_, path: string) => shownPath(path));
  item.append(message);
  return item;
}

/**
 * Reloads the page on the first hot update after the deck failed to start: no module of the deck
 * ran, so none can accept the update itself.
 */
function reloadAfterFailure(): void {
  if (problems.length > 0 && window.__deck === undefined) {
    window.location.reload();
  }
}

/**
 * An error as `Name: message`, or any other thrown value as text.
 *
 * @param error - What was thrown.
 */
function describe(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}

/**
 * The path of a module URL on this server, without its query: the absolute path for a file Vite
 * serves under `/@fs`, else the URL path; empty for an empty URL.
 *
 * @param url - The module's URL.
 */
function filePath(url: string): string {
  if (url === '') {
    return '';
  }

  const path = urlPath(url);
  return path.startsWith(`${FS_PREFIX}/`) ? path.slice(FS_PREFIX.length) : path;
}

/**
 * The path of a URL, without origin, query or hash.
 *
 * @param url - An absolute or page-relative URL.
 */
function urlPath(url: string): string {
  try {
    return decodeURIComponent(new URL(url, window.location.href).pathname);
  } catch {
    return url;
  }
}

/**
 * A path as the panel shows it: from the workspace's `decks/`, `packages/` or `brands/` folder when
 * it has one, else as it is.
 *
 * @param path - An absolute path or URL path.
 */
function shownPath(path: string): string {
  for (const folder of WORKSPACE_FOLDERS) {
    const index = path.lastIndexOf(folder);
    if (index !== -1) {
      return path.slice(index + 1);
    }
  }

  return path;
}
