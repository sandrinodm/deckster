# @deckster/app-bridge

The `postMessage` protocol between a deck and the mini apps it shows in `<AppFrame>`. The deck
sends an app its brand, slide and step. The app asks for steps, moves the deck, reports errors and
says when it has drawn its first frame. Both ends validate every message with Effect `Schema` and
check the sender's window and origin.

It is private and not published. Decks depend on it as `"@deckster/app-bridge": "workspace:*"`.

## A mini app

A mini app is a page in `decks/<deck>/apps/<name>/`. `deck new app <deck> <name>` scaffolds one
with the React hook already wired up; this is its component:

```tsx
import { useDeckApp } from '@deckster/app-bridge/react';
import { useEffect } from 'react';

const STEPS = 3;

function Demo() {
  const { brand, active, step, ready, requestSteps } = useDeckApp();
  useEffect(() => {
    requestSteps(STEPS);
    ready();
  }, [ready, requestSteps]);
  return (
    <main className="app" data-active={active}>
      <h1>{brand?.label ?? 'Standalone'}</h1>
      <p>
        Step {step} of {STEPS}. The slide is {active ? 'on screen' : 'paused'}.
      </p>
    </main>
  );
}
```

A slide shows it with `<AppFrame app="<name>" poster="..." />`. `poster` is required: static mode,
`deck shot`, export and thumbnails show it instead of the iframe. `pnpm deck components --json`
lists the other `AppFrame` props.

Without React, use the client directly. This is the `thrower` app from the plugin's e2e fixtures:

```ts
import { connectDeck } from '@deckster/app-bridge/client';

const deck = connectDeck();
deck.ready();
```

Opened on its own (not in a frame), an app's state is `standalone` and it sends nothing, so you can
develop it in a normal tab. Working examples: `decks/showcase/apps/agent-chat` and
`decks/apps-demo/apps/agent-demo`.

## Exports

| Export                        | For                                                                                              | Main names                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@deckster/app-bridge`        | The protocol itself                                                                              | `DeckMessage`, `AppMessage` (schemas), `isDeckMessage`, `isAppMessage`, `acceptDeckMessage`, `acceptAppMessage`, `envelope`, `BRIDGE_CHANNEL`, `BRIDGE_VERSION`, `MAX_REQUESTED_STEPS`, `BridgeBrand` |
| `@deckster/app-bridge/host`   | The deck's end. `@deckster/kit`'s `AppFrame` uses it (`packages/kit/src/apps/use-app-bridge.ts`) | `createHostMessenger({ frame, origin, onMessage })`                                                                                                                                                   |
| `@deckster/app-bridge/client` | An app without React                                                                             | `connectDeck(options)`, `reduceDeckMessage`, `DeckAppState`                                                                                                                                           |
| `@deckster/app-bridge/react`  | An app in React                                                                                  | `useDeckApp(options)`                                                                                                                                                                                 |

`useDeckApp` shares one connection per page; only the first call's options are used.

## Messages

Every message carries `channel: 'deck-app-bridge'` and `version: 1`. A message with another
channel or version, from another window or origin, or that fails its schema is ignored.

| From | Type                     | Carries                                                                             |
| ---- | ------------------------ | ----------------------------------------------------------------------------------- |
| Deck | `init`                   | `brand`, `cssVariables`, `fontFaces`, `scheme`, `slide`, `step`, `active`, `static` |
| Deck | `activate`, `deactivate` | The slide came on or went off screen                                                |
| Deck | `step`                   | `step`                                                                              |
| Deck | `static`                 | `static`                                                                            |
| App  | `hello`                  | Sent on connect; the deck answers with `init`                                       |
| App  | `ready`                  | The first complete frame is drawn; the slide's `ready()` can resolve                |
| App  | `requestSteps`           | `count`, 0 to 64; the app then owns that many steps of the slide                    |
| App  | `next`, `prev`           | Move the deck                                                                       |
| App  | `resize`                 | `width`, `height` in CSS pixels, both optional                                      |
| App  | `error`                  | `message`; the deck shows its recorded fallback or the poster                       |
| App  | `release`                | Give the keyboard back to the deck                                                  |
| App  | `focus`                  | `focused`                                                                           |

The schemas are in [`src/protocol/messages.ts`](src/protocol/messages.ts) and
[`src/protocol/bridge-brand.ts`](src/protocol/bridge-brand.ts).

## What `connectDeck` does for you

These are on by default and each has an option to turn it off:

| Option           | Default                                                | Behaviour                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `applyTheme`     | `true`                                                 | On `init`, sets the brand's `--brand-*` custom properties and `color-scheme` on `<html>` and adds the deck's `@font-face` rules. Style the app with the same variables a slide uses. |
| `escapeReleases` | `true`                                                 | Escape sends `release`, so the deck takes the keyboard back.                                                                                                                         |
| `reportErrors`   | `true`                                                 | Uncaught errors and unhandled rejections are sent as `error`, cut to 500 characters.                                                                                                 |
| `hostOrigin`     | The origin of `document.referrer`, else the page's own | The deck's origin. An app served from another origin than the deck must set it.                                                                                                      |

## Changing the protocol

- A deck and an app on different `BRIDGE_VERSION`s ignore each other's messages. Changing a
  message's shape in a way old apps cannot read means bumping it.
- The host checks `event.source` against the frame's `contentWindow` and the configured origin. The
  client checks against `window.parent` and `hostOrigin`. Keep both checks in
  [`src/protocol/message-guard.ts`](src/protocol/message-guard.ts).
- This package runs in the browser. Effect is used for `Schema` only; keep the rest plain
  TypeScript and React.
- The iframe is for isolating CSS and globals, not a security boundary: bundled apps run with
  `sandbox="allow-scripts allow-same-origin allow-forms"`.

## Tests

```sh
pnpm --filter @deckster/app-bridge test
```

The unit tests cover the schemas, the client state reducer and `connectDeck`. The end-to-end
behaviour (a missing app, an app that throws, an unreachable host, a page without the bridge) is in
`packages/vite-plugin/e2e/apps-cases.e2e.ts`, which drives the `apps-cases` fixture deck.
