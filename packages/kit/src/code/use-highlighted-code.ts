import { useReadyHold } from '@deckster/engine';
import { useEffect, useMemo, useState } from 'react';

import type { HighlightedCode } from '#code/highlighted-code.ts';

import { buildHighlightedCode, prepareSource } from '#code/highlighted-code.ts';

/**
 * What to highlight when the build did not.
 */
export type HighlightRequest = {
  /**
   * The block compiled at build time, as JSON; used as it is when given.
   */
  data: string | undefined;

  /**
   * The source to highlight in the browser when there is no `data`.
   */
  code: string | undefined;

  /**
   * The language of `code`.
   */
  lang: string | undefined;

  /**
   * Whether lines starting with `+` or `-` are additions and removals.
   */
  diff: boolean;

  /**
   * Words to mark.
   */
  words: readonly string[];
};

/**
 * The block highlighted in the browser for one request.
 */
type Loaded = {
  /**
   * The request it answers, as a string.
   */
  key: string;

  /**
   * The highlighted block.
   */
  code: HighlightedCode;
};

/**
 * A request as the JSON that identifies it: the source, the language, diff notation and words.
 */
type RequestKey = [source: string, lang: string, diff: boolean, words: string[]];

/**
 * Gives a block's highlighted lines. A block compiled at build time is parsed from its `data`. Any
 * other block is highlighted in the browser: Shiki loads on first use, in its own chunk, and the
 * slide's `ready()` is held until the lines are in place. If highlighting fails the source is shown
 * as plain text, so the slide never stays empty.
 *
 * @param request - The compiled data, or the source to highlight.
 * @returns The lines; `undefined` while the browser is still highlighting.
 */
export function useHighlightedCode(request: HighlightRequest): HighlightedCode | undefined {
  const { data, code, lang, diff, words } = request;
  const compiled = useMemo(
    () => (data === undefined ? undefined : (JSON.parse(data) as HighlightedCode)),
    [data],
  );
  const key = JSON.stringify([code ?? '', lang ?? '', diff, words]);
  const [loaded, setLoaded] = useState<Loaded>();
  const needsLoad = compiled === undefined && code !== undefined;
  useReadyHold(needsLoad && loaded?.key !== key);
  useEffect(() => {
    if (!needsLoad) {
      return undefined;
    }

    let live = true;
    const [source, language, isDiff, marked] = JSON.parse(key) as RequestKey;
    void import('#code/runtime-highlighter.ts')
      .then((module) =>
        module.highlightInBrowser(source, language, { diff: isDiff, words: marked }),
      )
      .catch(() => plainCode(source, isDiff, marked))
      .then((result) => {
        if (live) {
          setLoaded({ key, code: result });
        }
      });
    return () => {
      live = false;
    };
  }, [needsLoad, key]);
  if (compiled !== undefined) {
    return compiled;
  }

  return loaded?.key === key ? loaded.code : undefined;
}

/**
 * The source as uncolored lines, for when highlighting fails.
 *
 * @param source - The code.
 * @param diff - Whether leading `+` and `-` mark lines.
 * @param words - Words to mark.
 */
function plainCode(source: string, diff: boolean, words: readonly string[]): HighlightedCode {
  const prepared = prepareSource(source, { diff });
  return buildHighlightedCode(
    'text',
    prepared.lines.map((line) => [{ content: line }]),
    prepared,
    words,
  );
}
