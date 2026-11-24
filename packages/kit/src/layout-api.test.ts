import { Schema } from 'effect';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

import {
  printDeclaration,
  printReferencedTypes,
  reexportedNames,
  type ReexportedName,
} from '#layout-api.fixture.ts';
import * as layoutFields from '#layout-fields.ts';
import * as layoutParts from '#layout-parts.ts';

const SRC_DIR = fileURLToPath(new URL('.', import.meta.url));

/**
 * Prints one public module as the text the snapshot file holds: its exports with their signatures,
 * then the types those signatures name.
 */
function printModule(specifier: string, file: string): string {
  const names = reexportedNames(SRC_DIR, file);
  const exports = names.map((name) => printDeclaration(SRC_DIR, name));
  const types = printReferencedTypes(SRC_DIR, names);
  return [
    `// ${specifier}`,
    ...exports,
    '',
    `// types the signatures above name`,
    ...types,
    '',
  ].join('\n');
}

/**
 * The value exports among the names (the ones that exist at run time), sorted.
 */
function valueNames(names: ReexportedName[]): string[] {
  return names
    .filter((name) => !name.isType)
    .map((name) => name.name)
    .sort();
}

describe('@deckster/kit/layout-parts', () => {
  it('exports the names the list names, and only those', () => {
    const names = reexportedNames(SRC_DIR, 'layout-parts.ts');
    expect(Object.keys(layoutParts).sort()).toEqual(valueNames(names));
  });

  it('keeps its signatures', async () => {
    await expect(printModule('@deckster/kit/layout-parts', 'layout-parts.ts')).toMatchFileSnapshot(
      './layout-parts.api.snapshot.txt',
    );
  });
});

describe('@deckster/kit/layout-fields', () => {
  it('exports the names the list names, and only those', () => {
    const names = reexportedNames(SRC_DIR, 'layout-fields.ts');
    expect(Object.keys(layoutFields).sort()).toEqual(valueNames(names));
  });

  it('loads in plain Node, as a contract does', () => {
    const script =
      "const fields = await import('@deckster/kit/layout-fields');" +
      'console.log(JSON.stringify(Object.keys(fields).sort()));';
    const output = execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      encoding: 'utf8',
    });
    expect(JSON.parse(output)).toEqual(valueNames(reexportedNames(SRC_DIR, 'layout-fields.ts')));
  });

  it('keeps its signatures', async () => {
    await expect(
      printModule('@deckster/kit/layout-fields', 'layout-fields.ts'),
    ).toMatchFileSnapshot('./layout-fields.api.snapshot.txt');
  });

  it('keeps what its schemas accept', async () => {
    const schemas = {
      AlignField: layoutFields.AlignField,
      chromeField: layoutFields.chromeField(true),
      ContactItem: layoutFields.ContactItem,
      DataField: layoutFields.DataField,
      EyebrowField: layoutFields.EyebrowField,
      FocalField: layoutFields.FocalField,
      IconNameField: layoutFields.IconNameField,
      RevealField: layoutFields.RevealField,
      textField: layoutFields.textField(10, 'a title'),
      TreatmentField: layoutFields.TreatmentField,
    };
    const text = Object.entries(schemas)
      .map(([name, schema]) => `${name}: ${JSON.stringify(Schema.toJsonSchemaDocument(schema))}`)
      .join('\n');
    await expect(`${text}\n`).toMatchFileSnapshot('./layout-fields.schemas.snapshot.txt');
  });
});
