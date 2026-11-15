import { describe, expect, it } from 'vite-plus/test';

import { pointAtAppFolder, restoreTitle } from '#apps/app-html.ts';

describe('pointAtAppFolder', () => {
  it('points relative scripts and styles at the app folder', () => {
    const html = '<link rel="stylesheet" href="./app.css"><script type="module" src="./main.tsx">';
    expect(pointAtAppFolder(html, '/work/decks/d/apps/a')).toBe(
      '<link rel="stylesheet" href="/@fs/work/decks/d/apps/a/app.css">' +
        '<script type="module" src="/@fs/work/decks/d/apps/a/main.tsx">',
    );
  });

  it('leaves absolute, remote and bare paths alone', () => {
    const html = '<script src="https://cdn.test/x.js"></script><link href="/shared.css">';
    expect(pointAtAppFolder(html, '/work/apps/a')).toBe(html);
  });
});

describe('restoreTitle', () => {
  it('puts the app title back', () => {
    expect(restoreTitle('<title>Deck</title>', '<title>Agent</title>')).toBe(
      '<title>Agent</title>',
    );
  });

  it('keeps the page when the app has no title', () => {
    expect(restoreTitle('<title>Deck</title>', '<p>x</p>')).toBe('<title>Deck</title>');
  });
});
