import {
  COMPONENT_INFOS,
  isPassThroughProp,
  type ComponentInfo,
} from '#components/component-catalog.ts';

/**
 * The divisor of a misspelled name's length that bounds how many letters may be off: a name may be
 * wrong by at most a third of its letters, and by at least one.
 */
const MAX_TYPO_DIVISOR = 3;

/**
 * Names authors reach for that a component calls something else, and what it calls them.
 */
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  /**
   * A link's destination.
   */
  href: ['file', 'src', 'value'],

  /**
   * A file or address.
   */
  src: ['file', 'href', 'app'],

  /**
   * A file to download.
   */
  file: ['src', 'href'],

  /**
   * An address.
   */
  url: ['href', 'src', 'value'],

  /**
   * A button's look.
   */
  type: ['variant', 'kind'],

  /**
   * Text for assistive technology.
   */
  label: ['alt', 'title'],

  /**
   * The language of code.
   */
  language: ['lang'],

  /**
   * A still frame.
   */
  image: ['poster', 'src'],
};

/**
 * What a check of an element's props looks at.
 */
export type PropsCheck = {
  /**
   * The component's tag.
   */
  name: string;

  /**
   * The props the element sets.
   */
  given: readonly string[];

  /**
   * Whether to report missing required props (not when an element spreads props it cannot see).
   */
  checkRequired: boolean;
};

/**
 * What is wrong with the props an element of a catalog component sets: a prop it does not take
 * (with the closest one it does), or a required prop it leaves out. `data-*` and `key` pass, and
 * `children` is never required here: MDX passes it between the tags.
 *
 * @param check - The component, the props it is given, and whether to check required ones.
 * @returns The problem as a sentence with its fix, or `undefined` when the props are fine or the
 *   component is not in the catalog.
 */
export function propsProblem(check: PropsCheck): string | undefined {
  const info: ComponentInfo | undefined = COMPONENT_INFOS.find(
    (entry) => entry.name === check.name,
  );
  if (info === undefined) {
    return undefined;
  }

  const known = Object.keys(info.props);
  for (const key of check.given) {
    if (known.includes(key) || isPassThroughProp(key) || key === 'children') {
      continue;
    }

    const guess = closestName(key, known);
    const hint = guess === undefined ? '' : ` Did you mean \`${guess}\`?`;
    return (
      `\`${key}\` is not a prop of <${check.name}>.${hint} Its props are: ${known.join(', ')}. ` +
      '`deckster components --json` describes each one.'
    );
  }

  if (!check.checkRequired) {
    return undefined;
  }

  const missing = Object.entries(info.props)
    .filter(([key, spec]) => spec.required && key !== 'children' && !check.given.includes(key))
    .map(([key]) => key);
  if (missing.length === 0) {
    return undefined;
  }

  const list = missing.map((key) => `\`${key}\``).join(' and ');
  const descriptions = missing.map((key) => info.props[key]?.description ?? '').join(' ');
  const example = info.example.split('\n')[0] ?? '';
  return `<${check.name}> needs ${list}: ${descriptions} ` + `Example: ${example}`;
}

/**
 * Refuses props a component does not take, and required props left out, when the component renders:
 * the TSX side of the check the build runs on MDX. Props that are `undefined` count as left out.
 *
 * @param name - The component's tag, as the catalog names it.
 * @param props - The props the component was given.
 * @throws Error naming the component, the prop and the closest valid one, or the missing prop.
 */
export function checkComponentProps(name: string, props: object): void {
  const given = Object.entries(props)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
  const problem = propsProblem({ name, given, checkRequired: true });
  if (problem !== undefined) {
    throw new Error(problem);
  }
}

/**
 * The prop an unknown name most likely means: a known synonym, else the nearest name by edit
 * distance (at most a third of its letters off), ignoring case.
 *
 * @param key - The unknown name.
 * @param known - The component's props.
 */
export function closestName(key: string, known: readonly string[]): string | undefined {
  const synonym = SYNONYMS[key]?.find((candidate) => known.includes(candidate));
  if (synonym !== undefined) {
    return synonym;
  }

  const lower = key.toLowerCase();
  const scored = known
    .map((candidate) => ({ candidate, distance: editDistance(lower, candidate.toLowerCase()) }))
    .toSorted((a, b) => a.distance - b.distance);
  const best = scored[0];
  if (best === undefined) {
    return undefined;
  }

  const maxDistance = Math.max(1, Math.floor(key.length / MAX_TYPO_DIVISOR));
  return best.distance <= maxDistance ? best.candidate : undefined;
}

/**
 * The Levenshtein distance between two words.
 *
 * @param a - One word.
 * @param b - The other.
 */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i += 1) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j += 1) {
      current.push(
        Math.min(
          (previous[j + 1] ?? 0) + 1,
          (current[j] ?? 0) + 1,
          (previous[j] ?? 0) + (a[i] === b[j] ? 0 : 1),
        ),
      );
    }

    previous = current;
  }

  return previous[b.length] ?? 0;
}
