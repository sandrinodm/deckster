# @deckster/presenter

The presenting tools of deckster: the slide sidebar, the overview, the presenter window with notes
and pacing, go-to, blackout, the laser pointer, swipe, the shortcut help and the tool cluster. It is
a runtime plugin that `@deckster/vite-plugin` loads into every deck, in dev and in builds.

It is a workspace package (`private`, TypeScript source, not on npm). You use it by running a deck:

```sh
pnpm deckster dev hello
```

Then press `?` on the slide for the list of keys, or move the pointer to the bottom-left corner for
the tool cluster.

## Keys

These are the shortcuts the package registers (`src/shortcuts/builtin-shortcuts.ts`). Letters
match either case; a press with Ctrl, Alt or Meta never matches.

| Key                          | What it does                                                | Window   |
| ---------------------------- | ----------------------------------------------------------- | -------- |
| Right, Down, PageDown, Space | Next step or slide (handled by the engine, listed for help) | both     |
| Left, Up, PageUp             | Previous step or slide (engine)                             | both     |
| Home, End                    | First or last shown slide (engine)                          | both     |
| `g`                          | Go to slide: type its number, then Enter (hidden ones too)  | both     |
| `f`                          | Fullscreen                                                  | both     |
| `b`, `w`                     | Black out or white out the screen                           | both     |
| `l`                          | Laser pointer                                               | both     |
| `p`                          | Open the presenter window                                   | audience |
| `s`                          | Slide sidebar                                               | audience |
| `o`                          | Overview                                                    | audience |
| `?`                          | Shortcut help                                               | both     |
| Escape                       | Close the topmost panel                                     | both     |

Other packages add their own through the same registry, so the help lists them too: `c` for comment
mode (`@deckster/comments`, dev only), `v` to switch a live demo to its recording (`<AppFrame>` in
`@deckster/kit`) and `a` for the agent panel (`@deckster/agent`, with `deckster dev --agent`).

## The presenter window

Press `p`, or open the deck URL with `?presenter`. The window shows the current slide, the next one,
the speaker notes from `<Notes>`, a timer, the wall clock and pacing. Pacing compares the timer with
each slide's `budget` frontmatter (`budget: 30s`), fitted to the deck config's `duration` when it
has one (`src/presenter/pacing.ts`).

A slide with `hidden: true` is skipped by next, previous, Home and End, and reached from the sidebar,
the overview and go-to. The sidebar and the overview dim it and badge it "Hidden"; the presenter's
header says "hidden" on it and its next-slide preview is the next shown slide; numbers shown to the
presenter count every slide. Pacing leaves hidden slides out, so their budgets are not in the total
and `duration` is shared between the shown slides.

The two windows sync position, blackout and the laser over a `BroadcastChannel` named per deck
(`src/sync/sync-protocol.ts`). In the presenter window, Space, the arrows and PageUp/PageDown
always navigate unless a text field has focus, so a clicker never gets stuck on a focused button.
The presenter window closes itself when the audience window closes, but not when it reloads.

Inside `deckster present` (the Electron shell, see [docs/present.md](../../docs/present.md)) the shell
opens the presenter window on the other display, and a displays panel can move either window. The
package only imports the shell's types (`@deckster/shell/api`, `@deckster/shell/protocol`), never
`electron`.

## Exports

| Entry                            | What it is                                                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@deckster/presenter`            | The extension API for other plugins: `registerShortcut`, `listShortcuts`, `registerToolButton`, `listToolButtons`, `setSlideBadges`, `clearSlideBadges`, `windowKind`, and their types |
| `@deckster/presenter/runtime`    | The `DeckPlugin` itself (stage, overlay, key and pointer handlers). Listed in `DEFAULT_RUNTIME_PLUGINS` in `packages/vite-plugin/src/plugin.ts`                                        |
| `@deckster/presenter/tokens.css` | The `--dp-*` tokens for tool chrome, which `@deckster/comments` and `@deckster/agent` import for their own panels                                                                      |

## Adding a shortcut, a button or a badge

A plugin registers keys and buttons when its runtime module loads. This is how `@deckster/comments`
adds comment mode (`packages/comments/src/runtime.ts`):

```ts
import { registerShortcut, registerToolButton } from '@deckster/presenter';

registerShortcut({
  id: 'comments.mode',
  keys: ['c'],
  label: 'Comment mode: click an element to comment on it',
  group: 'Comments',
  window: 'audience',
  run: () => setCommentMode(),
});

registerToolButton({
  id: 'comments.mode',
  label: 'Comment mode',
  shortcut: 'c',
  icon: COMMENT_ICON, // SVG path strings for a 24x24 box
  order: 100,
  run: () => setCommentMode(),
  usePressed: () => useCommentsState().mode,
});
```

- Registering an id again replaces the earlier entry, so hot reload is safe. Both functions return
  a function that removes the entry.
- `registerShortcut` throws a `RangeError` naming both shortcuts when a key is already taken in a
  window both work in.
- `run` may return `false` to decline the press, so navigation or another shortcut handles it. A
  shortcut without `run` only documents a key the engine handles.
- Built-in buttons use `order` 10 to 50; a plugin's default is 100.
- `setSlideBadges('comments', { intro: [{ label: '3', title: '3 open comments', tone: 'accent' }] })`
  replaces every badge one source shows on the sidebar and overview thumbnails.

## Rules for changing this package

- Never add a `keydown` listener on `window` for a shortcut. Register it, or the help overlay will
  not list it and it will fight the engine's navigation.
- Style tool UI only with the `--dp-*` tokens in `src/styles/tokens.css`, under `.dp-ui`. Never read
  brand tokens: the tools must look the same over every brand. The laser is a fixed red with a white
  ring so it reads on any surface.
- Draw nothing in `?static` mode. `deckster shot`, `deckster lint` and `deckster export` render that mode and
  must never see the tools (`PresenterStage` and `PresenterOverlay` return early).
- Tool UI is marked `[data-deck-interactive]`, so clicks on it do not navigate. The `stage` wrapper
  must not be, or clicks on the slide stop navigating.
- Help, the overview, go-to and the displays panel are modal: focus moves in and back, and
  navigation keys do nothing behind them. While the screen is blacked out, the first navigation key
  uncovers it.
- Drag-to-reorder in the sidebar is dev only (`import.meta.env.DEV`). It posts to `/__deck/reorder`,
  which only the dev server mounts.

## Tests

Unit tests sit beside the code and run in happy-dom:

```sh
cd packages/presenter
pnpm exec vp test run
```

The browser tests are in the plugin suite, because they need a deck server:
`packages/vite-plugin/e2e/presenter-panels.e2e.ts`, `presenter-window.e2e.ts` and
`presenter-static.e2e.ts`. They read the popup through `window.open('', 'deck-presenter')`.
