# Security Policy

## Supported Versions

Security updates are provided for the latest published release of `@deckster/cli` and the `main` branch.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

Please **do not** report security vulnerabilities through public GitHub issues.

Instead, please report them privately via [GitHub Security Advisories](https://github.com/sandrinodm/deckster/security/advisories/new).

Include as much detail as possible:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a minimal proof of concept
- Affected command, package, or configuration

You can expect an acknowledgment within a few days and a coordinated fix before public disclosure.

## Security Design Notes

- **Workspace isolation**: The CLI refuses to treat `$HOME` or `/` as a deck workspace root, and all deck, brand, and slide identifiers are validated with `isSafeName` before joining paths.
- **Agent & MCP endpoints**: `deckster dev --mcp` binds strictly to `127.0.0.1` and writes a per-run bearer token to `.deck/agent/<deck>/server.json` with mode `0600`. `deckster dev --agent` restricts edits to the deck's content (`slides/`, `assets/`, `public/`) and reverts out-of-scope writes (see [docs/agent-design.md](docs/agent-design.md)).
- **Code layouts**: A code layout (`brands/<name>/layouts/<layout>/` or `decks/<deck>/layouts/<layout>/`) is code of the workspace: its `contract.ts` and `limits.ts` run in Node with your permissions when a command loads the catalog, and its `layout.tsx` runs in the browser. Before a contract runs, its imports are checked against a short list and its evaluation has a 10-second deadline per load; that check catches mistakes and is not a sandbox, and code already running after an `await` cannot be stopped. `deckster brand add` never copies or runs a fetched brand's code: code layouts are left out whole and recorded in `.deckster-source.json`. While an agent turn runs, the contracts of the deck's and brand's code layouts are not loaded again (see [docs/agent.md](docs/agent.md)). Read a code layout from elsewhere before you copy it in.
- **SVG sanitization**: Inline and external SVGs are sanitized before rendering.
