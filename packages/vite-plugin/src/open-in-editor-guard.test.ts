import type { IncomingMessage, ServerResponse } from 'node:http';

import { describe, expect, it } from 'vite-plus/test';

import { refuseOpenInEditor } from '#open-in-editor-guard.ts';

describe('refuseOpenInEditor', () => {
  it('answers 404 and never calls the next handler, even for a same-origin fetch', () => {
    const headers = new Map<string, string>();
    let body = '';
    const response = {
      statusCode: 200,
      setHeader: (name: string, value: string) => void headers.set(name, value),
      end: (text: string) => {
        body = text;
      },
    };
    const request = {
      url: '/?file=/etc/hosts',
      headers: { 'sec-fetch-site': 'same-origin', cookie: 'deck-session-1=x' },
    } as unknown as IncomingMessage;
    refuseOpenInEditor(request, response as unknown as ServerResponse);
    expect(response.statusCode).toBe(404);
    expect(body).toBe('Not found.');
    expect(headers.get('content-type')).toBe('text/plain; charset=utf-8');
  });
});
