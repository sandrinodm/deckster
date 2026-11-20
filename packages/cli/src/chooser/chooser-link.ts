import type { HtmlTagDescriptor, Plugin } from 'vite';

import { readFile } from 'node:fs/promises';

/**
 * The chooser's stable path, reserved on the launcher origin.
 */
export const CHOOSER_PATH = '/__deck/chooser/';

/**
 * A successful HTML response for the built deck.
 */
const HTTP_OK = 200;

/**
 * Identifies the launcher and the selected deck that can return to it.
 */
export type ChooserLink = {
  /**
   * The listening port of the chooser.
   */
  readonly port: number;

  /**
   * The selection identifier for returning to this chooser.
   */
  readonly key: string;

  /**
   * Reserves a deck port for the lifetime of the chooser. False means a previous selection used it,
   * so old tabs could otherwise reach a new deck on the same origin.
   */
  readonly claimPort: (port: number) => boolean;

  /**
   * Desktop windows show their own role-aware return controls.
   */
  readonly desktop?: boolean;
};

/**
 * Adds a keyboard-accessible link back to the launcher. The request keeps the same hostname when a
 * browser is connected through a network interface. Standalone dev and static decks omit it.
 */
export function chooserLinkPlugin(launcher: ChooserLink): Plugin {
  return {
    name: 'deck-chooser-link',
    transformIndexHtml: (_html, { path }) => {
      if (!isDeckDocument(path)) {
        return [];
      }

      return returnTags(launcher);
    },
  };
}

/**
 * Adds the same return link to a served build without changing the deck's exported files. Read
 * failures pass through Vite's error middleware.
 */
export function previewChooserLinkPlugin(launcher: ChooserLink, entry: string): Plugin {
  return {
    name: 'deck-preview-chooser-link',
    configurePreviewServer: (server) => {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0] ?? '';
        if (request.method !== 'GET' || !isDeckDocument(pathname)) {
          next();
          return;
        }

        void readFile(entry, 'utf8').then((html) => {
          const [style, script] = returnTags(launcher);
          const markup = html
            .replace('</head>', () => `<style>${style.children}</style></head>`)
            .replace('</body>', () => `<script>${script.children}</script></body>`);
          response.writeHead(HTTP_OK, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          });
          response.end(markup);
        }, next);
      });
    },
  };
}

/**
 * Identifies the Vite entry document without matching assets and API routes.
 */
function isDeckDocument(pathname: string): boolean {
  return pathname === '/' || pathname === '/index.html';
}

/**
 * Generates the link and its styles for development and static browser presentations.
 */
function returnTags(
  launcher: ChooserLink,
): [HtmlTagDescriptor & { children: string }, HtmlTagDescriptor & { children: string }] {
  const target = `${CHOOSER_PATH}?return=${encodeURIComponent(launcher.key)}`;
  return [
    {
      tag: 'style',
      children: `#deck-chooser-link {
  position: fixed; inset: auto 12px 12px auto; z-index: 2147483647;
  padding: 6px 10px; border-radius: 6px; color: #fff; background: #1e1c1a;
  font: 500 13px/1.4 system-ui, sans-serif; text-decoration: none;
}
#deck-chooser-link:hover, #deck-chooser-link:focus-visible { text-decoration: underline; }`,
      injectTo: 'head',
    },
    {
      tag: 'script',
      children: `if (!new URL(location.href).searchParams.has('static')) {
  const target = new URL(${JSON.stringify(target)}, location.href);
  target.port = ${JSON.stringify(String(launcher.port))};
  const link = document.createElement('a');
  link.id = 'deck-chooser-link';
  link.textContent = 'Back to decks';
  link.href = target.href;
  link.addEventListener('click', (event) => {
    if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      location.replace(link.href);
    }
  });
  document.body.append(link);
}`,
      injectTo: 'body',
    },
  ];
}
