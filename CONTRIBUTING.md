# Contributing to deckster

Thank you for your interest in contributing to deckster!

## Ways to contribute

- **Report bugs** using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.yml).
- **Suggest features or improvements** using the [feature request template](.github/ISSUE_TEMPLATE/feature_request.yml).
- **Submit pull requests** for bug fixes, new layouts/components, documentation, or tests.

## Development setup

### Prerequisites

- **Node.js** `>= 26.0.0` (the CLI and root scripts run as TypeScript via Node's type stripping)
- **pnpm** `12.16.1` (pinned in `package.json` `devEngines` and fetched automatically if using Corepack/pnpm)
- **Playwright Chromium** for `shot`, `lint`, `diff`, `export`, and browser tests

### Install and verify

```sh
git clone https://github.com/sandrinodm/deckster.git
cd deckster
pnpm install
pnpm --filter @deckster/cli exec playwright install chromium
pnpm --dir packages/engine exec e2e-web install chromium
```

Run the starter deck locally:

```sh
pnpm dev hello
```

Or explore the 45-slide showcase deck, a talk about deckster, and the lookbook, which shows every
layout, option, chart, diagram and component:

```sh
pnpm deckster dev showcase
pnpm deckster dev lookbook
```

## Checks and tests

Before opening a pull request, run the full verification suite:

```sh
pnpm ready
```

`pnpm ready` runs the following steps in order:

| Command          | What it does                                                                 |
| ---------------- | ---------------------------------------------------------------------------- |
| `pnpm check`     | Verifies `tailwind.tooling.css`, runs `vp check` (format/lint), `jsdoc-lint` |
| `pnpm typecheck` | Runs `tsc --noEmit` at the root and across all workspace packages            |
| `pnpm test`      | Runs unit and integration tests across all packages                          |
| `pnpm test:e2e`  | Runs browser e2e suites one package at a time                                |
| `pnpm build`     | Builds every deck in `decks/`                                                |

To format files automatically, run:

```sh
pnpm format
```

Note that export verification tests in `@deckster/export` require Docker (for LibreOffice and the Open XML SDK) and skip automatically if Docker is unavailable.

## Project conventions

- **Formatting & linting**: Managed by [Vite+](https://viteplus.dev/) (`vite.config.ts`). Do not bypass lint rules; run `pnpm check`.
- **JSDoc**: Public and internal declarations in `packages/*/src/` require multiline JSDoc comments enforced by `jsdoc-lint`.
- **Public CLI surface**: Commands, flags, `--json` output shapes, and exit codes in `@deckster/cli` are part of the public contract for humans, CI, and AI agents. Document any changes in `packages/cli/README.md`.
- **Kit layouts**: `@deckster/kit/layout-parts` and `@deckster/kit/layout-fields` are public API for code layouts in brands and decks, held by the snapshots of `packages/kit/src/layout-api.test.ts`; a kit layout must stay ejectable (`eject-closure.test.ts`, and the CLI test that ejects every layout) and its stylesheet must not rely on another layout's. See [packages/kit/README.md](packages/kit/README.md#parts-and-fields-for-layouts).
- **Deck/brand names**: Any name used in paths must go through `isSafeName`; never join raw user input into a filesystem path.
- **Keep the working tree clean**: CI verifies that `pnpm check`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, and `pnpm deckster lint` leave no untracked or modified files behind.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep changes focused and well-tested.
3. Run `pnpm check`, `pnpm typecheck`, and `pnpm test` (or `pnpm ready`).
4. Open a pull request and fill out the pull request template.
5. On PRs, CI runs the full verification suite and the `Slides diff` workflow reports any visual slide changes.

## License

By contributing to deckster, you agree that your contributions will be licensed under the [MIT License](LICENSE).
