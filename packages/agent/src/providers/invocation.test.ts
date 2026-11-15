import { describe, expect, it } from 'vite-plus/test';

import type { InvocationContext, TurnRequest } from '#providers/provider-types.ts';

import { claudeInvocation } from '#providers/claude/invocation.ts';
import { codexInvocation } from '#providers/codex/invocation.ts';

/**
 * A parent environment as the deck CLI sees it when it runs inside Claude Code.
 */
const ENVIRONMENT = {
  PATH: '/usr/bin:/bin',
  HOME: '/Users/someone',
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
  HTTPS_PROXY: 'http://proxy:8080',
  CLAUDECODE: '1',
  CLAUDE_CODE_ENTRYPOINT: 'cli',
  CLAUDE_CODE_SESSION_ID: 'parent-session',
  CLAUDE_PID: '123',
  CLAUDE_EFFORT: 'high',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  CODEX_HOME: '/Users/someone/.codex',
  GITHUB_TOKEN: 'ghp-secret',
  AWS_SECRET_ACCESS_KEY: 'aws-secret',
};

/**
 * A turn about the title slide.
 *
 * @param overrides - Fields to change.
 */
function turn(overrides: Partial<TurnRequest> = {}): TurnRequest {
  return {
    deck: 'hello',
    brand: 'default',
    text: 'Shorten the title.',
    kind: 'user',
    slide: {
      id: 'title',
      file: 'decks/hello/slides/title.mdx',
      layout: 'title',
      title: 'Hello, deck',
      step: 0,
    },
    selection: undefined,
    comments: [],
    findings: [],
    screenshot: undefined,
    reverted: [],
    web: false,
    model: undefined,
    ...overrides,
  };
}

/**
 * The context of one invocation.
 *
 * @param request - The turn.
 * @param session - The session to create or resume.
 */
function context(
  request: TurnRequest,
  session: InvocationContext['session'] = {
    id: '11111111-2222-3333-4444-555555555555',
    resume: false,
  },
): InvocationContext {
  return {
    turn: request,
    prompt: 'PROMPT',
    rules: 'RULES',
    session,
    mcp: { url: 'http://127.0.0.1:5661/__deck/mcp', token: 'secret-token' },
    workspaceRoot: '/work',
    agentDir: '/work/.deck/agent/hello',
    workingCopy: '/work/.deck/agent/hello/work/3-0123456789ab',
    environment: ENVIRONMENT,
  };
}

/**
 * The image every screenshot case attaches.
 */
const SCREENSHOT = { path: '/work/.deck/agent/hello/shots/title-0.png', base64: 'iVBORw0KGgo=' };

