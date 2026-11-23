import { Effect } from 'effect';

import { usageError, type CliError } from '#cli-error.ts';

/**
 * The command that names a brand source, for usage errors.
 */
const COMMAND = 'brand';

/**
 * The host the `gh:` shorthand and pasted GitHub links point at.
 */
const GITHUB_HOST = 'github.com';

/**
 * The prefixes of the GitHub shorthand: `gh:owner/repo/folder#ref`.
 */
const SHORTHAND_PREFIXES: readonly string[] = ['gh:', 'github:'];

/**
 * What separates the repository from the folder in a git address: `repo.git//brands/acme`.
 */
const FOLDER_SEPARATOR = '//';

/**
 * The path segment of a pasted GitHub link that comes before the ref: `/tree/main/brands/acme`.
 */
const TREE_SEGMENT = 'tree';

/**
 * A host name, optionally with a port.
 */
const HOST_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d+)?$/;

/**
 * One segment of a repository or folder path: letters, digits, `.`, `_` and `-`, not starting with
 * `-` or `.`, so it can be neither an option nor `..`, and has no glob character for the sparse
 * checkout.
 */
const SEGMENT_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

/**
 * A branch, tag or commit: segments like {@link SEGMENT_PATTERN} joined by `/`.
 */
const REF_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/;

/**
 * The user of an SCP-like SSH address: `git` in `git@github.com:owner/repo.git`.
 */
const SSH_USER_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;

/**
 * A port at the end of a host, as in `git.example.com:8443`.
 */
const PORT_SUFFIX_PATTERN = /:\d+$/;

/**
 * A trailing slash, as a pasted folder link may have.
 */
const TRAILING_SLASH_PATTERN = /\/$/;

/**
 * The `.git` a repository name may end with.
 */
const GIT_SUFFIX_PATTERN = /\.git$/;

/**
 * Why credentials must be configured separately from the address.
 */
const CREDENTIALS_REFUSED =
  'the address holds a user name, token or password. Sign in with `gh auth login` or a ' +
  'credential helper.';

/**
 * Why a path segment is refused.
 */
const SEGMENT_RULE =
  'may hold only letters, digits, ".", "_" and "-", and may not start with "." or "-".';

/**
 * Why a branch, tag or commit is refused.
 */
const REF_RULE =
  `the ref has invalid syntax. Its segments ${SEGMENT_RULE} Separate them with "/"` +
  ' and omit consecutive dots.';

/**
 * The forms a brand source may take, for error messages.
 */
const SOURCE_FORMS =
  'Name a brand folder in a git repository, such as `gh:acme/brand-kit/brands/acme#v2`, ' +
  '`https://github.com/acme/brand-kit/tree/main/brands/acme`, ' +
  '`https://git.example.com/acme/brand-kit.git//brands/acme#v2` or ' +
  '`git@github.com:acme/brand-kit.git//brands/acme#v2`.';

/**
 * The repository, folder and ref checked by the parser.
 */
type SourceParts = {
  /**
   * The repository address handed to git, such as `https://github.com/acme/brand-kit.git`.
   */
  remote: string;

  /**
   * The brand folder inside the repository, such as `brands/acme`; empty for the repository root.
   */
  folder: string;

  /**
   * The branch, tag or full commit to fetch, or `undefined` for the repository's default branch.
   */
  ref: string | undefined;
};

/**
 * A validated brand source, with the trimmed spelling safe to show in CLI output.
 */
export type BrandSource = Readonly<
  SourceParts & {
    /**
     * The validated source, in the author's chosen syntax.
     */
    display: string;
  }
>;

/**
 * The parts of a source with the ref split off.
 */
type Located = {
  /**
   * Everything before `#`.
   */
  location: string;

  /**
   * Everything after `#`, or `undefined` when there is none.
   */
  ref: string | undefined;
};

/**
 * Parses the source of `deckster brand add`. Every part that reaches git or a path is checked
 * first: only `https` and `ssh` addresses, path segments without `..`, a leading `-` or glob
 * characters, and no credentials in the address.
 *
 * @param input - The source as written, such as `gh:acme/brand-kit/brands/acme#v2`.
 * @returns The repository, folder and ref.
 * @throws CliError in the error channel when the source is not one of the forms, names another
 *   protocol, holds a password, or has a segment or ref that is not allowed.
 */
