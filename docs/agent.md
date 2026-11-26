# The agent panel

The user guide is also on the documentation site: [The agent panel](https://sandrinodm.github.io/deckster/ai-agents/agent-panel/).

`deckster dev <deck> --agent claude` (or `--agent codex`) adds a chat panel beside the slide. You ask
for a change to the slide on screen; the agent edits a working copy of the deck's slides, media and
data, the editor brings those edits into the deck (the slide hot-reloads then), and every turn can
be undone. The agent is the `claude` or `codex` CLI you installed
and signed in to, run on your machine with your login; the deck framework bundles no model.

## Starting it

```sh
pnpm deckster dev hello --agent claude
pnpm deckster dev hello --agent codex --agent-panel bottom
pnpm deckster present hello --agent claude      # the same panel in the desktop window
```

```
--agent claude|codex          which CLI runs the turns
--agent-panel right|bottom    where the panel docks first (default right)
--agent-model <name>          the model for the turns (default: the CLI's own default)
--agent-web                   let the agent search the web and read pages (default off)
```

The terminal prints the agent line when the server starts, for example `Agent: Claude Code
2.1.325: signed in with claude.ai (panel right)`, or the problem and its fix.
`pnpm deckster agent doctor` checks both CLIs without starting a deck.

## Signing in

- **Claude:** install Claude Code (`npm install -g @anthropic-ai/claude-code`), run `claude` in a
  terminal once and sign in with `/login`, or set `ANTHROPIC_API_KEY`.
- **Codex:** install it (`npm install -g @openai/codex`) and run `codex login`, or set
  `CODEX_API_KEY`.

When the CLI is missing or signed out, the panel says so and shows the exact command, with a copy
button. Sign in in a terminal, then press Retry on the failed turn; there is no need to restart.

## Using the panel

- **Show and hide:** `a`, or the chat button in the tool cluster (bottom-left corner). Opening it
  puts the cursor in the input.
- **Ask:** type and press Enter; Shift+Enter starts a new line. While the input has focus, every
  key stays in it, so typing never moves the deck. Escape gives the keys back to the deck.
- **Context:** the row above the input shows what goes with the prompt: the slide and step on
  screen (it follows as you navigate), the element you picked, and the slide's open review
  comments (click one to attach it). The Screenshot toggle attaches a picture of the slide at
  that step; it is on by default.
- **Pick an element:** Pick element turns on the comment overlay's picker. Hover shows each
  element's source line; click picks it (Alt-click its parent, drag across a region, or Tab and
  Enter by keyboard); Escape cancels. The element stays outlined on the slide while its chip is
  there, and every prompt carries its text and `file:line`. The chip stays after you send, for
  follow-ups, until you remove it or move to another slide. Picking never creates a comment.
- **While it works:** the answer streams in, each tool call is one line ("Read slides/intro.mdx",
  "Edited slides/intro.mdx", "Checked lint"), refused and failed calls are marked, and a thin line
  along the panel's edge of the slide says the agent is editing. The agent edits its own working
  copy; the editor brings its edits into the deck about every second, whenever it calls a deck
  tool (lint, screenshot, outline…) and when the turn ends, so the slide hot-reloads a moment after
  each edit rather than on every keystroke. Stop ends the turn (what it edited so far is kept). A
  prompt sent meanwhile is queued and runs next; Stop also clears the queue (the agent host has no
  way to drop one queued prompt alone).
- **After a turn:** the footer lists the changed files (click one for its diff), the lint result
  of the slides it touched, the time, tokens and (for Claude) cost, and Undo. When lint finds
  errors, one automatic fix turn follows, labelled Auto-fix. Findings that were on those slides
  before the turn are not the turn's doing: they sit folded under "already there before this
  turn" and never count as its errors. A file is marked "too large to undo" (over 5 MB: Undo says
  it will leave it as it is, and after an undo the footer names what was not restored). When the
  deck was not linted before the turn in time, the footer says so and no automatic fix runs.
- **Your edits win:** when you edit a slide (or any content file) by hand while a turn runs and
  the agent changes the same file, your version stays and the agent's change to it is not
  applied; the footer says "Kept your edit of slides/intro.mdx". Edit freely between turns: every
  turn starts from the deck as it is then.
