# Deploying decks

A built deck is a static folder with relative asset paths, so it can be hosted under any path on any
static host. There is no access control: anyone with the URL can open every deck in the site. Keep
confidential decks out of the decks that are deployed, or put the host's own protection in front of
the site.

## Build the site

```sh
pnpm deck build --all --out site
```

This builds every deck and writes one folder:

```
site/
  index.html          the gallery: title, brand, slide count, first-slide thumbnail, links
  hello/              decks/hello/dist, plus thumbnail.png
  showcase/
```

Add `--with-exports` to also write `<deck>.pdf` and `<deck>.pptx` into each deck's folder; the
gallery then links them. Name one deck (`pnpm deck build hello --out site`) to publish only that
one. The thumbnails and exports need Chromium (`pnpm exec playwright install chromium`); a
thumbnail that cannot be taken is reported and left out of the gallery, the build still succeeds.

To look at the site locally, serve the folder with any static server, for example
`pnpm dlx serve site`.

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

`.github/workflows/deploy.yml` builds the site and publishes it with GitHub's own Pages actions. It
is disabled by default: it runs only from the Actions tab (`workflow_dispatch`, with a checkbox for
the PDF and PPTX exports). To use it:

1. In the repository, open Settings, Pages, and set Source to GitHub Actions.
2. Run the workflow once from the Actions tab.
3. To publish every commit on `main` once CI passes, uncomment the `workflow_run` trigger in the
   workflow.

The workflow publishes only a commit that is on `main` and has a successful CI run from a push, so a
run started by hand on another branch, or on a commit whose CI failed, stops before building.

The site is served at `https://<owner>.github.io/<repository>/`. Because the decks use relative
paths, the sub-path needs no configuration. On a private repository, Pages is public unless the
organisation is on GitHub Enterprise Cloud.

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
