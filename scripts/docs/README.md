# @deckster/docs-scripts

The scripts that produce what the docs site (the `docs-site` branch) publishes: the reference data,
the slide stills, the product screenshots and the built decks. It is a private workspace package so
the scripts can import the framework packages (`@deckster/kit`, `@deckster/brand`,
`@deckster/engine`, `@deckster/vite-plugin`) and `effect` directly; nothing here ships in
`@deckster/cli`.

Run them from the repository root after `pnpm install`. Each writes into `--out`, which must not be
the repository or a folder inside its sources:

```sh
node scripts/docs/data.ts --out <dir>                # src/data/*.json for the site
node scripts/docs/shots.ts --out <dir>               # slide, step and brand stills, shots.json
node scripts/docs/ui-shots.ts --out <dir> [--strict] # screenshots of the product UI
node scripts/docs/decks.ts --out <dir>               # the allowlisted decks, built
```

- Only the decks and brands in [`allowlist.ts`](allowlist.ts) are read, shot or built, and every
  script refuses to start when an allowlisted deck renders with a brand that is not allowlisted.
- `data.ts` packs the CLI into `packages/cli/dist` first (`pnpm --filter @deckster/cli run prepack`)
  and reads every command's `--help` and the version from that copy, so `cli.json` has the wording
  of an npm install rather than of the repository checkout.
- `decks.ts` needs an empty or new `--out`, because the site publishes that folder whole.
- `ui-shots.ts` skips a shot whose prerequisite is missing (Electron, a display, Docker);
  `--strict` or `DECKSTER_SHOTS_STRICT=1` makes a skip fail the run.

The site's `npm run sync` runs all four into temporary folders and installs the results; see
[docs/deploy.md](../../docs/deploy.md) for the workflow that publishes it.

`pnpm test` and `pnpm typecheck` at the root include this package.