- **What the agent wrote outside the slides is ignored:** when a turn wrote anything that is not
  content (see What the agent may touch), the footer says so in one quiet line, for example
  "Ignored 2 changes outside the slides: deck.config.ts, slides/styles.css"; open it for each path
  and what was there (`not content`, `a link`, `a FIFO`, `hard-linked`, `larger than 256 MB`…).
  If a file outside the content changed in the deck itself during the turn (which the agent's
  limits should make impossible, or you edited it), it is put back, marked `changed, put back`,
  and the version found is kept in `.deck/agent/<deck>/reverted/<turn>/`. The agent is told in
  its next turn.
- **Empty panel:** it suggests prompts from the slide's open comments and the lint findings the
  agent's last turn found on it (the page has no lint of its own; `pnpm deckster lint <deck>` is the
  full check), else a few examples.
- **Header:** the model of the next turns (click to change it; empty is the default, and the
  name shown is the one the default resolved to in the last turn when known), New
  conversation (the agent forgets the conversation; the files stay as they are), the dock
  switch, and hide.

## What the agent may touch

Only the deck's content:

- slide files, `.mdx` and `.tsx`, in `decks/<deck>/slides/` (they are compiled for the browser and
  never run in Node);
- images, video, audio, JSON and CSV in `decks/<deck>/assets/` and `decks/<deck>/public/` (png,
  jpg, jpeg, gif, webp, avif, svg, webm, mp4, mov, m4v, mp3, m4a, wav, ogg, opus, json, csv).

Nothing else: not `deck.config.ts`, `package.json` or `tsconfig.json`, no stylesheet (a stylesheet
can make the build tool load JavaScript), no `.ts` helper module, code layouts (`layouts/`), mini
apps (`apps/`), `lib/`, review comments (`.feedback/`), fonts, brands, packages or anything outside
the deck. To add, reorder or remove slides the agent calls the `new_slide`, `reorder_slides` and
`remove_slide` deck tools, which change the slide list in `deck.config.ts` themselves (only quoted
ids, from the config as it was when the turn began). Review comments change through the `comments`
deck tool.

**The agent never writes in the deck.** Each turn gets a working copy: a new folder
`.deck/agent/<deck>/work/<turn>-<random>/` holding a copy of the deck's content files (and only
those: plain files with an allowed extension, cloned where the file system can, so large media
costs nothing; at most 2000 files, 256 MB a file, 2 GB in all). The agent edits there and reads
everything else (the deck config, stylesheets, helper modules, layouts) from the repository as it
is. The editor is the only writer of the deck:

