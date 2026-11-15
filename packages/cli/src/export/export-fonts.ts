import type { BrandTokens } from '@deckster/brand';

import {
  emptyFontPlan,
  fntdata,
  fontFiles,
  fontsReadme,
  fontUses,
  instanceFonts,
  type EmbeddedFont,
  type FontChoice,
  type FontPlan,
  type FontStyleKey,
  type PptxFonts,
  type SlideScene,
} from '@deckster/export';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { OpenedDeck } from '#browser/open-deck.ts';
import type { ExportOptions } from '#export/export-options.ts';

import { cliError, fileSystemError, type CliError, type FileSystemError } from '#cli-error.ts';

/**
 * The weight from which PowerPoint's bold is used for a family that is not embedded.
 */
const BOLD_FROM_WEIGHT = 600;

/**
 * Generic CSS families a run can render in when no named family has its characters.
 */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'emoji',
  'cursive',
  'fantasy',
]);

/**
 * How far apart two weights or axis values count, per unit, when no instance has a run's exact
 * axes.
 */
const AXIS_SCALE: Readonly<Record<string, number>> = {
  /**
   * Weight: 100 apart is one step.
   */
  wght: 100,

  /**
   * Width: 10% apart is one step.
   */
  wdth: 10,

  /**
   * Optical size: 24 apart is one step.
   */
  opsz: 24,
};

/**
 * The fonts an export embeds: static instances of the brand's variable fonts at the axes the slides
 * use, or none with `--no-embed-fonts` and `--fonts system`.
 *
 * @param opened - The open deck.
 * @param scenes - The measured slides.
 * @param options - The export options.
 * @returns The plan.
 * @throws CliError in the error channel when a font cannot be read or does not allow embedding.
 */
export const planFonts = Effect.fn('planFonts')(function* (
  opened: OpenedDeck,
  scenes: readonly SlideScene[],
  options: Pick<ExportOptions, 'embedFonts'>,
): Effect.fn.Return<FontPlan, CliError, FileSystem.FileSystem> {
  const brand = opened.brand.tokens;
  if (!options.embedFonts) {
    return emptyFontPlan(brand);
  }

  return yield* instanceFonts(fontUses(scenes), opened.brand.fontFaces, brand).pipe(
    Effect.mapError((error) => cliError(error.message)),
  );
});

/**
 * How the PPTX sets runs in fonts, from a font plan: an embedded instance where the plan has one
 * (bold and italic as its slot needs), else the brand family named as it is (or, with `--fonts
 * system`, its substitute) with the substitute's PANOSE and pitch so apps without it pick a similar
 * font, and other families as rendered. The theme's heading and body fonts are the instances of the
 * brand's headline and body steps; runs in them are theme references.
 *
 * @param plan - The font plan.
 * @param brand - The resolved brand.
 * @param options - The export options.
 */
export function pptxFonts(
  plan: FontPlan,
  brand: BrandTokens,
  options: Pick<ExportOptions, 'fonts'>,
): PptxFonts {
  /**
   * The font of a run before theme references.
   */
  const choose = (style: FontStyleKey): FontChoice => chooseFont(plan, brand, options, style);
  const { scale, families } = brand.typography;
  const major = choose(stepKey(scale.headline, families));
  const minor = choose(stepKey(scale.body, families));
  return {
    resolve: (style) => {
      const chosen = choose(style);
      if (chosen.typeface === major.typeface) {
        return { ...chosen, typeface: '+mj-lt' };
      }

      return chosen.typeface === minor.typeface ? { ...chosen, typeface: '+mn-lt' } : chosen;
    },
    theme: { major, minor },
    embedded: embeddedFonts(plan),
  };
}

/**
 * The font of a run before theme references: an embedded instance when the plan has one, else the
 * brand family or its substitute, else a generic fallback.
 *
 * @param plan - The font plan.
 * @param brand - The resolved brand.
 * @param options - The export options.
 * @param style - The run style.
 */
function chooseFont(
  plan: FontPlan,
  brand: BrandTokens,
  options: Pick<ExportOptions, 'fonts'>,
  style: FontStyleKey,
): FontChoice {
  const resolved = plan.resolve(style);
  if (resolved !== null) {
    return resolved;
  }

  const bold = style.weight >= BOLD_FROM_WEIGHT;
  const nearest = options.fonts === 'brand' ? nearestInstance(plan, style) : null;
  if (nearest !== null) {
    return nearest;
  }

  const substitute = plan.substituteFor(style.family);
  if (substitute !== null) {
    return {
      typeface: options.fonts === 'system' ? substitute.family : style.family,
      bold,
      italic: style.italic,
      panose: substitute.panose,
      pitchFamily: substitute.pitchFamily,
      charset: substitute.charset,
    };
  }

  if (GENERIC_FAMILIES.has(style.family)) {
    const body = brand.typography.families.body.substitute;
    return { typeface: body.family, bold, italic: style.italic, fallback: true };
  }

  return { typeface: style.family, bold, italic: style.italic, fallback: true };
}

