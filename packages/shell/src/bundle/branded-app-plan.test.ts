import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

import { isStockElectron } from '#bundle/app-identity.ts';
import { brandedAppKey, brandedAppPlan, type BrandedAppInputs } from '#bundle/branded-app-plan.ts';
import { BUNDLE_SOURCES } from '#bundle/index.ts';

/**
 * Inputs for a key.
 */
const INPUTS: BrandedAppInputs = {
  electronVersion: '45.3.2',
  arch: 'arm64',
  signing: 'outer',
  electronExecutableHash: 'a',
  electronPlistHash: 'b',
  iconHash: 'c',
  stubHash: 'd',
};

describe('the branded app key', () => {
  it('is 16 hex characters and stable', () => {
    const key = brandedAppKey(INPUTS);
    expect(key).toMatch(/^[0-9a-f]{16}$/);
    expect(brandedAppKey({ ...INPUTS })).toBe(key);
  });

  it.each([
    ['electronVersion', '45.3.3'],
    ['arch', 'x64'],
    ['signing', 'none'],
    ['electronExecutableHash', 'x'],
    ['electronPlistHash', 'x'],
    ['iconHash', 'x'],
    ['stubHash', 'x'],
  ] as const)('changes with %s', (field, value) => {
    expect(brandedAppKey({ ...INPUTS, [field]: value })).not.toBe(brandedAppKey(INPUTS));
  });
});

describe('the branded app key and the plan', () => {
  it('changes when a usage string in the plan changes', () => {
    const plan = brandedAppPlan('outer', '', '');
    const edited = {
      ...plan,
      plists: plan.plists.map((plist) => ({
        ...plist,
        edits: plist.edits.map((edit) =>
          edit.op === 'replace' && edit.key === 'NSCameraUsageDescription'
            ? { ...edit, value: 'Another reason.' }
            : edit,
        ),
      })),
    };
    expect(brandedAppKey(INPUTS, edited)).not.toBe(brandedAppKey(INPUTS, plan));
    expect(brandedAppKey(INPUTS, plan)).toBe(brandedAppKey(INPUTS));
  });
});

describe('the branded app plan', () => {
  const plan = brandedAppPlan('outer', 'k', '45.3.2');

  it('renames the executable and the four helpers, executable before folder', () => {
    expect(plan.executable).toBe('Contents/MacOS/Deckster');
    expect(plan.renames.map((rename) => rename.to)).toEqual([
      'Contents/MacOS/Deckster',
      'Contents/Frameworks/Electron Helper.app/Contents/MacOS/Deckster Helper',
      'Contents/Frameworks/Deckster Helper.app',
      'Contents/Frameworks/Electron Helper (GPU).app/Contents/MacOS/Deckster Helper (GPU)',
      'Contents/Frameworks/Deckster Helper (GPU).app',
      'Contents/Frameworks/Electron Helper (Plugin).app/Contents/MacOS/Deckster Helper (Plugin)',
      'Contents/Frameworks/Deckster Helper (Plugin).app',
      'Contents/Frameworks/Electron Helper (Renderer).app/Contents/MacOS/Deckster Helper (Renderer)',
      'Contents/Frameworks/Deckster Helper (Renderer).app',
    ]);
  });

  it('edits the main plist and one plist per helper', () => {
    expect(plan.plists).toHaveLength(5);
    const main = plan.plists[0];
    expect(main?.file).toBe('Contents/Info.plist');
    expect(main?.edits).toContainEqual({ op: 'replace', key: 'CFBundleName', value: 'Deckster' });
    expect(main?.edits).toContainEqual({
      op: 'replace',
      key: 'CFBundleIdentifier',
      value: 'dev.deckster.shell',
    });
    expect(main?.edits).toContainEqual({ op: 'remove', key: 'ElectronAsarIntegrity' });
    const renderer = plan.plists[4];
    expect(renderer?.file).toBe(
      'Contents/Frameworks/Deckster Helper (Renderer).app/Contents/Info.plist',
    );
    expect(renderer?.edits).toEqual([
      { op: 'replace', key: 'CFBundleName', value: 'Deckster Helper (Renderer)' },
      { op: 'replace', key: 'CFBundleDisplayName', value: 'Deckster Helper (Renderer)' },
      { op: 'replace', key: 'CFBundleExecutable', value: 'Deckster Helper (Renderer)' },
      { op: 'replace', key: 'CFBundleIdentifier', value: 'dev.deckster.shell.helper' },
    ]);
  });

  it('signs the helpers, then the app, and never the frameworks', () => {
    expect(plan.signing).toHaveLength(2);
    expect(plan.signing[0]).toHaveLength(4);
    expect(plan.signing[1]).toEqual(['.']);
    expect(plan.signing.flat().join('\n')).not.toContain('.framework');
    expect(plan.verify).toHaveLength(5);
  });

  it('signs nothing without a signing mode and says so in its stamp', () => {
    const unsigned = brandedAppPlan('none', 'k', '45.3.2');
    expect(unsigned.signing).toEqual([]);
    expect(unsigned.verify).toEqual([]);
    expect(JSON.parse(unsigned.stamp)).toMatchObject({ key: 'k', signing: 'none' });
  });

  it('replaces the icon and the default app', () => {
    expect(plan.removals).toEqual([
      'Contents/Resources/electron.icns',
      'Contents/Resources/default_app.asar',
    ]);
    expect(plan.icon).toBe('Contents/Resources/Deckster.icns');
  });

  it('has the files it copies', () => {
    expect(existsSync(BUNDLE_SOURCES.icon)).toBe(true);
    for (const file of BUNDLE_SOURCES.stubFiles) {
      expect(existsSync(`${BUNDLE_SOURCES.stubFolder}${file}`)).toBe(true);
    }
  });
});

describe('isStockElectron', () => {
  it.each([
    ['/x/Electron.app/Contents/MacOS/Electron', true],
    ['/x/electron', true],
    ['C:\\x\\electron.exe', true],
    ['/x/Deckster.app/Contents/MacOS/Deckster', false],
  ])('%s is %s', (file, expected) => {
    expect(isStockElectron(file)).toBe(expected);
  });
});