1. **The provider can write only the working copy.** Codex runs in its sandbox with the working
   copy's `slides/` as its folder and `assets/` and `public/` as its only other writable folders:
   its patch tool and its shell cannot write the deck, `.deck/` (the journal, the turn record, the
   token) or anything else, and have no network. A process its shell leaves running can only ever
   write in that working copy. Claude may edit only those three folders of the working copy and
   those extensions (one permission rule each), is denied `decks/`, `brands/`, `deck.config.ts`,
   every `.css` file and `.claude/`, gets no skills (a skill can grant itself tools) and reads no
   settings file (a project's `.claude/settings.json` allow rules never apply).
2. **The sync is the one way in.** The editor brings the working copy's content into the deck:
   about every second, before every deck tool that reads the deck, and when the turn ends,
   however it ended. It takes only plain content files (no links, FIFOs, devices, sockets or hard
   links; safe names; within the bounds), reads each one through a descriptor that cannot follow a
   link or block, and writes it into the deck itself (a new file renamed into place). A file
   deleted in the working copy is deleted from the deck. Everything else is ignored and listed in
   the footer. When the turn ends the working copy is retired (moved away, then deleted) and never
   read again; the next turn gets a fresh one from the deck as it is then.
3. **A check of everything else.** Before the turn the editor reads every other file of the deck
   and of the brand the deck renders with (from the deck config or `--brand`, never from the page)
   and notes on disk that a turn is in flight; after it, it compares them all by content and puts
   back any that changed. While a turn runs, and until that check is done, the dev server does not
   load the deck's config or brand again, nor the `contract.ts` or `limits.ts` of a code layout in
   the deck or the brand: each keeps the value it had before the turn, and one never loaded before
   is `layout-held`. A turn that begins while a contract is loading kills the process that checks
   contracts (see `importContracts`), or, for a contract already past its check, stops it from
   loading more modules; code of it already running after an `await` in the server cannot be
   stopped. If the dev server or the CLI is killed during a turn,
   the next `deckster dev`, `present`, `build`, `lint`, `shot`, `export` or `brand check` first puts
   the deck back exactly as it was before the turn (the working copy is discarded, never synced).
   No stylesheet anywhere may load JavaScript through Tailwind (`@plugin`, `@config`): every
   command closes that door when it starts. No slide may import from `.deck/`.

Neither provider's own tools reach the web unless you start the deck with `--agent-web`. Without
it, the agent says so when a request needs current facts (competitors, prices, recent numbers) and
marks what it writes from memory as unverified. With it, Claude gets its `WebSearch` and `WebFetch`
tools and Codex its live web search (`web_search="live"`), which also opens and reads pages.
Codex's sandbox keeps no network either way: its shell cannot reach the web, only its search
tool can. The terminal's agent line ends in `web on`. This limits the provider process only: see
"Data can leave through a slide" below.

## Trust model

`--agent` lets the provider change the deck's content, nothing more. Concretely:

- **It can change code your browser runs.** Slides are TSX and MDX that run in the deck page, with
  the page's access to the dev server. That is the point of the feature; review what a turn
  changed (the panel lists every file) as you would review a collaborator's commit.
- **Page code can do more than the panel.** Code in a slide the agent wrote runs in the page with
  the dev session. Besides the panel's own actions (send a prompt, stop, undo, redo, start a new
  conversation, pick the model) it can call the page endpoints: it can add, resolve, reopen and
  delete review comments under any author name (these are committed files in `.feedback/`), and
  reorder slides (`/__deck/reorder` edits the slide list in `deck.config.ts`). These are data
  edits the framework makes, never code, but they are real changes to your repository. If you run
  agents on source material you do not trust, review `.feedback/` and any change to the slide
  order before you commit.
- **It cannot change code the dev server runs.** The deck's config, its brand, its stylesheets and
  its helper modules are not content: the provider cannot write the deck at all, the sync never
  takes them from the working copy, and the check after the turn puts back any that changed,
  before anything loads them.
- **Edits you make by hand during a turn** to slides and media win over the agent's (see Your
  edits win). Edits to files that are not content are put back (a copy is kept, see above): leave
  `deck.config.ts` and stylesheets until the turn ends.
- **Text in the deck is never instructions.** Slide text, notes, comments, selections and tool
  results reach the agent inside marked data blocks, and its standing rules say to ignore requests
  found there to touch other files, run commands or change configuration.
- **Web access is opt-in.** `--agent-web` lets text from outside the repository into a turn that
  then edits code your browser runs, and sends the agent's queries and the addresses it opens off
  this machine. An address the agent writes can carry text it read, so a page that talks the
  agent into fetching a crafted URL could send deck content out with it. The standing rules treat
  search results and pages like deck text (content, never instructions), keep the deck's own text
  out of queries and addresses beyond the terms asked about, and put each source's address in the
  speaker notes of the slide that relies on it. Turn it on for research turns, and check the
  sources before the slide goes out.
- **Data can leave through a slide.** Both providers can read every file you can read, not only
  the deck, and a slide's page has network access. Leaving `--agent-web` off and Codex's
  no-network sandbox stop the provider process from making requests, but they do not stop data it
  read from leaving through a slide it writes (an image address, a fetch or a form in a slide
  makes the request when the page opens). Do not run an agent on material you do not trust in a
  workspace that sits next to secrets.
