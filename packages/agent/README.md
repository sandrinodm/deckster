# @deckster/agent

The agent tooling of deckster: the deck MCP server, the host that runs your own `claude` or
`codex` CLI one turn at a time, and the chat panel that sits beside the slide in `deck dev`.

It is a private workspace package (`workspace:*`, TypeScript source, nothing built or published).
`@deckster/cli` is its only runtime consumer; `@deckster/vite-plugin` lists it as a dev dependency for its e2e suite.

- Using the panel: [docs/agent.md](../../docs/agent.md).
- How a turn runs, what each provider is asked to do, and the trust model:
  [docs/agent-design.md](../../docs/agent-design.md).

## Try it

From the repository root, check both CLIs first. The doctor runs `--version` and the provider's
sign-in check, never a turn:

```console
$ pnpm deck agent doctor
Claude Code 2.1.325: signed in with claude.ai (max)
Codex 0.169.0: signed in with ChatGPT
  Note: Codex 0.169.0 is installed; the adapter was tested with 0.167.x (recorded with 0.167.2). If turns fail, check the recorded transcripts against this version.

The agent edits only the deck's content: slide files (.mdx, .tsx) in slides/ and media and data in assets/ and public/, in a working copy the editor copies into the deck; the slide list changes only through the deck tools, and anything else it writes is ignored.
```

Then start a deck with the panel (`a` toggles it), or serve only the MCP tools for an agent you
run in a terminal:

```sh
pnpm deck dev hello --agent claude      # or --agent codex; --agent-web, --agent-model, --agent-panel bottom
pnpm deck dev hello --mcp               # MCP endpoint only, at /__deck/mcp on 127.0.0.1
pnpm deck mcp hello                     # prints .mcp.json, `claude mcp add` and Codex config.toml for it
```

`deck present <deck> --agent claude` puts the same panel in the desktop window. The agent is
whatever `claude` or `codex` binary is on your `PATH`, run with your own login. The package
bundles no model and no SDK.

## What a turn can change

A turn may create, change or delete only the deck's content. The list is `CONTENT_FOLDERS` in
`@deckster/brand/node` (`packages/brand/src/node/content-policy.ts`):

| Folder of `decks/<deck>/` | Extensions                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `slides/`                 | `mdx`, `tsx`                                                                                                                       |
| `assets/`, `public/`      | `png`, `jpg`, `jpeg`, `gif`, `webp`, `avif`, `svg`, `webm`, `mp4`, `mov`, `m4v`, `mp3`, `m4a`, `wav`, `ogg`, `opus`, `json`, `csv` |

The slide list in `deck.config.ts` changes only through three MCP tools, `new_slide`,
`reorder_slides` and `remove_slide`, which write the config themselves. The `comments` tool can
list review comments and resolve one. There is no flag that widens the scope.

A turn cannot change anything else: not `deck.config.ts` by hand, `package.json`, `tsconfig.json`,
any stylesheet, `.ts` helper modules, `apps/`, `lib/`, `.feedback/`, fonts, brands, packages or
anything outside the deck. How that holds:

- The provider never writes in the deck. Each turn gets a fresh working copy under
  `.deck/agent/<deck>/work/` holding clones of the content files only, and the provider's limits
  name only that folder. Codex gets it through its OS sandbox (`-C <work>/slides`, `--add-dir` for
  `assets/` and `public/`, no network). Claude gets it through permission rules (`Edit(...)` allow
  rules per folder and extension, deny rules for `decks/`, `brands/`, the config, `*.css` and
  `.claude/`, no `Skill`, `--setting-sources ""`). Claude's limits are rules, not a sandbox.
- The sync is the only way content enters the deck: every second while the provider runs, before
  each deck tool that reads the deck, and once more when the turn ends. It takes plain content
  files only; links, FIFOs, hard links, unsafe names and oversized files are ignored and reported
  to the panel.
- After the turn every other file of the deck and of its brand is compared with a record taken
  before it, and anything that changed is put back (a copy goes to `.deck/agent/<deck>/reverted/`).
  Until then the dev server does not import the deck's config or brand.
