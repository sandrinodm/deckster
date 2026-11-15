import { FRAMEWORK_INSTALLED, FRAMEWORK_ROOT, readFrameworkManifest } from '@deckster/brand/node';
import { Effect, FileSystem, Schema } from 'effect';
import path from 'node:path';

/**
 * The `version` field of the CLI's own `package.json`, the source of the version in the repository.
 */
const PackageVersion = Schema.fromJsonString(Schema.Struct({ version: Schema.String }));

/**
 * The version `deck --version` prints: the published version recorded in the framework folder when
 * installed, else the version in this package's `package.json`.
 *
 * @returns The version, or `unknown` when it cannot be read.
 */
export const cliVersion = Effect.fn('cliVersion')(function* (): Effect.fn.Return<
  string,
  never,
  FileSystem.FileSystem
> {
  if (FRAMEWORK_INSTALLED) {
    return readFrameworkManifest(FRAMEWORK_ROOT)?.version ?? 'unknown';
  }

  const fs = yield* FileSystem.FileSystem;
  const file = path.join(import.meta.dirname, '..', 'package.json');
  return yield* fs.readFileString(file).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(PackageVersion)),
    Effect.map((manifest) => manifest.version),
    Effect.orElseSucceed(() => 'unknown'),
  );
});
