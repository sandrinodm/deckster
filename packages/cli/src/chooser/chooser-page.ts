import { HTTP_CONFLICT, HTTP_START_FAILED, SELECTION_HEADER } from '#chooser/chooser-protocol.ts';
import { escapeHtml } from '#diff/escape-html.ts';
import { GALLERY_STYLES } from '#site/gallery-styles.ts';

/**
 * The gallery stylesheet additions for a whole-card button and an uncropped cover.
 */
const CHOOSER_STYLES = `
.grid { margin-top: 24px; }
.card { width: 100%; color: inherit; font: inherit; text-align: left; padding: 0; }
button.card { cursor: pointer; }
button.card:hover { border-color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.controls { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
.controls a { color: var(--accent); }
.controls button { font: inherit; }
.thumb { position: relative; width: 100%; }
.thumb img { object-fit: contain; position: absolute; inset: 0; }
.thumb img[hidden] { display: none; }
.cover-label { display: grid; place-items: center; width: 100%; height: 100%; color: var(--muted); }
.controls[hidden] { display: none; }
.status:empty { margin: 0; }
.status { margin: 16px 0 0; }
.status[data-error="true"] { color: var(--accent); }
`;

/**
 * One deck card, with the folder name as a fallback if its manifest cannot be read.
 */
export type ChooserCard = {
  /**
   * The deck folder name, used for the selection and cover paths.
   */
  readonly id: string;

  /**
   * The title to show above the folder name.
   */
  readonly title: string;
};

/**
 * The current chooser state as seen by the browser opening the document.
 */
type ChooserPageOptions = {
  /**
   * The chooser path prefix on its own origin.
   */
  readonly base: string;

  /**
   * The decks in folder-name order.
   */
  readonly decks: readonly ChooserCard[];

  /**
   * The active deck folder, or undefined when none is open.
   */
  readonly active: string | undefined;

  /**
   * Whether the current browser can control the selection.
   */
  readonly operator: boolean;

  /**
   * The current selection identifier if the browser came from Back to decks.
   */
  readonly returning: string | undefined;

  /**
   * Whether opening a deck leaves the chooser in its own window.
   */
  readonly desktop: boolean;

  /**
   * The page CSP nonce for the inline stylesheet and browser script.
   */
  readonly nonce: string;
};

/**
 * Renders the local launcher and its keyboard-accessible deck cards. The operator can start and
 * close decks from this page. Other devices see a link to the currently selected deck.
 */
