import { describe, expect, it } from 'vite-plus/test';

import { versionWarning } from '#providers/version.ts';

describe('the version note', () => {
  it('says nothing for a patch release of the tested line, which ships almost daily', () => {
    expect(versionWarning('Claude Code', '2.1.325', '2.1.325')).toEqual([]);
    expect(versionWarning('Claude Code', '2.1.331', '2.1.325')).toEqual([]);
    expect(versionWarning('Codex', '0.167.0', '0.167.2')).toEqual([]);
  });

  it('notes another minor or major release, and an unreadable version', () => {
    expect(versionWarning('Codex', '0.168.0', '0.167.2')[0]).toContain('tested with 0.167.x');
    expect(versionWarning('Claude Code', '3.0.0', '2.1.325')).toHaveLength(1);
    expect(versionWarning('Claude Code', null, '2.1.325')[0]).toContain('Could not read');
  });
});