describe('Claude invocation', () => {
  it.each([
    ['first turn', context(turn())],
    ['resumed turn', context(turn(), { id: '11111111-2222-3333-4444-555555555555', resume: true })],
    ['with image', context(turn({ screenshot: SCREENSHOT }))],
    ['with model', context(turn({ model: 'claude-sonnet-5' }))],
    ['with web search', context(turn({ web: true }))],
  ])('%s', (_name, input) => {
    const invocation = claudeInvocation(input);
    expect({
      command: invocation.command,
      args: invocation.args,
      cwd: invocation.cwd,
    }).toMatchSnapshot();
  });

  it('keeps the token off the command line, in a 0600 file', () => {
    const invocation = claudeInvocation(context(turn()));
    expect(invocation.args.join(' ')).not.toContain('secret-token');
    expect(invocation.files).toEqual([
      {
        path: '/work/.deck/agent/hello/claude-mcp.json',
        mode: 0o600,
        content: `${JSON.stringify({
          mcpServers: {
            deck: {
              type: 'http',
              url: 'http://127.0.0.1:5661/__deck/mcp',
              headers: { Authorization: 'Bearer secret-token' },
            },
          },
        })}\n`,
      },
    ]);
  });

  it('builds the environment from an allow-list: no CLAUDECODE, no foreign secrets', () => {
    expect(claudeInvocation(context(turn())).env).toEqual({
      PATH: '/usr/bin:/bin',
      HOME: '/Users/someone',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      HTTPS_PROXY: 'http://proxy:8080',
      ANTHROPIC_API_KEY: 'sk-ant-test',
    });
  });

  it("passes each provider its own sign-in variables and never the other one's", () => {
    const environment = {
      ...ENVIRONMENT,
      ANTHROPIC_AUTH_TOKEN: 'gateway-token',
      ANTHROPIC_BASE_URL: 'https://gateway.example',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token',
      CLAUDE_CODE_USE_BEDROCK: '1',
      AWS_REGION: 'eu-west-1',
      AWS_PROFILE: 'deck',
      CLAUDE_CODE_USE_FOUNDRY: '',
      AZURE_CLIENT_SECRET: 'azure-secret',
      GOOGLE_APPLICATION_CREDENTIALS: '/creds.json',
      OPENAI_API_KEY: 'sk-openai',
      OPENAI_BASE_URL: 'https://openai.example',
      CODEX_API_KEY: 'codex-key',
    };
    const claude = claudeInvocation({ ...context(turn()), environment }).env;
    expect(claude).toMatchObject({
      ANTHROPIC_API_KEY: 'sk-ant-test',
      ANTHROPIC_AUTH_TOKEN: 'gateway-token',
      ANTHROPIC_BASE_URL: 'https://gateway.example',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token',
      CLAUDE_CODE_USE_BEDROCK: '1',
      AWS_REGION: 'eu-west-1',
      AWS_PROFILE: 'deck',
      AWS_SECRET_ACCESS_KEY: 'aws-secret',
    });
    for (const name of [
      'AZURE_CLIENT_SECRET',
      'GOOGLE_APPLICATION_CREDENTIALS',
      'OPENAI_API_KEY',
      'OPENAI_BASE_URL',
      'CODEX_API_KEY',
      'CODEX_HOME',
      'GITHUB_TOKEN',
    ]) {
      expect(claude, name).not.toHaveProperty(name);
    }

    const codex = codexInvocation({ ...context(turn()), environment }).env;
    expect(codex).toMatchObject({
      OPENAI_API_KEY: 'sk-openai',
      OPENAI_BASE_URL: 'https://openai.example',
      CODEX_API_KEY: 'codex-key',
      CODEX_HOME: '/Users/someone/.codex',
    });
    for (const name of [
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_AUTH_TOKEN',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'AWS_REGION',
      'AWS_SECRET_ACCESS_KEY',
      'GITHUB_TOKEN',
    ]) {
      expect(codex, name).not.toHaveProperty(name);
    }
  });

  it('allows edits only to content files of the working copy, one rule per folder and extension', () => {
    const args = claudeInvocation(context(turn())).args;
    const allowed = args.slice(
      args.indexOf('--allowedTools') + 1,
      args.indexOf('--disallowedTools'),
    );
    const edits = allowed.filter((rule) => rule.startsWith('Edit('));
    expect(edits).toContain('Edit(/.deck/agent/hello/work/3-0123456789ab/slides/**/*.mdx)');
    expect(edits).toContain('Edit(/.deck/agent/hello/work/3-0123456789ab/slides/**/*.tsx)');
    expect(edits).toContain('Edit(/.deck/agent/hello/work/3-0123456789ab/assets/**/*.png)');
    expect(edits).toContain('Edit(/.deck/agent/hello/work/3-0123456789ab/public/**/*.svg)');
    expect(
      edits.every((rule) =>
        /^Edit\(\/\.deck\/agent\/hello\/work\/3-0123456789ab\/(slides|assets|public)\/\*\*\/\*\.[a-z0-9]+\)$/.test(
          rule,
        ),
      ),
    ).toBe(true);
    expect(edits.some((rule) => rule.includes('/decks/'))).toBe(false);
    expect(
      edits.some((rule) => rule.includes('.css') || rule.includes('.ts)') || rule.includes(',')),
    ).toBe(false);
    expect(allowed.filter((rule) => !rule.startsWith('Edit('))).toEqual(['mcp__deck__*']);
  });

  it('denies decks, brands, the deck config, stylesheets, .claude/ and skills, as a second belt', () => {
    const args = claudeInvocation(context(turn())).args;
    const denied = args.slice(args.indexOf('--disallowedTools') + 1, args.indexOf('--mcp-config'));
    expect(denied).toEqual([
      'Edit(/decks/**)',
      'Edit(/brands/**)',
      'Edit(/decks/hello/deck.config.ts)',
      'Edit(**/deck.config.ts)',
      'Edit(**/*.css)',
      'Edit(/.claude/**)',
      'Skill',
    ]);
  });

  it('loads no settings file, so a project allow rule or hook never applies, and offers no skills', () => {
    const args = claudeInvocation(context(turn({ web: true }))).args;
    expect(args[args.indexOf('--setting-sources') + 1]).toBe('');
    expect(args[args.indexOf('--tools') + 1]?.split(',')).not.toContain('Skill');
  });

  it('offers and allows WebSearch and WebFetch only with --agent-web', () => {
    const off = claudeInvocation(context(turn())).args;
    expect(off.join(' ')).not.toContain('Web');
    const on = claudeInvocation(context(turn({ web: true }))).args;
    expect(on[on.indexOf('--tools') + 1]).toBe('Read,Glob,Grep,Edit,Write,WebSearch,WebFetch');
    const allowed = on.slice(on.indexOf('--allowedTools'), on.indexOf('--disallowedTools'));
    expect(allowed).toEqual(expect.arrayContaining(['WebSearch', 'WebFetch']));
  });

  it('sends the prompt as text, or as one stream-json message with the image', () => {
    expect(claudeInvocation(context(turn())).stdin).toBe('PROMPT');
    const withImage = JSON.parse(claudeInvocation(context(turn({ screenshot: SCREENSHOT }))).stdin);
    expect(withImage).toEqual({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'PROMPT' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
          },
        ],
      },
    });
  });
});

