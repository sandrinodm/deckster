import { describe, expect, it } from 'vite-plus/test';

import { installDownloadPolicy, type DownloadSessionLike } from '#main/downloads.ts';

describe('downloads', () => {
  it('cancels every download before a save dialog could open, and says so', () => {
    let listener: Parameters<DownloadSessionLike['on']>[1] | undefined;
    const reports: string[] = [];
    installDownloadPolicy(
      {
        on: (event, next) => {
          expect(event).toBe('will-download');
          listener = next;
        },
      },
      (message) => reports.push(message),
    );
    let prevented = 0;
    for (const url of ['http://127.0.0.1:5173/deck.pdf', 'https://example.com/x.zip']) {
      listener?.({ preventDefault: () => (prevented += 1) }, { getURL: () => url });
    }

    expect(prevented).toBe(2);
    expect(reports).toHaveLength(2);
    expect(reports[1]).toContain('https://example.com/x.zip');
  });
});
