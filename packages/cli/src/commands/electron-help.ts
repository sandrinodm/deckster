/**
 * The text `deckster electron --help` prints.
 */
export const HELP = `Usage: deckster electron install [--force] [--json]
       deckster electron update [--json]
       deckster electron status [--json]

Manages the Electron binary \`deckster present\` opens its windows with (about 120 MB). npm, pnpm and
yarn often skip the download when they install @deckster/cli, so run \`deckster electron install\`
once after installing. Nothing else needs Electron: every other command, and
\`deckster present --browser\`, use Chrome.

Commands:
  install   Downloads the Electron version this CLI was built with, unless it is already there.
            It runs Electron's own downloader, which checks the published checksums and reuses
            Electron's download cache. It honours HTTPS_PROXY and ELECTRON_MIRROR.
  update    Downloads Electron again when the binary on disk is not the version this CLI needs,
            as after upgrading @deckster/cli. The version comes with the CLI: to move to a newer
            Electron, upgrade @deckster/cli first.
  status    Prints whether the binary is downloaded, its version and where it is.

Options:
  --force   With install: remove the binary and download it again, skipping the cache.
  --json    Print { ok, downloaded, electron: { directory, version, downloadedVersion,
            executable, ready } }. A failure prints { ok: false, error: { type, message } }.
  -h, --help  Show this help.

Exits with 1 when the download fails, or when status finds no usable binary.`;
