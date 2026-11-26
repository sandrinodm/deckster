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
- **Code layouts.** The deck or brand author writes `contract.ts` and `limits.ts` as trusted
  local code. A separate Node process stops hangs and endless loops at the load deadline and
  catches accidental file writes, network access, child process creation, environment mutation,
  and imports outside the contract allowlist. This check provides no sandbox protection. The
  server evaluates each passing contract again with full rights, so code that behaves differently
  there can use those rights. The browser runs the layout's `layout.tsx`. Agents cannot write
  layout files during a turn, and `deckster brand add` omits fetched code layouts and records them
  in `.deckster-source.json`. See [the agent trust model](docs/agent.md).
- **SVG sanitization**: Inline and external SVGs are sanitized before rendering.
