import { describe, expect, it, vi } from 'vite-plus/test';

import { settleIconLoad } from '#diagrams/use-kind-icons.ts';

describe('settleIconLoad', () => {
  it('hands over the icons that loaded', async () => {
    const loaded = vi.fn();
    const failed = vi.fn();
    settleIconLoad(() => Promise.resolve(new Map()), { loaded, failed });
    await Promise.resolve();
    expect(loaded).toHaveBeenCalledOnce();
    expect(failed).not.toHaveBeenCalled();
  });

  it('warns and reports a failure instead of leaving the slide waiting', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const loaded = vi.fn();
    const failed = vi.fn();
    settleIconLoad(() => Promise.reject(new Error('Failed to fetch chunk')), { loaded, failed });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(failed).toHaveBeenCalledOnce();
    expect(loaded).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch chunk'));
    warn.mockRestore();
  });
});
