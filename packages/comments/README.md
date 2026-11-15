# @deckster/comments

Review comments for deckster decks. A reviewer clicks an element on a slide in the dev server and
types a comment. The comment is saved next to the deck with the file, line and column that rendered
the element, so a person or an agent can fix it from the terminal. It only exists while serving:
builds, `deck shot`, `deck lint` and exports have no stamps, no overlay and no endpoint.

It is a workspace package (`private`, TypeScript source, not on npm).

## Leaving and reading comments

Start a deck and press `c` (or the speech bubble in the bottom-left tool cluster):

```sh
pnpm deck dev hello
```

In comment mode, hovering an element shows its source location. A click selects it, Alt-click or
Alt+Up/Down walks to the parent or child, a drag selects a region, and "Whole slide" in the toolbar
targets the slide. Tab and the arrow keys pick by keyboard, Enter selects. Cmd/Ctrl+Enter saves;
Escape closes the popover and keeps the draft. Comments show as numbered pins on their slide and
step, in a docked panel, and as open counts on the sidebar and overview thumbnails.

The `deck comments` command reads the same files without a browser:

```console
$ pnpm deck comments hello --json
{
  "deck": "hello",
  "deckDir": "decks/hello",
  "units": {
    "box": "canvas-px",
    "canvasWidth": 1920,
    "canvasHeight": 1080
  },
  "counts": {
    "open": 0,
    "resolved": 0
  },
  "comments": []
}
```

Each comment in that list has a `location` such as `decks/<deck>/slides/x.mdx:14:3`, an
`anchor.status` (`ok`, `moved`, `guessed`, `lost` or `none`) that says how far to trust the line,
the source excerpt around it and the path of a screenshot. `deck comments resolve`, `reopen`, `add`
and `prune` change them; `pnpm deck comments --help` describes every flag and the JSON shape.
`deck lint` warns `open-comments` for each slide that has open comments.

## Where comments live

Comments are committed with the deck:

| Path                                                 | Contents                                                                                                              |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `decks/<deck>/.feedback/<slide-id>.json`             | One slide's comments: two-space JSON, fields in schema order, oldest first, so a change diffs as the lines it touched |
| `decks/<deck>/.feedback/<slide-id>/<comment-id>.png` | The screenshot taken when the comment was added                                                                       |

A comment id is eight lowercase letters or digits; a slide id is kebab-case. The schema is
`src/model/comment-schema.ts` (`FEEDBACK_VERSION` 1, text up to 4000 characters, boxes in
1920x1080 canvas pixels). Comments are signed with `DECK_AUTHOR`, else `git config user.name`, else
`Reviewer`.

## How it works

| Part          | File                                                          | What it does                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source stamps | `src/vite/stamp-transform.ts`, `src/stamp/jsx-dev-runtime.ts` | Points the deck's own MDX, TSX and JSX modules at a stamping `jsx-dev-runtime`. The compilers already pass `jsxDEV` a source location, which React 19 ignores; the stamping runtime turns it into `data-deck-source="slides/x.mdx:14:3"`. Installed packages are never stamped |
| Endpoint      | `src/vite/feedback-middleware.ts`                             | `/__deck/comments`: GET returns the report, POST takes `{ action: add, update, resolve, reopen or delete }`, validated with Effect Schema, bodies over 64 KB get 413                                                                                                           |
| Screenshots   | `src/vite/comment-screenshots.ts`                             | Takes each new comment's PNG in headless Chromium (Playwright). A failure is a warning in the terminal; the comment is still saved                                                                                                                                             |
| Store         | `src/node/feedback-store.ts`                                  | Reads and writes feedback files under a lock file, renaming each write into place, so concurrent writers merge                                                                                                                                                                 |
| Anchors       | `src/node/anchor-match.ts`                                    | Finds the commented line again after the slide changes (the `anchor.status` above)                                                                                                                                                                                             |
| Overlay       | `src/overlay/`                                                | Comment mode, pins, the panel and badges; plain React, styled with `@deckster/presenter`'s `--dp-*` tokens                                                                                                                                                                     |

The endpoint and the agent socket share one guard: requests must come from loopback with a loopback
`Host`, no foreign `Origin`, and the dev session cookie the server sets on the deck page itself.
With `pnpm deck dev hello --port 5477` running, a request without the cookie is refused:

```console
$ curl -s -w ' %{http_code}\n' http://localhost:5477/__deck/comments
{"error":"Missing or wrong dev session cookie. Reload the deck page from its own URL."} 403
```

## Exports

| Entry                                | Used by                                                     | What it is                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@deckster/comments/vite`            | `deckViteConfig` in `@deckster/vite-plugin`                 | `commentsVitePlugin`: stamping, the endpoint, screenshots, feedback file watching. `apply: 'serve'`                                                                              |
| `@deckster/comments/runtime`         | `DEV_RUNTIME_PLUGINS` in `@deckster/vite-plugin`            | The overlay as a `DeckPlugin`; registers the `c` shortcut and the tool cluster button                                                                                            |
| `@deckster/comments/node`            | `@deckster/cli` (`deck comments`, `deck lint`)              | Reading, reporting and changing comments from Node: `buildCommentReport`, `saveNewComment`, `changeComment`, `pruneComments`, `openCommentCounts`, `commentAuthor` and the types |
| `@deckster/comments/picker`          | `@deckster/agent`'s chat panel                              | `pickElement`, `findStamped`, `useOpenComments`: picks an element through the comment overlay without creating a comment                                                         |
| `@deckster/comments/dev-session`     | `@deckster/vite-plugin`, `@deckster/agent`, `@deckster/cli` | The dev session cookie and `originRefusal`, shared by every page-facing dev endpoint                                                                                             |
| `@deckster/comments/jsx-dev-runtime` | the stamp transform                                         | The stamping `jsxDEV`                                                                                                                                                            |

## Rules for changing this package

- Nothing may reach a build or static mode. The Vite plugin is `apply: 'serve'`, the stamping
  runtime checks `?static` once at load, and the overlay and stage return early in static mode and
  in the presenter window. `deck shot`, `deck lint` and export read `?static` pages and must match a
  production build.
- Keep the request schema strict and the 64 KB cap. Slide and comment ids become paths, so
  `feedbackFile` and `screenshotFile` return `undefined` for any id of the wrong shape, and the store
  refuses a feedback folder or file that is a symbolic link.
- The overlay and everything under `src/overlay/` and `src/stamp/` run in the browser: plain React,
  no Effect. `src/node/` and `src/vite/` are Node code and use Effect.
- Register keys with `registerShortcut` from `@deckster/presenter`, never a `window` key listener.
- Feedback file changes are sent to open pages as a custom HMR event (`deck:comments-changed`)
  instead of reloading them.

## Tests

```sh
cd packages/comments
pnpm exec vp test run
```

The browser test is `packages/vite-plugin/e2e/comments.e2e.ts` in the plugin suite. It drives the
`comments` fixture deck in dev and as a build, and hello for the CLI round trip.