- A hand edit you make to a content file during a turn wins over the agent's change to it.

What a turn can still do, by design or as an accepted limit (both are spelled out in
[docs/agent.md](../../docs/agent.md#trust-model)):

- Slides are TSX and MDX that run in your browser, so a turn changes code the page runs. Slide code
  has the page's dev session and can call the page endpoints: send prompts, add or resolve
  comments under any name, reorder slides.
- Both providers can read every file you can read. Claude's tools are `Read`, `Glob`, `Grep`,
  `Edit` and `Write`; Codex reads through its shell. Web tools are off unless you pass
  `--agent-web`, but data the agent read can still leave through a slide it writes (an image
  address or a fetch runs when the page opens).

The guard itself (working copy, sync, record, code gate, crash recovery) lives in
`@deckster/brand/node` (`turn-guard.ts`, `turn-staging.ts`, `code-gate.ts`), because `loadDeck` and
`loadBrand` must finish an interrupted turn before they import anything. This package calls it from
`src/session/agent-sessions.ts`.

## Exports

| Import                             | What it is                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `@deckster/agent/vite`             | `deckMcpPlugin` (the `/__deck/mcp` endpoint) and `MCP_RUNTIME_PLUGIN`                  |
| `@deckster/agent/mcp`              | `DeckTools`, the `Context.Service` behind the ten MCP tools, and its result types      |
| `@deckster/agent/server-info`      | `publishServerInfo`, `readServerInfo`, `makeToken` (`.deck/agent/<deck>/server.json`)  |
| `@deckster/agent/page-link`        | `createPageLink`: the last slide and step each open page reported                      |
| `@deckster/agent/page-link-events` | The HMR event names and payloads the page link uses                                    |
| `@deckster/agent/runtime`          | The page side of the page link (a runtime plugin, loaded by path)                      |
| `@deckster/agent/sessions`         | `makeAgentSessions` and the `AgentSessions` service: queue, journal, lint after a turn |
| `@deckster/agent/agent-vite`       | `deckAgentPlugin` (the `/__deck/agent` WebSocket) and `AGENT_RUNTIME_PLUGIN`           |
| `@deckster/agent/agent-runtime`    | The chat panel, a `DeckPlugin` (plain React)                                           |
| `@deckster/agent/agent-connection` | `connectAgent`, the reconnecting browser client for the socket                         |
| `@deckster/agent/providers`        | `PROVIDERS`, `PUBLIC_PROVIDERS`, `resolveProvider` and the `AgentProvider` type        |
| `@deckster/agent/protocol`         | Event and client message schemas, endpoint paths, `agentDir`                           |
| `@deckster/agent/protocol/events`  | The same event types as plain TypeScript, for browser code                             |
| `@deckster/agent/errors`           | `AgentError` and its factory `agentError`                                              |
| `@deckster/agent/watchdog`         | `startWatchdog`: a detached process that cleans up if the CLI is SIGKILLed             |
| `@deckster/agent/cleanup`          | The registry of provider process groups and token files the exit hook removes          |

`packages/cli/src/server/dev-server.ts` wires it all together. Trimmed:

```ts
import { AGENT_RUNTIME_PLUGIN, deckAgentPlugin } from '@deckster/agent/agent-vite';
import { makeAgentSessions } from '@deckster/agent/sessions';
import { deckMcpPlugin, MCP_RUNTIME_PLUGIN } from '@deckster/agent/vite';

const sessions =
  yield *
  makeAgentSessions({
    workspaceRoot,
    deck,
    brand,
    provider,
    model,
    web,
    panel,
    mcp: () => ({ url: `http://127.0.0.1:${port}${MCP_PATH}`, token }),
  }).pipe(Effect.provide([NodeServices.layer, DeckTools.layerFrom(tools)]));

