import { describe, expect, it } from 'vite-plus/test';

import { codeLayoutContract } from '#layouts/code-layout.contract.ts';
import { demoLayoutContract } from '#layouts/demo-layout.contract.ts';

describe.each([codeLayoutContract, demoLayoutContract])('the $name layout contract', (contract) => {
  it('requires a title and limits it to one line', () => {
    expect(contract.title).toEqual({ required: true, maxChars: expect.any(Number) });
    const title = String(contract.example.frontmatter['title']);
    expect(title.length).toBeLessThanOrEqual(contract.title?.maxChars ?? 0);
  });

  it('has an example that needs no files and ends with speaker notes', () => {
    expect(contract.example.body).not.toMatch(/(?:src|poster|fallback)=["'{]/u);
    expect(contract.example.body).toContain('<Notes>');
  });
});

describe('the demo layout example', () => {
  it('names no app, so a freshly scaffolded slide builds before the app exists', () => {
    expect(demoLayoutContract.example.body).not.toMatch(/^<AppFrame\b/mu);
    expect(demoLayoutContract.example.body).toContain('pnpm deck new app');
  });
});
