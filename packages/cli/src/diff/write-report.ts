import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { fileSystemError, type FileSystemError } from '#cli-error.ts';
import { relativeReport, type DiffReport } from '#diff/diff-report.ts';
import { renderHtml } from '#diff/render-html.ts';
import { renderSummary } from '#diff/render-summary.ts';

/**
 * Spaces of indentation in `report.json`.
 */
const JSON_INDENT_SPACES = 2;

/**
 * Writes `report.json`, `summary.md` and `index.html` into the report folder, all with picture
 * paths relative to it, so the folder can be uploaded or moved as it is.
 *
 * @param report - The report with absolute paths.
 * @throws FileSystemError in the error channel when a file cannot be written.
 */
export const writeReport = Effect.fn('writeReport')(function* (
  report: DiffReport,
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const relative = relativeReport(report);
  const files: readonly (readonly [string, string])[] = [
    ['report.json', `${JSON.stringify(relative, null, JSON_INDENT_SPACES)}\n`],
    ['summary.md', renderSummary(relative)],
    ['index.html', renderHtml(relative)],
  ];
  for (const [name, content] of files) {
    const file = path.join(report.outDir, name);
    yield* fs
      .writeFileString(file, content)
      .pipe(
        Effect.mapError((error) =>
          fileSystemError(
            'write the report file',
            file,
            error,
            'Pass `--out` a folder that can be written, or leave it out to use the default.',
          ),
        ),
      );
  }
});
