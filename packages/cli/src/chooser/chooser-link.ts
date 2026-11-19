import type { Plugin } from 'vite';

/**
 * The chooser's stable path, reserved on the launcher origin.
 */
export const CHOOSER_PATH = '/__deck/chooser/';

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
};

/**
 * Adds a keyboard-accessible link back to the launcher. The request keeps the same hostname when a
 * browser is connected through a network interface. Standalone dev and static decks omit it.
 */
export function chooserLinkPlugin(launcher: ChooserLink): Plugin {
  const target = `${CHOOSER_PATH}?return=${encodeURIComponent(launcher.key)}`;
  return {
    name: 'deck-chooser-link',
    transformIndexHtml: (_html, { path }) => {
      if (path !== '/' && path !== '/index.html') {
        return [];
      }

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
    },
  };
}