- **The page's endpoints need the dev session.** The dev server sets an `HttpOnly`,
  `SameSite=Strict` cookie on the deck's page when your browser opens it from this machine; the
  agent socket, `/__deck/comments` and `/__deck/reorder` refuse requests without it, from another
  origin, or not from this machine, and the dev server answers no cross-origin request. Vite's
  `/__open-in-editor` endpoint, which could open any file in your editor for any page script, is
  switched off (404); the error overlay's click-to-open link no longer works. The MCP
  endpoint takes a bearer token instead, which lives only in `.deck/agent/<deck>/server.json`
  (mode 0600) and Claude's per-turn MCP config file (0600, removed when the turn ends); the dev
  server never serves `.deck/`. A program running as you on the same machine can still open the
  page and get the cookie, as it could read your files: that is accepted for a single-user
  machine. `deckster present` is stricter: only its own window's first page load gets the session.
- **One agent per deck.** A second dev server with `--agent` for the same deck refuses to start
  its agent and names the process that has it.
- **Nothing outlives the CLI.** Ctrl+C, `q`, SIGTERM, SIGHUP and closing the window stop the
  running turn's process group and remove the token files; if the CLI is killed outright, a small
  watchdog process does the same, and the next start puts the deck back.

## Undo

Undo restores the files the last turn changed; Redo applies them again. Both wait while a turn
runs. The journal (`.deck/agent/<deck>/turns/`, the last 50 turns) records what the editor brought
into the deck (and the slide list the deck tools changed), with the files before and after, and
refuses an undo when a file changed since the turn (you edited it, or a later turn did) and names
the file: undo that edit by hand first. A new turn that changes files drops the turns you had
undone, so they can no longer be redone.

Undo and redo write only content files of the deck (and the slide list in `deck.config.ts` when
the deck tools changed it, and only to a plain data config), through real folders inside the
deck, only bytes that have the hash the journal recorded, and restore each file's mode. Files over
5 MB are hashed but not copied, so their change is listed as not undoable and undo leaves them as
they are. An undo interrupted by a crash finishes or rolls back the next time the dev server
starts, and never overwrites a file you changed after the crash.

## Docking

Right (400 px wide, drag its edge from 320 to 640) or bottom (280 px high, drag its top edge);
the slide scales into the room that is left, as it does beside the slide sidebar, and the sidebar
and the comment panel can be open at the same time. The resize edge also takes the arrow keys.
Position, size and whether the panel is hidden are remembered per deck in the browser. In a
window narrower than about 900 px the panel lies over the slide instead, and steps aside while
you pick an element.

## Claude and Codex

|               | Claude                               | Codex                                          |
| ------------- | ------------------------------------ | ---------------------------------------------- |
| Answers       | stream word by word                  | arrive as whole messages                       |
| Speed         | a small edit takes about 10 to 15 s  | about 20 s to a minute; the first words later  |
| Cost          | shown per turn                       | not reported (tokens only)                     |
| Reading files | its Read tool                        | shell commands (`cat`, `sed`), shown as "Read" |
| Edit limits   | permission rules on the working copy | the sandbox, writable only in the working copy |

Both get the deck MCP tools (lint, screenshots, outline, comments), resume the same conversation
from turn to turn, and keep it across restarts of `deckster dev`. Claude Code runs with no settings
file at all; its standing rules point it at the catalog and at the `create-presentation` skill's
guidance as a plain file, since skills are off. The same rules ask both providers to build a
slide's evidence (a chart, a diagram, code, a list the notes walk through) in steps in the order
the notes explain it, with a `[click]` cue in the notes for each step.

## Troubleshooting

- **"Connecting…" or "Reconnecting…":** the dev server is starting or restarted. Turns keep
  running on the server; the panel catches up when it reconnects.
- **Not installed / not signed in:** run the command the panel shows, then Retry.
- **Rate limit or usage limit:** shown in the turn; wait until the time it names.
- **Deck tools unavailable:** the agent still works without the MCP tools; lint still runs after
  each turn.
- **A turn timed out or crashed:** Retry sends the same prompt again; the session resumes.
- **No panel:** it exists only with `--agent`, only in the audience window, never in `?static`,
  builds, exports or `deckster present --built`. Press `a` if it is hidden.
- **The desktop shell has no menu item for the panel:** the shell's page API has no generic
  command channel yet, so use `a` or the tool cluster there too.