export const parseBrandSource = Effect.fn('parseBrandSource')(function* (
  input: string,
): Effect.fn.Return<BrandSource, CliError> {
  const display = input.trim();
  const source = readSource(display);
  if (typeof source === 'string') {
    return yield* usageError(`Invalid brand source: ${source}\n${SOURCE_FORMS}`, COMMAND);
  }

  return { ...source, display };
});

/**
 * Reads a source in any of its forms.
 *
 * @param input - The trimmed source.
 * @returns The source, or why it is not one.
 */
function readSource(input: string): SourceParts | string {
  const { location, ref } = splitRef(input);
  if (ref !== undefined && !isRef(ref)) {
    return REF_RULE;
  }

  const prefix = SHORTHAND_PREFIXES.find((candidate) => location.startsWith(candidate));
  if (prefix !== undefined) {
    return readShorthand(location.slice(prefix.length), ref);
  }

  if (location.startsWith('https://') || location.startsWith('ssh://')) {
    return readUrl(location, ref);
  }

  if (location.includes('://')) {
    return 'only https:// and ssh:// addresses are allowed.';
  }

  return readScpAddress(location, ref);
}

/**
 * Splits `location#ref`.
 *
 * @param input - The source.
 */
function splitRef(input: string): Located {
  const hash = input.indexOf('#');
  if (hash === -1) {
    return { location: input, ref: undefined };
  }

  return { location: input.slice(0, hash), ref: input.slice(hash + 1) };
}

/**
 * Reads `owner/repo/folder`, the part after `gh:`.
 *
 * @param path - The path after the prefix.
 * @param ref - The ref after `#`.
 */
function readShorthand(path: string, ref: string | undefined): SourceParts | string {
  const [owner, repo, ...folder] = path.split('/');
  if (!isSegment(owner) || !isSegment(repo)) {
    return 'the shorthand starts with the owner and the repository, as in gh:owner/repo.';
  }

  return withFolder({ remote: `https://${GITHUB_HOST}/${owner}/${repo}.git`, ref }, folder);
}

/**
 * Reads an `https://` or `ssh://` address: a GitHub link that may hold `/tree/<ref>/<folder>`, or
 * any repository address with the folder after `//`.
 *
 * @param location - The address without the ref.
 * @param ref - The ref after `#`.
 */
function readUrl(location: string, ref: string | undefined): SourceParts | string {
  const scheme = location.startsWith('https://') ? 'https' : 'ssh';
  const rest = location.slice(`${scheme}://`.length);
  const slash = rest.indexOf('/');
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? '' : rest.slice(slash + 1);
  const checked = readAuthority(authority, scheme);
  if (!checked.ok) {
    return checked.reason;
  }

  const prefix = `${scheme}://${authority}/`;
  const separator = path.indexOf(FOLDER_SEPARATOR);
  if (separator !== -1) {
    return readRepositoryPath({
      prefix,
      repository: path.slice(0, separator),
      folder: path.slice(separator + FOLDER_SEPARATOR.length),
      ref,
    });
  }

  if (checked.host === GITHUB_HOST) {
    return readGithubLink(path, ref, prefix);
  }

  return readRepositoryPath({
    prefix,
    repository: path,
    folder: '',
    ref,
  });
}

/**
 * The host of an address, or why the address is refused.
 */
type Authority = { ok: true; host: string } | { ok: false; reason: string };

/**
 * Checks the `user@host:port` part of an address.
 *
 * @param authority - The part between `://` and the path.
 * @param scheme - `https` or `ssh`.
 * @returns The host without user or port, or why the address is refused.
 */
function readAuthority(authority: string, scheme: 'https' | 'ssh'): Authority {
  const at = authority.lastIndexOf('@');
  const user = at === -1 ? '' : authority.slice(0, at);
  const host = at === -1 ? authority : authority.slice(at + 1);
  if (at !== -1 && (scheme === 'https' || user.includes(':'))) {
    return { ok: false, reason: CREDENTIALS_REFUSED };
  }

  if (at !== -1 && !SSH_USER_PATTERN.test(user)) {
    return { ok: false, reason: 'the SSH user name has invalid syntax.' };
  }

  if (!HOST_PATTERN.test(host)) {
    return { ok: false, reason: 'the host name has invalid syntax.' };
  }

  return { ok: true, host: host.replace(PORT_SUFFIX_PATTERN, '') };
}

