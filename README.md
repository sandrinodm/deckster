# deckster documentation site

This orphan branch (`docs-site`) holds the source of the deckster documentation site. It is
built with [Nimbus](https://nimbus-docs.com/) (Astro) and never merges into `main`. It is
published to <https://sandrinodm.github.io/deckster/> by `main`'s `.github/workflows/deploy.yml`,
run by hand from the Actions tab: that workflow checks out the tip of this branch, generates the
slide stills and builds the example decks from `main`, builds the site and publishes it.
`src/data` is published as committed here. `.github/workflows/pages.yml` on this branch only
checks; it publishes nothing, so a change here goes live on the next run of `deploy.yml`.

The deploy workflow, the docs scripts it and the sync run (`scripts/docs/`) and the embed mode
`<DeckEmbed>` loads (`?embed`) are on `main`, and the pages document `@deckster/cli` 0.4.0, the
first release that carries them.

## Work on it

```sh
git worktree add ../deckster-docs docs-site   # from a deckster checkout
cd ../deckster-docs
npm ci
npm run sync                                  # stills and decks from the deckster checkout
npm run dev                                   # http://localhost:4321/deckster/
```

The build reads slide stills and built decks that are generated, not committed, so a fresh clone
does not build until `npm run sync` has run. It uses the deckster checkout at `DECKSTER_REPO`,
else `../2026-11-13-presentation`, else `../deckster`; that checkout needs `pnpm install` and
Chromium (`pnpm exec playwright install chromium`). Run the sync with Node 26 or later: it runs
deckster's scripts with the Node that runs it, and deckster requires 26. `npm run sync -- --data`,
`--shots` or `--decks` refreshes one part. AGENT.md's "Deck components" section has the details.

Pages live in `src/content/docs/`; the folder tree is the URL structure and the sidebar.
`sidebar.order` in frontmatter orders pages within a group, and the top-level groups are
listed in `astro.config.ts`. Components such as `<Steps>`, `<Tabs>` and `<Aside>` are
available in every `.mdx` file without an import; see `src/components.ts`.

`src/data/` holds JSON generated from the deckster code, and `public/decks/` and
`src/assets/shots/` the built decks and slide stills. Don't edit any of them by hand; the
last two are not committed.

Before you push:

```sh
npx @cloudflare/nimbus-docs check
npm run build
npx @cloudflare/nimbus-docs check   # again, to check links in the built site
```

`npm run check:briefs` fails while a page carries a `{/* BRIEF … */}` writing brief, which the
site would serve in the page's `index.mdx`, and `npm run check:coverage` while a layout,
component, chart or command has no reference entry. CI runs both before the build.

`.github/workflows/pages.yml` runs on every push and pull request to `docs-site`. It checks out
deckster at `DECKSTER_REF` (`main`), regenerates `src/data` and fails if it differs from the
committed files, syncs the stills and decks under a virtual display (Xvfb, for the Electron
windows of `deck present`) with `DECKSTER_SHOTS_STRICT=1`, then runs the same three steps. It does
not deploy (see the top of this file).

`AGENT.md` has the conventions for coding agents working on this branch: deckster-specific
rules first, then the Nimbus guide.
