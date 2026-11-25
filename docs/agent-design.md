# How the agent feature is built

[agent.md](agent.md) is the guide for people who use the chat panel. This page is for readers of
the code: how a turn runs, why it is built this way, what each provider's CLI is asked to do, and
what the design does and does not protect against. The
[package README](../packages/agent/README.md#source-layout) lists the files.

## Processes

```
deckster present hello --agent claude
 └─ CLI process (Node, Effect; one scope)
     ├─ Vite dev server            http://127.0.0.1:<port>/     slides, hot reload
     │    ├─ /__deck/agent         WebSocket: prompts in, events out
     │    └─ /__deck/mcp           MCP over HTTP: the deck tools
     ├─ AgentSessions              queue, journal, lint after a turn
     │    └─ one child per turn    claude -p … | codex exec …   (calls /__deck/mcp)
     └─ DeckShell                  child: the Electron binary, JSON lines on stdio
          ├─ audience window       loads /   (the chat panel is part of the page)
          └─ presenter window
```

The CLI owns the dev server, the agent host and the deck MCP server. The Electron shell only shows
windows. So the panel works the same with plain `deckster dev --agent` in a browser.

The agent endpoints, the MCP server and the panel exist only while a dev server runs with
`--agent` (or `--mcp` for the MCP server alone). They are never part of `?static`, a build, an
export or `deckster present --built`.

## Why the provider's own CLI

A turn spawns the `claude` or `codex` binary the person installed, one process per turn, resumed
by the provider's session id.

- The framework bundles no model and no SDK. A turn uses the login the person already has.
- Cancelling is a signal to a process group. Nothing of the turn stays in the CLI's own process.
- Each provider is a small adapter (`packages/agent/src/providers/<id>/`): a pure function that
  builds the command line, a line parser that turns the provider's JSONL into the framework's
  events, and a function that reads how the process ended. The panel, the journal and the lint
  step are the same for both.

Each adapter is written against recorded transcripts of the real CLI
(`packages/agent/fixtures/transcripts/`, Claude Code 2.1.325 and Codex 0.167.2). Flags and event
shapes change between releases, so the parsers ignore events they do not know, and
`deckster agent doctor` adds a note when the installed version is outside the tested line.

Custom tools reach a spawned agent through MCP. The dev server hosts the deck tools at
`/__deck/mcp`, so the same tools serve the panel's agent and any agent a person runs in a terminal
(`deckster mcp <deck>` prints the configuration).

## The Claude Code invocation

`claudeInvocation` (`providers/claude/invocation.ts`) runs `claude -p` from the workspace root with
the prompt on stdin. What each part is for:

- `--output-format stream-json --verbose --include-partial-messages` streams events as JSONL,
  text deltas included.
- `--session-id <uuid>` names the first turn's session; later turns pass `--resume <uuid>`.
- `--permission-mode dontAsk` refuses every tool call that no allow rule covers. There is nobody
  to ask in a headless run.
- `--tools "Read,Glob,Grep,Edit,Write"` limits the built-in tools. Without it Claude Code offers
  many more (sub-agents, workflows, tool search). With no tool search, the MCP tools load directly.
- `--allowedTools` holds one `Edit(/<working copy>/<folder>/**/*.<ext>)` rule per content folder
  and extension, plus `mcp__deck__*`. An `Edit(...)` rule governs the Write tool too; a `Write(...)`
  rule never matches. A leading `/` anchors the pattern at the working directory.
- `--disallowedTools` denies edits under `/decks/**`, `/brands/**`, any `deck.config.ts`, any
  `.css` file and `/.claude/**`, and the `Skill` tool. Deny wins over allow.
- `Skill` is not offered. A skill's `allowed-tools` grants tools while the skill runs, which would
  widen the edit rules.
- `--setting-sources ""` loads no settings file. A project's `.claude/settings.json` could add
  allow rules or hooks.
- `--mcp-config <file> --strict-mcp-config` names the deck MCP server and nothing else. The file
  holds the bearer token, is written with mode 0600, and exists only while the turn runs. The
  token never goes on the command line, where `ps` would show it.
- `--append-system-prompt` carries the standing rules. Claude Code keeps the first system prompt
  of a conversation, so anything that changes per turn (the working copy's path) goes in the
  prompt, never in the standing rules.
- With a screenshot, `--input-format stream-json` is added and stdin is one user message with a
  text block and a base64 image block.
- `--agent-web` adds `WebSearch` and `WebFetch` to both `--tools` and `--allowedTools`. `dontAsk`
  refuses a tool that is offered but not allowed, so it needs both.

The child's environment is an allow list (`providers/child-env.ts`): the search path, the home
folder, locale and proxy settings, and the provider's own sign-in variables. Nothing else from the
parent reaches it. That keeps one provider's secrets from the other, and keeps the `CLAUDE_CODE_*`
variables out when the deck CLI itself runs inside Claude Code.

Behaviour the parser and classifier depend on:

- A refused edit arrives as a `system` event of subtype `permission_denied` and an error tool
  result. The panel marks the call as denied.
- A `result` is a failure when `is_error` is true, whatever its `subtype`. A `terminal_reason` of
  `aborted_streaming` is a cancel.
- `total_cost_usd` is cumulative for the session. A turn's cost is the difference from the last
  total.
- SIGINT to the process group ends the turn with exit 0 and a `result`, and the session resumes
  cleanly. SIGTERM ends it with no `result`.
- A wrong MCP token does not fail the run. The server is reported as failed in the `init` event
  and the turn continues without the deck tools.
- Sign-in is checked with `claude auth status --json`. The doctor never prints the account's
  e-mail address.

## The Codex invocation

`codexInvocation` (`providers/codex/invocation.ts`) runs `codex exec --json` from the workspace
root. `exec` has no system prompt option, so the standing rules come first on stdin, then the
prompt.

- `-C <working copy>/slides -s workspace-write` and `--add-dir` for the working copy's `assets/`
  and `public/` make those three folders the only places the sandbox lets Codex write. This covers
  its patch tool and its shell alike.
- `sandbox_workspace_write.exclude_slash_tmp` and `exclude_tmpdir_env_var` are set because `/tmp`
  and `$TMPDIR` are writable by default. The sandbox has no network.
- The shell stays on. Codex edits with its patch tool but reads files through shell commands;
  without the shell it can read nothing.
- `approval_policy="never"`: `exec` has no interactive approvals. MCP calls then need
  `mcp_servers.deck.default_tools_approval_mode="approve"`, or each call fails for want of an
  approval.
- `mcp_servers.deck.required=true` makes a wrong token fail the turn at once with the reason on
  stderr. Without it the tools are dropped silently.
- The token is passed in the child's environment (`bearer_token_env_var`), never as an argument.
- `--ignore-user-config` and `--ignore-rules` keep the person's own MCP servers, plugins, hooks
  and rules out of a turn. Ignoring the config also drops the person's model, so the adapter reads
  `model` from `$CODEX_HOME/config.toml` and passes it with `-m` unless `--agent-model` names one.
- `project_root_markers=["pnpm-workspace.yaml"]` lets Codex find the workspace root from the
  working copy, and `project_doc_max_bytes=131072` lifts its default 32 KiB limit so an `AGENTS.md`
  there, if one is added, is read whole.
- Features a turn does not need are disabled one by one (`--disable plugins`, `apps`,
  `multi_agent`, `hooks` and so on).
- `resume <thread_id>` comes after every `exec` flag, and every flag is repeated on every turn.
- `web_search` is `"disabled"`, or `"live"` with `--agent-web`. The sandbox keeps no network
  either way.

Behaviour the parser and classifier depend on:

- There is no partial text. An `agent_message` arrives complete, so the panel shows whole
  messages. `turn.completed` carries token usage and no cost.
- A failed nested tool call can be missing from the stream. Changed files are therefore never
  taken from `file_change` items alone: the journal records what the sync brought into the deck.
- SIGINT ends the process with exit 1 and nothing more on stdout, and the thread resumes. An exit
  without `turn.completed` after a cancel is a cancel. A non-zero exit with no stdout is a start-up
  failure whose reason is on stderr.
- Sign-in is checked with `codex login status` (exit 0 when signed in).

Both providers are stopped the same way: SIGINT to the process group, SIGTERM two seconds later,
then SIGKILL.

## What a turn may change

A turn may create, change or delete only the deck's content: slide files (`.mdx`, `.tsx`) in
`slides/`, and media and data in `assets/` and `public/`. The slide list changes only through the
`new_slide`, `reorder_slides` and `remove_slide` deck tools, which write `deck.config.ts`
themselves. There is one scope and no flag to widen it.

Everything else is code that Node runs or that decides what Node runs: the deck config, the brand,
code layouts (`layouts/<name>/` in the deck or the brand), helper modules, and stylesheets. A stylesheet counts because Tailwind can load JavaScript from one
(`@plugin`, `@config`), also through an `@import` that Vite never sees. Slides are compiled for the
browser and never run in Node.

## Rules and sandboxes

The two providers are limited in different ways, and the design does not rely on either alone.

- **Codex has a sandbox.** The operating system refuses its writes outside the three folders of
  the working copy. That includes `.deck/` (the journal, the turn record, the token) and any
  process its shell leaves running.
- **Claude has rules.** Its limits are permission rules that Claude Code itself enforces. They are
  not a sandbox. `pnpm --filter @deckster/agent verify:claude` runs real turns against them.

So the framework adds its own layers, the same for both providers:

1. **The provider never writes in the deck.** Each turn gets a fresh working copy under
   `.deck/agent/<deck>/work/` that holds clones of the content files only. The provider's limits
   name only that folder. It reads everything else from the repository, which it cannot write.
2. **The sync is the one way content enters the deck.** The framework copies plain content files
   from the working copy into the deck: every second while the provider runs, before each deck
   tool that reads the deck, and once more when the turn ends, however it ended. Links, FIFOs,
   sockets, devices, hard links, unsafe names and oversized files are ignored and reported.
3. **Everything else is compared.** Before the turn the framework reads every other file of the
   deck and of its brand. After the turn it compares them by content and puts back any that
   changed. This is the layer that covers Claude's rules failing.
4. **Code is not loaded during a turn.** From before the provider starts until that comparison is
   done, the dev server never imports the deck's config or brand, nor the `contract.ts` or
   `limits.ts` of a code layout in either: each keeps the value it had before the turn, and one
   never loaded is `layout-held`. A change cannot run before it is put back.
5. **Tailwind loads no JavaScript.** `globalThis.__tw_load` is a read-only function that throws,
   installed before any command runs.
6. **Nothing is loaded from `.deck/`.** The dev server does not serve it, does not watch it and
   refuses to load a module from it.

### Why a working copy

A simpler design lets the provider write in the real deck and restores what is not content
afterwards. It cannot be made safe. A process that a provider's shell leaves behind in its own
session keeps writing after the turn. It can swap a folder for a link while the restore runs, so
that a restore, a delete or an undo that works by path lands outside the deck. What it writes
after the restore becomes the next turn's starting point.

With a working copy those writes land in a folder that is never read again. When a turn ends the
working copy is renamed into `retired/` and deleted with `/bin/rm -rf`, whose traversal does not
follow a link swapped in during the delete. The next turn starts from the deck as it is.

The sync reads each file through a descriptor opened with `O_NOFOLLOW | O_NONBLOCK` and checks on
the descriptor that it is the regular, single-link file the walk saw. A swap can at worst make it
read another file the provider could read anyway. A FIFO cannot block it. The walk is bounded
(2000 files, 256 MB a file, 2 GB in all, 16 folders deep), so a turn cannot stall the host.

An unchanged file is recognised by its `lstat` signature (device, inode, size, and modification
and change times in nanoseconds). No write leaves the change time as it was, so a sync costs only
the files that changed.

### The turn record and recovery

Every change the sync makes is written to an in-flight record (`.deck/agent/<deck>/turn-guard.json`)
before it is made, with hashes and with the earlier bytes in a blob store. Both are in a place no
provider can write.

If the CLI is killed during a turn, the next command that loads the deck or its brand finishes the
turn first, before it imports anything. The working copy is discarded and never synced. Each
recorded content change is undone unless the file changed since. The other files are put back from
the record. Every byte installed is checked against its recorded hash.

The brand that is guarded comes from `--brand` or the deck config. It never comes from the page,
which slide code controls.

### Undo

The journal records what the framework changed in the deck, never what the provider reported. An
undo or redo writes only content files (and the slide list, and only as a data-only config),
checks each image against its hash, and checks each target's folder again right before the rename.

## Prompts

Text that comes from the repository or the page (slide text, notes, comments, a selection, tool
results) reaches the agent inside `<deck-data>` blocks. The standing rules call it content and
never instructions. This is a rule the model is asked to follow. It lowers the risk of a slide's
text steering a turn and does not remove it. The layers above are what bound the damage.

The slide file a turn edits is resolved from the deck's manifest by slide id, never from a path
the page sends.

## After a turn

The deck is linted through the running dev server and compared with a baseline taken before the
turn. Findings that were there before are kept apart. Errors the turn brought start one automatic
follow-up turn, and only one.

## Accepted limits

- **Slide code runs in the page.** A slide the agent wrote can call the page endpoints with the
  dev session: the agent socket, `/__deck/comments` and `/__deck/reorder`. Through them it can do
  what the panel can, add or change review comments, and reorder slides. These are data edits made
  by the framework, never code, but they are changes to the repository. See the trust model in
  [agent.md](agent.md).
- **Data can leave through a slide.** Both providers can read every file the person can read, and
  a slide's page has network access. Turning web access off limits the provider process only.
- **A program running as the same user** can open the page and get the dev session cookie, as it
  could read the person's files.
- **Writes into the real deck check, then act by path.** Node has no `openat`, `renameat` or
  `unlinkat`. The framework checks a folder's real path and then renames into it. No provider can
  write there, which is what makes the gap between the two steps harmless.
- **Claude's limits are rules.** See above. The comparison after the turn and the hold on loading
  code are there for this reason.
- **A contract already running is not stopped.** A turn that begins while a code layout's contract
  is loading keeps it from loading any more modules, and what it returns is dropped, but code of it
  that is already running after an `await` runs on. The same holds for a contract still running at
  the 10-second deadline all contracts of one load share.
- **Codex streams whole messages** in `exec` mode, and has no interactive approvals there.
- **One turn at a time per deck.** A second host for the same deck refuses to start.
- **A hand edit during a turn wins** for content files, and is put back for files that are not
  content.
