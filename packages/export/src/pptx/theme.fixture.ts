import type { SurfaceTheme } from '#pptx/theme.ts';

export { opaque } from '#pptx/theme.ts';

/**
 * A light surface theme: ink text on near-white, a cobalt accent.
 *
 * @param overrides - Fields that differ.
 */
export function surfaceThemeFixture(overrides: Partial<SurfaceTheme> = {}): SurfaceTheme {
  return {
    surface: 'default',
    scheme: 'light',
    colors: {
      dk1: '161920',
      lt1: 'FCFCFD',
      dk2: '555C6A',
      lt2: 'F4F5F8',
      accent1: '2D4AE0',
      accent2: 'B86E00',
      accent3: '0B8A7C',
      accent4: '6A3FF0',
      accent5: 'D6335A',
      accent6: '707786',
      hlink: '2D4AE0',
      folHlink: '555C6A',
    },
    lookup: new Map([
      ['#161920', 'tx1'],
      ['#FCFCFD', 'bg1'],
      ['#555C6A', 'tx2'],
      ['#F4F5F8', 'bg2'],
      ['#2D4AE0', 'accent1'],
    ]),
    fonts: { major: 'Bricolage Grotesque', minor: 'Inter' },
    background: { kind: 'solid', color: '#fcfcfd' },
    texture: null,
    ...overrides,
  };
}
