import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it } from 'vite-plus/test';

import { guarded } from '#guarded-middleware.ts';

describe('guarded', () => {
  it('turns a rejection into next(error) and never rejects', async () => {
    const failure = new Error('boom');
    const seen: unknown[] = [];
    const middleware = guarded(async () => {
      throw failure;
    });
    await middleware({} as IncomingMessage, {} as ServerResponse, (error) => void seen.push(error));
    expect(seen).toEqual([failure]);
  });

  it('leaves a handler that succeeds alone', async () => {
    const seen: unknown[] = [];
    await guarded(async (_request, _response, next) => next())(
      {} as IncomingMessage,
      {} as ServerResponse,
      (error) => void seen.push(error),
    );
    expect(seen).toEqual([undefined]);
  });
});
