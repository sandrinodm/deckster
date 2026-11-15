import type { FontPlan } from '#fonts/font-plan.ts';

/**
 * A static instance as a file for `<out>/fonts/`.
 */
export type FontFile = {
  /**
   * The file name, `<PostScript name>.ttf`.
   */
  fileName: string;

  /**
   * The family name the file installs, which the PPTX refers to.
   */
  family: string;

  /**
   * The face it fills.
   */
  style: 'Regular' | 'Bold' | 'Italic' | 'Bold Italic';

  /**
   * The TrueType bytes.
   */
  data: Uint8Array;
};

/**
 * The plan's instances as files to write to `<out>/fonts/`: installing them gives apps that ignore
 * embedded fonts the exact fonts the PPTX names, and the LibreOffice "fonts installed" check uses
 * them (mount each under its `family`).
 *
 * @param plan - The font plan.
 * @returns One file per instance.
 */
export function fontFiles(plan: Pick<FontPlan, 'instances'>): FontFile[] {
  const styles = {
    regular: 'Regular',
    bold: 'Bold',
    italic: 'Italic',
    boldItalic: 'Bold Italic',
  } as const;
  return plan.instances.map((instance) => ({
    fileName: instance.fileName,
    family: instance.familyName,
    style: styles[instance.slot],
    data: instance.data,
  }));
}

/**
 * The line the CLI prints about the font files.
 *
 * @param folder - The folder the files were written to.
 * @param plan - The font plan.
 */
export function fontsReadme(
  folder: string,
  plan: Pick<FontPlan, 'instances' | 'families'>,
): string {
  const familyCount = plan.families.length;
  const familyWord = `famil${familyCount === 1 ? 'y' : 'ies'}`;
  const typefaces = plan.families.map((family) => family.typeface).join(', ');
  return [
    `${folder}: ${plan.instances.length} static TrueType instance(s) in `,
    `${familyCount} ${familyWord} (${typefaces}), cut from the brand fonts at the exact axes `,
    'the deck uses and embedded in the PPTX; install them where an app ignores embedded fonts ' +
      '(Keynote, Google Slides, LibreOffice).',
  ].join('');
}
