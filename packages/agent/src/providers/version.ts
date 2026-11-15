/**
 * An `x.y.z` version number.
 */
const VERSION_PATTERN = /\d+\.\d+\.\d+/;

/**
 * The first `x.y.z` version in a CLI's `--version` output, such as `2.1.325` in `2.1.325 (Claude
 * Code)` or `0.167.2` in `codex-cli 0.167.2`.
 *
 * @param output - What `--version` printed.
 */
export function readVersion(output: string): string | null {
  return VERSION_PATTERN.exec(output)?.[0] ?? null;
}

/**
 * The major and minor part of a version, such as `2.1` of `2.1.325`.
 *
 * @param version - A version such as `2.1.325`.
 */
function minorLine(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}

/**
 * A note (never a problem) when the installed version is outside the tested range: another major or
 * minor release than the one the adapter was recorded with, where flags and event shapes may
 * change. Patch releases, which both CLIs ship almost daily, are in range.
 *
 * @param label - The CLI's name.
 * @param found - The installed version, or null when unknown.
 * @param tested - The version the transcripts were recorded with.
 */
export function versionWarning(label: string, found: string | null, tested: string): string[] {
  if (found !== null && minorLine(found) === minorLine(tested)) {
    return [];
  }

  return [
    found === null
      ? `Could not read the ${label} version; the adapter was tested with ${tested}.`
      : `${label} ${found} is installed; the adapter was tested with ${minorLine(tested)}.x ` +
        `(recorded with ${tested}). If turns fail, ` +
        'check the recorded transcripts against this version.',
  ];
}
