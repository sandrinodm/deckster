# Deploying decks

A built deck is a static folder with relative asset paths, so it can be hosted under any path on any
static host. There is no access control: anyone with the URL can open every deck in the site. Keep
confidential decks out of the decks that are deployed, or put the host's own protection in front of
the site.

To host your own decks, build the gallery below and put it on any static host. This repository's
own site, the documentation with the example decks, is built by a different pipeline; see
[GitHub Pages](#github-pages).

## Build the site

```sh
pnpm deck build --all --out site
```

This builds every deck into `site/`, with a gallery page (`index.html`) that links each deck's
folder. `--with-exports` adds each deck's PDF and PPTX, and naming one deck publishes only that
one. The thumbnails and exports need Chromium (`pnpm exec playwright install chromium`). To look at
the site locally, serve the folder with any static server, for example `pnpm dlx serve site`.

[Build and host](https://sandrinodm.github.io/deckster/export-and-publish/build-and-host/) in the
documentation covers the build in full: the folder it writes, which decks go in, the folders it
refuses to replace, and a GitHub Pages workflow for a workspace that installs the CLI from npm. The
host settings below are for building from a clone of this repository.

## Cloudflare Pages

The other projects in this account run on Cloudflare, so this is the first choice.

| Setting                | Value                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Build command          | `pnpm install --frozen-lockfile && pnpm exec playwright install chromium && pnpm deck build --all --out site` |
| Build output directory | `site`                                                                                                        |
| Node.js version        | `24` (set the `NODE_VERSION` variable)                                                                        |

Cloudflare's build image may lack the system libraries Chromium needs. If the thumbnails are
missing, build in CI instead and upload the folder with
`pnpm dlx wrangler pages deploy site --project-name <name>`.

## GitHub Pages

`.github/workflows/deploy.yml` publishes this repository's own site to GitHub Pages: the
documentation at the root and the example decks under `decks/`. It does not deploy the
`deck build --all` gallery. The site's source is the orphan `docs-site` branch of this repository
(Astro with Nimbus). Its reference data (`src/data`: layouts, components, commands) is committed on
that branch for the release the pages document (`src/data/meta.json` names it), and is published
as committed. The slide stills and the decks come from the `main` commit being deployed. The
workflow:

1. Checks out the commit, and stops unless it is on `main` and has a successful CI run from a push,
   so a run started by hand on another branch, or on a commit whose CI failed, builds nothing.
2. Checks out `docs-site` into `docs-site/`.
3. Installs the workspace with pnpm and Node 26, Chromium, Electron's binary
   (`pnpm --filter @deckster/shell exec install-electron`) with Xvfb and the libraries Electron
   links, and builds the LibreOffice Docker image that `deck export --verify` renders with
   (`pnpm --filter @deckster/export prepare:verify`).
4. Runs `npm ci` in `docs-site/`, then `npm run check:briefs`, which fails while a page still
   carries its writing brief, and `npm run check:coverage`, which fails when a layout, component,
   chart, diagram component or command in the committed `src/data` has no reference entry.
5. Runs `npm run sync -- --shots --decks` in `docs-site/` under `xvfb-run`, with `DECKSTER_REPO`
   set to the checkout of `main` and `DECKSTER_SHOTS_STRICT=1`. It runs `scripts/docs-shots.ts`,
   `scripts/docs-ui-shots.ts` and `scripts/docs-decks.ts` and installs their output into the site:
   the slide stills, the product screenshots and the built decks. It leaves `src/data` alone, so
   the reference tables keep describing the documented release however far `main` has moved.
   - Only the decks and brands listed in `scripts/docs-allowlist.ts` are published; any other
     folder under `decks/` or `brands/` stays private. Each script refuses to start when an
     allowlisted deck renders with a brand that is not allowlisted.
   - `DECKSTER_SHOTS_STRICT=1` (the same as `--strict`) makes `docs-ui-shots.ts` exit 1 when it
     skips a shot, naming the shot and what it lacked (Electron, a display, Docker), so the step
     fails instead of publishing pages with missing screenshots. Without it, a skipped shot is
     only reported.
   - The screenshots read a fixed date and time, the `en-US` locale and the UTC time zone, so the
     same commit gives the same pictures on any machine.
   - `docs-decks.ts` needs an empty or new `--out` (the sync gives it a fresh temporary folder),
     because the site publishes that folder whole.
6. Exports each published deck with `deck export`, which writes `<deck>.pdf`, `<deck>.pptx` and the
   PPTX fonts beside the deck's `index.html`. A `<Download file="<deck>.pdf">` on a slide links to
   a file only when this ran; the showcase deck has one. A run started by hand exports unless the
   `with_exports` checkbox (on by default) is cleared; a run after CI always exports.
7. Runs `npx @cloudflare/nimbus-docs check`, `npm run build` and the check again (now with the
   built pages, so links into `decks/` are checked), and uploads `docs-site/dist`.

The site it publishes:

```
index.html            the documentation home; every other page in its own folder
decks/
  hello/              decks/hello/dist (plus hello.pdf, hello.pptx and fonts/ with the exports)
  showcase/
  ...                 the rest of the allowlist
```

`decks/` itself has no index page; the docs link each deck. The base path (`/deckster`) is set in
`astro.config.ts` on `docs-site`, so a repository with another name or a custom domain changes it
there. The decks use relative asset paths and need nothing.

The workflow is disabled by default: it runs only from the Actions tab (`workflow_dispatch`). To
use it:

1. Push `docs-site` once its pages pass `npm run check:briefs` and `npm run check:coverage`, and
   make sure the `main` commit to deploy has the `scripts/docs-*.ts` and a successful CI run from a
   push.
2. In the repository, open Settings, Pages, and set Source to GitHub Actions.
3. Run the workflow once from the Actions tab.
4. To publish every commit on `main` once CI passes, uncomment the `workflow_run` trigger in the
   workflow. Those runs have no inputs and always export the decks.

A change pushed to `docs-site` (a page, or `src/data`) does not deploy by itself: the branch's own
workflow checks and builds the site but publishes nothing. It goes live on the next run of this
workflow: the next run started by hand, or, with the `workflow_run` trigger on, the next deploy
after CI passes on `main`. To document a new release, sync the data against it on `docs-site`
(`npm run sync -- --data` with `DECKSTER_REPO` at that release), commit `src/data` with the pages it
changes, and run the workflow.

The site is served at `https://<owner>.github.io/<repository>/`. On a private repository, Pages is
public unless the organisation is on GitHub Enterprise Cloud.

To host your own decks on GitHub Pages instead, build the gallery in a workflow of your own:
[Build and host](https://sandrinodm.github.io/deckster/export-and-publish/build-and-host/#example-github-pages)
has one to start from. From a clone, use the same guard, install and browser steps as this workflow,
then `pnpm deck build --all --out site` (add `--with-exports` for the PDF and PPTX files), and upload
`site` with `actions/upload-pages-artifact`.

## Vercel

| Setting          | Value                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Install command  | `pnpm install --frozen-lockfile`                                            |
| Build command    | `pnpm exec playwright install chromium && pnpm deck build --all --out site` |
| Output directory | `site`                                                                      |
| Framework preset | Other                                                                       |

## Netlify

| Setting           | Value                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Build command     | `pnpm install --frozen-lockfile && pnpm exec playwright install chromium && pnpm deck build --all --out site` |
| Publish directory | `site`                                                                                                        |
| Node.js version   | `24` (set the `NODE_VERSION` variable)                                                                        |

## Pull request previews

`.github/workflows/slides-diff.yml` does not deploy anything. It renders the decks a pull request
changes against the base branch with `deck diff`, uploads the report folder as an artifact and keeps
one comment on the pull request up to date with the table of changed slides. Open `index.html` in
the downloaded artifact to see before, after and difference side by side.
