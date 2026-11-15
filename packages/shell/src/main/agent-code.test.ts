import { describe, expect, it } from 'vite-plus/test';

import {
  agentCodeLoadOptions,
  agentCodeOnce,
  installAgentCodeGuard,
  isAgentCode,
  type AgentCodeSessionLike,
  type HeaderRequest,
} from '#main/agent-code.ts';

const ORIGIN = 'http://127.0.0.1:5173';
const CODE = 'abcdefghijklmnop0123';

/**
 * Installs the guard on a fake session and returns a function that runs one request through it.
 */
function guard(): (request: HeaderRequest) => Record<string, string> {
  let listener:
    | Parameters<AgentCodeSessionLike['webRequest']['onBeforeSendHeaders']>[1]
    | undefined;
  installAgentCodeGuard(
    {
      webRequest: {
        onBeforeSendHeaders: (filter, next) => {
          expect(filter.types).toEqual(['mainFrame', 'subFrame']);
          listener = next;
        },
      },
    },
    ORIGIN,
  );
  return (request) => {
    let headers: Record<string, string> = {};
    listener?.(request, (response) => (headers = response.requestHeaders));
    return headers;
  };
}

describe('the agent code', () => {
  it('accepts 16 to 128 URL-safe characters only', () => {
    expect(isAgentCode('a'.repeat(16))).toBe(true);
    expect(isAgentCode(`${'A'.repeat(64)}_-${'9'.repeat(62)}`)).toBe(true);
    expect(isAgentCode('a'.repeat(15))).toBe(false);
    expect(isAgentCode('a'.repeat(129))).toBe(false);
    expect(isAgentCode('abcdefghijklmnop\r\n')).toBe(false);
    expect(isAgentCode('abcdefghijklmnop=')).toBe(false);
    expect(isAgentCode(undefined)).toBe(false);
  });

  it('becomes a request header, never part of the URL', () => {
    expect(agentCodeLoadOptions(CODE)).toEqual({ extraHeaders: `X-Deck-Agent-Code: ${CODE}\n` });
  });

  it('is handed out once', () => {
    const once = agentCodeOnce(CODE);
    expect(once.take()).toEqual(agentCodeLoadOptions(CODE));
    expect(once.take()).toBeUndefined();
    expect(agentCodeOnce(undefined).take()).toBeUndefined();
  });

  it('leaves the shell once: a reload or a redirect that repeats the header loses it', () => {
    const send = guard();
    const first = send({ url: `${ORIGIN}/`, requestHeaders: { 'X-Deck-Agent-Code': CODE } });
    expect(first).toEqual({ 'X-Deck-Agent-Code': CODE });
    const reload = send({
      url: `${ORIGIN}/`,
      requestHeaders: { 'x-deck-agent-code': CODE, Accept: 'text/html' },
    });
    expect(reload).toEqual({ Accept: 'text/html' });
    expect(send({ url: `${ORIGIN}/x`, requestHeaders: { Accept: '*/*' } })).toEqual({
      Accept: '*/*',
    });
  });

  it('never goes to another origin, not even first', () => {
    const send = guard();
    expect(
      send({ url: 'https://example.com/', requestHeaders: { 'X-Deck-Agent-Code': CODE } }),
    ).toEqual({});
    expect(send({ url: `${ORIGIN}/`, requestHeaders: { 'X-Deck-Agent-Code': CODE } })).toEqual({
      'X-Deck-Agent-Code': CODE,
    });
  });
});