/**
 * The style key of a type step.
 *
 * @param step - The type step of the brand's scale.
 * @param families - The brand's font families by name.
 */
function stepKey(
  step: BrandTokens['typography']['scale'][keyof BrandTokens['typography']['scale']],
  families: BrandTokens['typography']['families'],
): FontStyleKey {
  return {
    family: families[step.family].family,
    weight: step.weight,
    italic: step.style === 'italic',
    axes: { wght: step.weight, ...step.axes },
    size: step.size,
  };
}

/**
 * The embedded instance closest to a run the plan has no exact instance for (a style only a
 * diagram's or chart's description names), so the run is still set in an embedded font: the same
 * brand family and italics, then the nearest weight and axes.
 *
 * @param plan - The font plan.
 * @param style - The run style.
 */
function nearestInstance(plan: FontPlan, style: FontStyleKey): FontChoice | null {
  const candidates = plan.instances.filter(
    (instance) => instance.sourceFamily === style.family && instance.italic === style.italic,
  );
  let best: (typeof candidates)[number] | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const instance of candidates) {
    const tags = new Set([...Object.keys(instance.axes), ...Object.keys(style.axes), 'wght']);
    let distance = 0;
    for (const tag of tags) {
      const mine = tag === 'wght' ? style.weight : style.axes[tag];
      const theirs = tag === 'wght' ? instance.weight : instance.axes[tag];
      if (mine !== undefined && theirs !== undefined) {
        distance += Math.abs(mine - theirs) / (AXIS_SCALE[tag] ?? 1);
      }
    }

    if (distance < bestDistance) {
      best = instance;
      bestDistance = distance;
    }
  }

  if (best === undefined) {
    return null;
  }

  return {
    typeface: best.familyName,
    bold: best.slot === 'bold' || best.slot === 'boldItalic',
    italic: best.slot === 'italic' || best.slot === 'boldItalic',
    panose: best.panose,
    pitchFamily: best.pitchFamily,
    charset: best.charset,
  };
}

/**
 * The plan's families as the PPTX embeds them, each style's data in the format PowerPoint reads.
 *
 * @param plan - The font plan.
 */
function embeddedFonts(plan: FontPlan): EmbeddedFont[] {
  return plan.families.map((family) => {
    const styles: EmbeddedFont['styles'] = {};
    for (const [slot, instance] of Object.entries(family.slots)) {
      if (instance !== undefined) {
        styles[slot as keyof EmbeddedFont['styles']] = fntdata(instance.data);
      }
    }

    return {
      typeface: family.typeface,
      panose: family.panose,
      pitchFamily: family.pitchFamily,
      charset: family.charset,
      styles,
    };
  });
}

/**
 * Writes the plan's static instances to `<out>/fonts/` as TrueType files.
 *
 * @param plan - The font plan.
 * @param outDir - The export folder.
 * @returns The folder, the files and the line the CLI prints, or `null` when nothing was cut.
 * @throws FileSystemError in the error channel when a file cannot be written.
 */
export const writeFontFiles = Effect.fn('writeFontFiles')(function* (
  plan: FontPlan,
  outDir: string,
): Effect.fn.Return<
  { folder: string; files: string[]; note: string } | null,
  FileSystemError,
  FileSystem.FileSystem
> {
  const files = fontFiles(plan);
  if (files.length === 0) {
    return null;
  }

  const fs = yield* FileSystem.FileSystem;
  const folder = path.join(outDir, 'fonts');
  yield* fs.makeDirectory(folder, { recursive: true }).pipe(Effect.ignore);
  const written: string[] = [];
  for (const file of files) {
    const target = path.join(folder, file.fileName);
    yield* fs
      .writeFile(target, file.data)
      .pipe(
        Effect.mapError((error) =>
          fileSystemError(
            'write the font',
            target,
            error,
            'Pass `--out` a folder that can be written.',
          ),
        ),
      );
    written.push(target);
  }

  return { folder, files: written, note: fontsReadme(folder, plan) };
});
