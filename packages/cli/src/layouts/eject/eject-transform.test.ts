import { KIT_SRC_DIR } from '@deckster/kit/eject-closure';
import { LIMIT_CASES } from '@deckster/kit/limit-cases';
import { afterAll, describe, expect, it } from '@effect/vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  readEjectSource,
  transformLayout,
  type EjectedLayout,
} from '#layouts/eject/eject-transform.ts';

/**
 * The packages a contract and the `.ts` files it reaches may import.
 */
const CONTRACT_IMPORTS =
  /^(?:effect(?:\/.*)?|@deckster\/engine\/(?:layout|command)|@deckster\/kit\/layout-fields|@deckster\/brand)$/u;

/**
 * Matches the specifier of every import and re-export of a module.
 */
const SPECIFIER = /^(?:import|export)\s[^'";]*?from\s+'([^']+)'|^import\s+'([^']+)'/gmu;

/**
 * Matches an `import type` statement, which a contract may use for anything.
 */
const TYPE_IMPORT = /^import type\s[^'";]*?from\s+'[^']+';?$/gmu;

/**
 * Temp folders to remove after the tests.
 */
const scratch: string[] = [];

/**
 * The kit's source and every layout's transform, computed once.
 */
const source = readEjectSource();

/**
 * Every kit layout, ejected.
 */
const ejected = new Map<string, EjectedLayout>(
  source.names.map((name) => [name, transformLayout(source, name, LIMIT_CASES[name] ?? [])]),
);

/**
 * One ejected layout.
 *
 * @param name - The layout.
 */
function layout(name: string): EjectedLayout {
  const found = ejected.get(name);
  if (found === undefined) {
    throw new Error(`The kit has no layout "${name}".`);
  }

  return found;
}

/**
 * The specifiers a module imports with value imports and re-exports.
 *
 * @param text - The module's text.
 */
function valueSpecifiers(text: string): string[] {
  return [...text.replace(TYPE_IMPORT, '').matchAll(SPECIFIER)].map(
    (match) => match[1] ?? match[2] ?? '',
  );
}

/**
 * Every package import a layout's contract reaches, through the `.ts` files it imports.
 *
 * @param name - The layout.
 * @param result - Its ejected files.
 * @returns One entry per import: the layout, the file that has it and the package.
 */
function contractReach(
  name: string,
  result: EjectedLayout,
): { name: string; file: string; specifier: string }[] {
  const shared = '../_shared/';
  const reached: { name: string; file: string; specifier: string }[] = [];
  const pending = ['contract.ts'];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop() ?? '';
    if (seen.has(file)) {
      continue;
    }

    seen.add(file);
    const text = file.startsWith(shared)
      ? result.shared[file.slice(shared.length)]
      : result.files[file];
    for (const specifier of valueSpecifiers(text ?? '')) {
      const inShared = file.startsWith(shared) || specifier.startsWith(shared);
      if (!specifier.startsWith('.')) {
        reached.push({ name, file, specifier });
      } else if (inShared) {
        pending.push(`${shared}${path.posix.basename(specifier)}`);
      } else {
        pending.push(specifier.slice('./'.length));
      }
    }
  }

  return reached;
}

/**
 * Copies the kit's source to a temp folder and changes one file of the copy.
 *
 * @param file - A path under the kit's `src`.
 * @param change - Maps the file's text to its new text.
 * @returns The copy's `src` folder.
 */
function changedKit(file: string, change: (text: string) => string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-eject-kit-'));
  scratch.push(dir);
  fs.cpSync(KIT_SRC_DIR, dir, { recursive: true });
  const target = path.join(dir, file);
  fs.writeFileSync(target, change(fs.readFileSync(target, 'utf8')));
  return dir;
}

afterAll(() => {
  for (const dir of scratch) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('transformLayout', () => {
  it('ejects every layout of the catalog without a problem', () => {
    expect(source.problems).toEqual([]);
    expect(source.names).toHaveLength(64);
    for (const [name, result] of ejected) {
      expect(result.problems, name).toEqual([]);
      expect(Object.keys(result.files), name).toEqual(
        expect.arrayContaining(['contract.ts', 'layout.tsx', 'limits.ts']),
      );
    }
  });

  it('leaves no kit-internal import in any file', () => {
    for (const [name, result] of ejected) {
      for (const [file, text] of Object.entries({ ...result.files, ...result.shared })) {
        expect(text, `${name}/${file}`).not.toMatch(/(?:from|import)\s*\(?\s*'#/u);
      }
    }
  });

  it('marks every contract as a replacement and gives both modules a default export', () => {
    for (const [name, result] of ejected) {
      const contract = result.files['contract.ts'] ?? '';
      expect(contract, name).toContain(`  name: '${name}',\n  replaces: true,\n`);
      expect(contract, name).toMatch(/\nexport default \w+LayoutContract;\n$/u);
      expect(result.files['layout.tsx'], name).toMatch(/\nexport default \w+Layout;\n$/u);
      expect(result.files['layout.tsx'], name).toMatch(new RegExp(`\\bname: '${name}'`, 'u'));
    }
  });

  it('gives a helper the same text whichever layout needs it', () => {
    const texts = new Map<string, string>();
    for (const [name, result] of ejected) {
      for (const [file, text] of Object.entries(result.shared)) {
        expect(texts.get(file) ?? text, `${file} for ${name}`).toBe(text);
        texts.set(file, text);
      }
    }

    expect([...texts.keys()]).toEqual(
      expect.arrayContaining(['portrait.tsx', 'portrait.css', 'pattern-slide.contract.ts']),
    );
  });

  it('lets every contract reach only what a contract may import', () => {
    const reached = [...ejected].flatMap(([name, result]) => contractReach(name, result));
    expect(reached.filter((entry) => !entry.file.endsWith('.ts'))).toEqual([]);
    expect(reached.filter((entry) => !CONTRACT_IMPORTS.test(entry.specifier))).toEqual([]);
    expect(reached.length).toBeGreaterThan(64);
  });

  it('points the title at the public parts and keeps its own constants', () => {
    const { files, shared } = layout('title');
    expect(shared).toEqual({});
    expect(Object.keys(files).toSorted()).toEqual([
      'contract.ts',
      'display-align.css',
      'image-layout.css',
      'layout.css',
      'layout.tsx',
      'limits.ts',
    ]);
    const component = files['layout.tsx'] ?? '';
    expect(component).toContain("import { treatmentProps } from '@deckster/kit/layout-fields';");
    expect(component).toContain("} from '@deckster/kit/layout-parts';");
    expect(component).toContain(
      "import type { CoverPicture, titleLayoutContract } from './contract.ts';",
    );
    expect(component).toContain(
      "import './display-align.css';\nimport './image-layout.css';\nimport './layout.css';",
    );
    expect(component).toContain('const TITLE_MAX_LINES = 3;');
    expect(files['layout.css']).toBe(
      fs.readFileSync(path.join(KIT_SRC_DIR, 'layouts/title-layout.css'), 'utf8'),
    );
  });

  it('scopes the stylesheets the title shares with other kit layouts to the title', () => {
    const { files } = layout('title');
    expect(files['display-align.css']).toContain(
      ".kit-frame:where([data-layout='title'])[data-display-align][data-align='center'] .kit-eyebrow {",
    );
    const image = files['image-layout.css'] ?? '';
    expect(image).toContain(":where(.kit-frame[data-layout='title']) .kit-image-scrim {");
    expect(image).not.toContain("[data-layout='image']");
    for (const line of image.split('\n').filter((text) => /^ {2}\.kit-/u.test(text))) {
      expect(line).toContain(":where([data-layout='title'])");
    }

    expect(layout('stats').files['stat-cards.css']).toContain(
      ":where(.kit-frame[data-layout='stats']) .kit-stat-value {",
    );
  });

  it('renames the classes of a copied helper everywhere the layout uses them', () => {
    const bio = layout('bio');
    expect(bio.shared['contact-list.css']).toContain('.own-contacts {');
    expect(bio.shared['contact-list.css']).not.toMatch(/\.kit-contact/u);
    expect(bio.shared['contact-list.tsx']).toContain('className="own-contact"');
    expect(bio.shared['contact-list.tsx']).toContain('own-contact-label kit-type-label');
    expect(bio.shared['portrait.tsx']).toContain("'own-portrait'");
    expect(bio.files['layout.tsx']).toContain('className="own-contacts-stacked"');
    expect(bio.files['layout.css']).toContain('.own-contacts');
    expect(bio.shared['contact-list.tsx']).toContain("import { Link } from './link.tsx';");
    expect(bio.files['layout.tsx']).toContain(
      "import { ContactList } from '../_shared/contact-list.tsx';",
    );
  });

  it('keeps kit classes the layout does not own, and names that only start like one', () => {
    expect(layout('screen').files['layout.css']).toContain('--kit-badge:');
    expect(layout('proof').shared['mono-mark.tsx']).toContain('`kit-mark-mono-${');
    expect(layout('proof').shared['mono-mark.tsx']).toContain("'--kit-mark-aspect'");
    expect(layout('stats').files['layout.tsx']).toContain('kit-stat');
  });

  it('rewrites a re-export and shares contract helpers as .ts files', () => {
    const quiz = layout('quiz');
    expect(quiz.files['contract.ts']).toContain(
      "export { QUIZ_LETTERS, QUIZ_TILE_MAX_CHARS } from '../_shared/quiz-values.ts';",
    );
    expect(Object.keys(quiz.shared)).toContain('quiz-values.ts');
    expect(layout('future-back').files['contract.ts']).toContain(
      "from '../_shared/pattern-slide.contract.ts';",
    );
  });

  it('writes the limit cases it is given', () => {
    const cases = LIMIT_CASES['title'] ?? [];
    expect(cases.length).toBeGreaterThan(0);
    for (const limitCase of cases) {
      expect(layout('title').files['limits.ts']).toContain(`name: '${limitCase.name}'`);
    }
  });

  it('reports a name that is not in the catalog', () => {
    expect(transformLayout(source, 'brand', []).problems).toEqual([
      '"brand" is not a layout of the kit\'s catalog.',
    ]);
  });

  it('says so when the kit adds a private import that keeps shared state', () => {
    const srcDir = changedKit('layouts/title-layout.tsx', (text) =>
      text.replace(
        "import '#layouts/title-layout.css';",
        "import { MediaFrameContext } from '#media/media-frame.ts';\nimport '#layouts/title-layout.css';",
      ),
    );
    const result = transformLayout(readEjectSource(srcDir), 'title', []);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('media/media-frame.ts');
    expect(result.problems[0]).toContain('keeps shared state');
  });

  it('says so when a contract would import something a contract may not', () => {
    const srcDir = changedKit(
      'layouts/title-layout.contract.ts',
      (text) => `import { useSlideFile } from '#foundation/slide-file.ts';\n${text}`,
    );
    const { problems } = transformLayout(readEjectSource(srcDir), 'title', []);
    expect(problems.join('\n')).toContain('@deckster/engine: not a package a contract may import');
  });

  it('says so when a layout imports a package a workspace cannot resolve', () => {
    const srcDir = changedKit(
      'layouts/title-layout.tsx',
      (text) => `import { encode } from 'uqr';\n${text}`,
    );
    const { problems } = transformLayout(readEjectSource(srcDir), 'title', []);
    expect(problems).toEqual([
      'layouts/title-layout.tsx imports the package uqr, which a workspace cannot resolve.',
    ]);
  });
});
