import { el } from '#ooxml/xml.ts';

/**
 * How long each fade-in takes, in milliseconds.
 */
const FADE_MS = 300;

/**
 * PowerPoint's preset id for the Fade entrance effect.
 */
const FADE_PRESET_ID = 10;

/**
 * The timing node id of the root `p:cTn`, which holds the main sequence.
 */
const ROOT_NODE_ID = 1;

/**
 * The timing node id of the main sequence's `p:cTn`, which holds the clicks.
 */
const SEQUENCE_NODE_ID = 2;

/**
 * The first id handed out to a click's nodes; the root and the sequence take the ids before it.
 */
const FIRST_CLICK_NODE_ID = 3;

/**
 * Something that appears on a click: a whole shape, or some paragraphs of a text shape.
 */
export type RevealTarget = {
  /**
   * The shape id.
   */
  shapeId: number;

  /**
   * The paragraph range, zero-based and inclusive, or `null` for the whole shape.
   */
  paragraphs: { start: number; end: number } | null;

  /**
   * Whether the shape has a text body (text frames and boxes), which the build list must name.
   */
  hasText: boolean;
};

/**
 * The slide's `p:timing`: one click per step, fading in everything that appears at that step, in
 * step order. Returns an empty string when nothing is revealed.
 *
 * @param steps - The targets of each click, in order; empty steps are skipped.
 */
export function timingXml(steps: readonly (readonly RevealTarget[])[]): string {
  const clicks = steps.filter((targets) => targets.length > 0);
  if (clicks.length === 0) {
    return '';
  }

  let nextId = FIRST_CLICK_NODE_ID;
  /**
   * Hands out the next timing node id.
   */
  const newId = (): number => {
    const id = nextId;
    nextId += 1;
    return id;
  };

  const clickPars = clicks.map((targets) => clickXml(targets, newId));
  const sequence = el(
    'p:seq',
    { concurrent: 1, nextAc: 'seek' },
    el(
      'p:cTn',
      { id: SEQUENCE_NODE_ID, dur: 'indefinite', nodeType: 'mainSeq' },
      el('p:childTnLst', {}, ...clickPars),
    ),
    el('p:prevCondLst', {}, el('p:cond', { evt: 'onPrev', delay: 0 }, slideTargetXml())),
    el('p:nextCondLst', {}, el('p:cond', { evt: 'onNext', delay: 0 }, slideTargetXml())),
  );
  const root = el(
    'p:par',
    {},
    el(
      'p:cTn',
      { id: ROOT_NODE_ID, dur: 'indefinite', restart: 'never', nodeType: 'tmRoot' },
      el('p:childTnLst', {}, sequence),
    ),
  );

  const builds = buildListXml(clicks.flat());
  return el(
    'p:timing',
    {},
    el('p:tnLst', {}, root),
    builds.length === 0 ? '' : el('p:bldLst', {}, ...builds),
  );
}

/**
 * One click: a click-triggered group whose first effect starts the click and the rest run with it.
 *
 * @param targets - What appears on this click, in order.
 * @param newId - Allocates timing node ids; the outer and inner groups take the first two.
 */
function clickXml(targets: readonly RevealTarget[], newId: () => number): string {
  const outerId = newId();
  const innerId = newId();
  const effects = targets.map((target, index) => effectXml(target, index === 0, newId));
  return el(
    'p:par',
    {},
    el(
      'p:cTn',
      { id: outerId, fill: 'hold' },
      el('p:stCondLst', {}, el('p:cond', { delay: 'indefinite' })),
      el(
        'p:childTnLst',
        {},
        el(
          'p:par',
          {},
          el(
            'p:cTn',
            { id: innerId, fill: 'hold' },
            el('p:stCondLst', {}, el('p:cond', { delay: 0 })),
            el('p:childTnLst', {}, ...effects),
          ),
        ),
      ),
    ),
  );
}

/**
 * The target a previous or next slide condition names: the slide itself.
 */
function slideTargetXml(): string {
  return el('p:tgtEl', {}, el('p:sldTgt'));
}

/**
 * The `p:bldLst` entries: one per text shape that is revealed, so PowerPoint knows to build it. A
 * shape that is revealed whole is built as a background; a shape revealed by paragraph is built by
 * paragraph. The first target for a shape wins.
 *
 * @param revealed - Every target that appears on a click, in click order.
 */
function buildListXml(revealed: readonly RevealTarget[]): string[] {
  const built = new Map<number, RevealTarget>();
  for (const target of revealed) {
    if (target.hasText && !built.has(target.shapeId)) {
      built.set(target.shapeId, target);
    }
  }

  return [...built.values()].map((target) =>
    el('p:bldP', {
      spid: target.shapeId,
      grpId: 0,
      build: target.paragraphs === null ? undefined : 'p',
      animBg: target.paragraphs === null ? 1 : undefined,
    }),
  );
}

/**
 * One fade-in: set visible, then fade.
 *
 * @param target - What appears.
 * @param isFirst - Whether it is the click's first effect (the others start with it).
 * @param newId - Allocates timing node ids.
 */
function effectXml(target: RevealTarget, isFirst: boolean, newId: () => number): string {
  const range = target.paragraphs;
  const shape = el(
    'p:spTgt',
    { spid: target.shapeId },
    range === null ? '' : el('p:txEl', {}, el('p:pRg', { st: range.start, end: range.end })),
  );
  const tgtEl = el('p:tgtEl', {}, shape);
  const effectId = newId();
  const setId = newId();
  const fadeId = newId();
  return el(
    'p:par',
    {},
    el(
      'p:cTn',
      {
        id: effectId,
        presetID: FADE_PRESET_ID,
        presetClass: 'entr',
        presetSubtype: 0,
        fill: 'hold',
        grpId: 0,
        nodeType: isFirst ? 'clickEffect' : 'withEffect',
      },
      el('p:stCondLst', {}, el('p:cond', { delay: 0 })),
      el(
        'p:childTnLst',
        {},
        el(
          'p:set',
          {},
          el(
            'p:cBhvr',
            {},
            el(
              'p:cTn',
              { id: setId, dur: 1, fill: 'hold' },
              el('p:stCondLst', {}, el('p:cond', { delay: 0 })),
            ),
            tgtEl,
            el('p:attrNameLst', {}, el('p:attrName', {}, 'style.visibility')),
          ),
          el('p:to', {}, el('p:strVal', { val: 'visible' })),
        ),
        el(
          'p:animEffect',
          { transition: 'in', filter: 'fade' },
          el('p:cBhvr', {}, el('p:cTn', { id: fadeId, dur: FADE_MS }), tgtEl),
        ),
      ),
    ),
  );
}