describe('Codex invocation', () => {
  it.each([
    ['first turn', context(turn(), { id: undefined, resume: false })],
    ['resumed turn', context(turn(), { id: '01a1d73e-f577-7140-8809-43c947683540', resume: true })],
    ['with image', context(turn({ screenshot: SCREENSHOT }), { id: undefined, resume: false })],
    ['with model', context(turn({ model: 'gpt-6-astra' }), { id: undefined, resume: false })],
    ['with web search', context(turn({ web: true }), { id: undefined, resume: false })],
  ])('%s', (_name, input) => {
    const invocation = codexInvocation(input);
    expect({
      command: invocation.command,
      args: invocation.args,
      cwd: invocation.cwd,
    }).toMatchSnapshot();
  });

  it('puts resume after every exec flag and the token only in the environment', () => {
    const invocation = codexInvocation(
      context(turn({ screenshot: SCREENSHOT }), { id: 'thread-1', resume: true }),
    );
    expect(invocation.args.slice(-3)).toEqual(['resume', 'thread-1', '-']);
    expect(invocation.args.join(' ')).not.toContain('secret-token');
    expect(invocation.env).toEqual({
      PATH: '/usr/bin:/bin',
      HOME: '/Users/someone',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      HTTPS_PROXY: 'http://proxy:8080',
      CODEX_HOME: '/Users/someone/.codex',
      DECK_MCP_TOKEN: 'secret-token',
    });
    expect(invocation.stdin).toBe('RULES\n\n---\n\nPROMPT');
  });
  it('turns on live web search, which opens pages, only with --agent-web', () => {
    const session = { id: undefined, resume: false };
    expect(codexInvocation(context(turn(), session)).args).toContain('web_search="disabled"');
    const on = codexInvocation(context(turn({ web: true }), session)).args;
    expect(on).toContain('web_search="live"');
    expect(on).not.toContain('web_search="disabled"');
  });

  it('lets the sandbox write only the working copy’s content folders: slides as the working folder', () => {
    const args = codexInvocation(context(turn(), { id: undefined, resume: false })).args;
    expect(args[args.indexOf('-C') + 1]).toBe('/work/.deck/agent/hello/work/3-0123456789ab/slides');
    expect(args[args.indexOf('-s') + 1]).toBe('workspace-write');
    expect(args.flatMap((arg, index) => (arg === '--add-dir' ? [args[index + 1]] : []))).toEqual([
      '/work/.deck/agent/hello/work/3-0123456789ab/assets',
      '/work/.deck/agent/hello/work/3-0123456789ab/public',
    ]);
    expect(args.join(' ')).not.toContain('/work/decks/');
    expect(args).toContain('project_root_markers=["pnpm-workspace.yaml","decks"]');
  });
});