export function renderChooser(options: ChooserPageOptions): string {
  const { base, decks, active, operator, returning, desktop, nonce } = options;
  const cards = decks.map((deck) => renderCard(deck, base)).join('\n');
  const label = active === undefined ? '' : `Open deck &middot; ${escapeHtml(active)}`;
  const content = operator
    ? renderOperator(base, cards, decks.length, label, returning, desktop, nonce)
    : '<p>Choose a deck on the computer running Deckster.</p>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Choose a deck</title>
<style nonce="${nonce}">${GALLERY_STYLES}${CHOOSER_STYLES}</style>
</head>
<body>
<main>
<h1>Choose a deck</h1>
${operator || active === undefined ? '' : `<p><a href="${base}current">${label}</a></p>`}
${content}
</main>
</body>
</html>`;
}

/**
 * Renders the controls and cards available to the local operator.
 */
function renderOperator(
  base: string,
  cards: string,
  deckCount: number,
  label: string,
  returning: string | undefined,
  desktop: boolean,
  nonce: string,
): string {
  const empty = 'No decks found. Run <code>deck new &lt;name&gt;</code> to create one.';
  const protocol = [HTTP_CONFLICT, HTTP_START_FAILED, SELECTION_HEADER] as const;
  const script = chooserClient.toString();
  const args = [base, returning ?? null, protocol].map((value) => JSON.stringify(value)).join(', ');
  const list = deckCount === 0 ? `<p class="empty">${empty}</p>` : `<ul class="grid">${cards}</ul>`;
  return `<div class="controls" ${label === '' ? 'hidden' : ''}>
<a href="${base}current" ${desktop ? 'hidden' : ''}>${label}</a>
<button type="button" data-close>Close deck</button>
</div>
<div class="status" role="status" aria-live="polite"></div>
${list}
<script nonce="${nonce}">(${script})(${args});</script>`;
}

/**
 * Renders a single focusable button for the title, folder and optional cover.
 */
function renderCard(deck: ChooserCard, base: string): string {
  const id = escapeHtml(deck.id);
  const title = escapeHtml(deck.title);
  const preview = `${base}cover/${encodeURIComponent(deck.id)}`;
  return `<li>
<button type="button" class="card" data-deck="${id}">
<span class="thumb">
  <span class="cover-label" aria-hidden="true"></span>
  <img data-cover="${preview}" alt="" hidden>
</span>
<span class="body">
  <strong>${title}</strong>
  <span class="meta">${id}</span>
</span>
</button>
</li>`;
}

/**
 * Runs in the chooser document. Its source is embedded as a standalone script, so every dependency
 * is defined in the function or passed as an argument.
 */
function chooserClient(
  base: string,
  returning: string | null,
  [conflict, failed, selectionHeader]: readonly [number, number, string],
): void {
  const status = document.querySelector<HTMLElement>('.status');
  const fallback = 'The deck chooser could not complete this request.';
  const closing = 'Closing deck…';
  const controls = document.querySelector<HTMLElement>('.controls');
  const covers = document.querySelectorAll<HTMLImageElement>('img[data-cover]');
  let pending = false;

  /**
   * Announces a selection result, or clears the live region when text is empty.
   */
  function message(text: string, error = false): void {
    if (status !== null) {
      status.textContent = text;
      status.dataset.error = String(error);
    }
  }

  /**
   * Requests a selection change and prompts before stopping a running agent.
   */
  async function change(action: string, label: string): Promise<void> {
    if (pending) {
      return;
    }

    pending = true;
    message(label);
    try {
      const route = new URL(base + action, window.location.origin);
      if (returning !== null && action === 'close') {
        route.searchParams.set('selection', returning);
      }

      let response = await fetch(route, { method: 'POST' });
      if (response.status === conflict) {
        const prompt = await response.text();
        if (!window.confirm(prompt)) {
          message('');
          return;
        }

        const confirmation = response.headers.get(selectionHeader) ?? '';
        response = await fetch(route, {
          method: 'POST',
          headers: { [selectionHeader]: confirmation },
        });
      }

      const detail = await response.text();
      if (!response.ok) {
        message(detail || fallback, true);
        if (response.status === failed && controls !== null) {
          controls.hidden = true;
        }

        return;
      }

      if (detail !== '') {
        window.location.assign(detail);
        return;
      }

      window.location.reload();
    } catch {
      message(fallback, true);
    } finally {
      pending = false;
    }
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-deck]')) {
    button.addEventListener('click', () => {
      const name = button.dataset.deck ?? '';
      void change('open/' + encodeURIComponent(name), 'Opening ' + name + '…');
    });
  }

  document.querySelector('[data-close]')?.addEventListener('click', () => {
    void change('close', closing);
  });
  window.addEventListener('pageshow', ({ persisted }) => {
    if (persisted) {
      window.location.reload();
    }
  });
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        continue;
      }

      const img = entry.target.querySelector<HTMLImageElement>('img[data-cover]');
      observer.unobserve(entry.target);
      if (img === null) {
        continue;
      }

      const label = entry.target.querySelector('.cover-label');
      img.addEventListener('load', () => {
        img.hidden = false;
      });
      img.addEventListener('error', () => {
        if (label !== null) {
          label.textContent = 'Cover unavailable';
        }
      });
      img.src = img.dataset.cover ?? '';
    }
  });
  for (const cover of covers) {
    const frame = cover.closest('.thumb');
    if (frame !== null) {
      observer.observe(frame);
    }
  }

  if (returning !== null) {
    window.history.replaceState(null, '', window.location.pathname);
    void change('close', closing);
  }
}