/**
 * Reads the path of a GitHub link: `owner/repo`, optionally `/tree/<ref>/<folder>`. The ref is the
 * first segment after `tree`; a branch whose name holds `/` is written with `#ref` instead.
 *
 * @param path - The path after the host.
 * @param ref - The ref after `#`.
 * @param prefix - The scheme and validated authority, followed by `/`.
 */
function readGithubLink(
  path: string,
  ref: string | undefined,
  prefix: string,
): SourceParts | string {
  const [owner, repoSegment, marker, linkRef, ...folder] = path
    .replace(TRAILING_SLASH_PATTERN, '')
    .split('/');
  const repo = repoSegment?.replace(GIT_SUFFIX_PATTERN, '');
  if (!isSegment(owner) || !isSegment(repo)) {
    return 'a GitHub link starts with the owner and the repository.';
  }

  const remote = `${prefix}${owner}/${repo}.git`;
  if (marker === undefined) {
    return { remote, folder: '', ref };
  }

  if (marker !== TREE_SEGMENT || linkRef === undefined) {
    return 'a GitHub link to a folder has the form github.com/owner/repo/tree/<ref>/<folder>.';
  }

  if (ref !== undefined) {
    return 'the link already names a ref after /tree/; leave out the #ref.';
  }

  if (!isRef(linkRef)) {
    return REF_RULE;
  }

  return withFolder({ remote, ref: linkRef }, folder);
}

/**
 * Reads an SCP-like SSH address: `git@github.com:owner/repo.git//brands/acme`.
 *
 * @param location - The address without the ref.
 * @param ref - The ref after `#`.
 */
function readScpAddress(location: string, ref: string | undefined): SourceParts | string {
  const at = location.indexOf('@');
  const colon = location.indexOf(':', at + 1);
  if (at <= 0 || colon === -1) {
    return 'it is neither gh:owner/repo, an https:// or ssh:// address, nor user@host:path.';
  }

  const user = location.slice(0, at);
  const host = location.slice(at + 1, colon);
  if (!SSH_USER_PATTERN.test(user) || !HOST_PATTERN.test(host)) {
    return 'an SSH address needs a valid user and host.';
  }

  const path = location.slice(colon + 1);
  const separator = path.indexOf(FOLDER_SEPARATOR);
  return readRepositoryPath({
    prefix: `${user}@${host}:`,
    repository: separator === -1 ? path : path.slice(0, separator),
    folder: separator === -1 ? '' : path.slice(separator + FOLDER_SEPARATOR.length),
    ref,
  });
}

/**
 * The parts of an address whose repository path and folder are known.
 */
type RepositoryPath = {
  /**
   * Everything before the repository path, such as `https://host/` or `git@host:`.
   */
  prefix: string;

  /**
   * The repository path, such as `acme/brand-kit.git`.
   */
  repository: string;

  /**
   * The folder inside the repository, empty for the root.
   */
  folder: string;

  /**
   * The ref after `#`.
   */
  ref: string | undefined;
};

/**
 * Checks a repository path and its folder, and builds the source.
 *
 * @param parts - The address split into its parts.
 */
function readRepositoryPath(parts: RepositoryPath): SourceParts | string {
  const segments = parts.repository.split('/');
  if (!segments.every(isSegment)) {
    return 'the repository path has invalid syntax.';
  }

  return withFolder(
    { remote: `${parts.prefix}${parts.repository}`, ref: parts.ref },
    parts.folder === '' ? [] : parts.folder.replace(TRAILING_SLASH_PATTERN, '').split('/'),
  );
}

/**
 * Adds the folder to a source after checking each of its segments.
 *
 * @param source - The source without its folder.
 * @param segments - The folder's segments; none for the repository root.
 */
function withFolder(
  source: Omit<SourceParts, 'folder'>,
  segments: readonly string[],
): SourceParts | string {
  const folder = segments.filter((segment) => segment !== '');
  if (!folder.every(isSegment)) {
    return `folder segments ${SEGMENT_RULE}`;
  }

  return { ...source, folder: folder.join('/') };
}

/**
 * Whether a string is one path segment {@link SEGMENT_PATTERN} allows.
 *
 * @param segment - The segment, or `undefined` when the path has too few.
 */
function isSegment(segment: string | undefined): segment is string {
  return segment !== undefined && SEGMENT_PATTERN.test(segment);
}

/**
 * Whether a string is a ref {@link REF_PATTERN} allows, without `..`.
 *
 * @param ref - The ref.
 */
function isRef(ref: string): boolean {
  return REF_PATTERN.test(ref) && !ref.includes('..');
}
