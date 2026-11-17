import { Predicate } from 'effect';

/**
 * A warning a kit plugin reported; the plugin sets its fix as the `note`.
 */
export type KitMessage = {
  /**
   * How to fix the problem, which `deck lint` shows as the finding's fix.
   */
  note?: string;
};

/**
 * The parts of a vfile the kit's remark plugins use: warnings with an origin, and failures that
 * name the place in the slide.
 */
export type KitFile = {
  /**
   * The slide's absolute path.
   */
  path?: string;

  /**
   * The source the tree was parsed from.
   */
  value?: unknown;

  /**
   * Records a warning the build prints. The origin `deck:<rule>` names the kind of problem, which
   * `deck lint` reports as its rule id.
   */
  message: (reason: string, place?: unknown, origin?: string) => KitMessage;

  /**
   * Throws a build error that names the slide and line of `place`.
   */
  fail: (reason: string, place?: unknown) => never;
};

/**
 * The kinds of warning the kit reports, which `deck lint` shows as rule ids.
 */
export type KitWarningRule =
  | 'media-missing'
  | 'media-gif'
  | 'code-unknown-language'
  | 'code-step-range'
  | 'terminal-tone'
  | 'treatment-unknown';

/**
 * Reports a warning with its kind and fix: the build prints both, and `deck lint` turns it into a
 * finding with the kind as its rule id.
 *
 * @param file - The vfile.
 * @param warning - The kind, what is wrong and how to fix it.
 * @param place - The node it is about, for the line.
 */
export function warn(
  file: Pick<KitFile, 'message'>,
  warning: { rule: KitWarningRule; problem: string; fix: string },
  place: unknown,
): void {
  const message = file.message(warning.problem, place, `deck:${warning.rule}`);
  message.note = warning.fix;
}

/**
 * The kinds of build failure the kit reports with their own fix.
 */
export type KitFailureRule = 'media-path' | 'icon-unknown' | 'diagram';

/**
 * Fails the build with what is wrong and how to fix it. The failure has the source `deck`, so the
 * build shows this fix instead of its generic one about JSX syntax.
 *
 * @param file - The vfile.
 * @param failure - The kind, what is wrong and how to fix it.
 * @param place - The node it is about, for the line; nothing for the frontmatter.
 */
export function failBuild(
  file: Pick<KitFile, 'fail'>,
  failure: { rule: KitFailureRule; problem: string; fix: string },
  place: { position?: unknown } | undefined,
): never {
  try {
    return file.fail(failure.problem, {
      ...(place?.position === undefined ? {} : { place: place.position }),
      ruleId: failure.rule,
      source: 'deck',
    });
  } catch (error) {
    if (Predicate.isObject(error)) {
      Object.assign(error, { note: failure.fix });
    }

    throw error;
  }
}