const config = mergeConfig(
  deckViteConfig({
    workspaceRoot,
    deck,
    devRuntimePlugins: [...DEV_RUNTIME_PLUGINS, MCP_RUNTIME_PLUGIN, AGENT_RUNTIME_PLUGIN],
  }),
  {
    plugins: [
      deckMcpPlugin({ tools, token, pageLink }),
      deckAgentPlugin({ sessions, provider, panel }),
    ],
  },
);
```

`@deckster/agent` never imports the CLI. The live `DeckTools` (lint, outline and screenshots through
the running dev server) is `packages/cli/src/agent/deck-tools-live.ts`.

## Source layout

| Folder           | Contents                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/mcp/`       | MCP handler, tool schemas (`tool-schemas.ts`, one source for the JSON Schema and the check), `register-tools.ts`, page link, `fakeDeckTools()`                                                           |
| `src/providers/` | One folder per provider: `invocation.ts` (pure command line), `parse-line.ts` (JSONL to events, never throws), `classify.ts` (reads the exit), `doctor.ts`; `child-env.ts` is the environment allow list |
| `src/process/`   | `runTurn` (one detached child per turn, idle 2 min and total 10 min limits, SIGINT then SIGTERM then SIGKILL), watchdog, cleanup registry                                                                |
| `src/session/`   | `AgentSessions`, the host lock (one host per deck), lint after a turn                                                                                                                                    |
| `src/journal/`   | Undo and redo of the last 50 turns, line diffs for the panel                                                                                                                                             |
| `src/prompt/`    | Standing rules and the per-turn prompt (`<deck-data>` blocks)                                                                                                                                            |
| `src/protocol/`  | Events (Effect Schema) and their plain-type twin                                                                                                                                                         |
| `src/vite/`      | The two Vite plugins and the WebSocket server                                                                                                                                                            |
| `src/runtime/`   | Browser code: the panel, its pure reducer (`agent-store.ts`), the page link                                                                                                                              |
| `fixtures/`      | Recorded transcripts (Claude Code 2.1.325, Codex 0.167.2) that `src/providers/fake/fake-agent.fixture.ts` replays                                                                                        |

## Tests

Unit tests sit beside the code. From `packages/agent`:

```sh
pnpm exec vp test run src/providers/invocation.test.ts src/runtime/agent-store.test.ts
```

`pnpm test` at the root runs every package, this one included. The browser tests are in the
plugin suite: `packages/vite-plugin/e2e/agent.e2e.ts` and `agent-panel.e2e.ts`, both on the fake
provider. `--agent fake` replays recorded Claude transcripts and is refused by the CLI unless
`DECK_TEST_FAKE_AGENT=1` is set (the CLI's test config sets it).

The `verify:claude` and `verify:codex` scripts in `package.json` run one real edit turn and one
resumed turn against a temporary copy of `hello`. They spend your quota and are not part of
`pnpm ready`.

## Changing this package

- Browser code (`src/runtime/`) is plain React with no Effect. The panel uses the presenter's
  `--dp-*` tokens only, with the `da-` class prefix, never brand tokens.
- Node code is Effect v4: `Effect.fn` with `Effect.fn.Return`, errors through `agentError`.
- Add a provider: record real transcripts into `fixtures/transcripts/`, write the four files in
  `src/providers/<id>/` against them, add it to `PROVIDERS` and `PUBLIC_PROVIDERS`, and give it
  parse, classify and invocation snapshot tests like the others.
- Add an MCP tool: extend `DeckToolsApi`, `tool-schemas.ts` and `register-tools.ts`, then
  implement it in `packages/cli/src/agent/deck-tools-live.ts` and `fakeDeckTools()`.
- Add an event: change `src/protocol/events.ts` and `agent-events.ts` together; a compile-time
  check in `events.ts` fails when they differ. A new transcript item also needs a case in
  `applyEvent`, `ItemRow` (`transcript.tsx`) and `agent-store.test.ts`.
- Anything that changes per turn (the working copy's path) goes in the prompt, never in the
  standing rules: Claude Code keeps the first system prompt of a conversation.
- Text from the repository or the page reaches the agent only inside `<deck-data>` blocks.
- The slide file a turn edits is resolved from the manifest by slide id, and the guarded brand
  from `--brand` or the deck config. Neither ever comes from the page.

## License

MIT, see [LICENSE](../../LICENSE).
