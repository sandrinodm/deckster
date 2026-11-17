import { useReadyHold, useStep } from '@deckster/engine';
import {
  Children,
  isValidElement,
  useId,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';

import type { IconComponent } from '#diagrams/flow-parts.tsx';
import type { DiagramState } from '#diagrams/flow-spec.ts';

import { StepMarks } from '#code/step-marks.tsx';
import { describeDiagram, type DescribeBox } from '#diagrams/describe-diagram.ts';
import { DiagramFrame } from '#diagrams/diagram-frame.tsx';
import { assertDiagramProps, normalizeState } from '#diagrams/diagram-props.ts';
import { count } from '#diagrams/diagram-summary.ts';
import { FALLBACK, useDiagramTokens, type DiagramTokens } from '#diagrams/diagram-tokens.ts';
import { Item, Layer, type ItemProps, type LayerProps } from '#diagrams/form-parts.tsx';
import {
  cardData,
  cardStyle,
  cardTitleVariables,
  resolveCard,
  type ResolvedCard,
} from '#diagrams/node-cards.ts';
import { resolveNodeKind } from '#diagrams/node-kinds.ts';
import { useDiagramDescription } from '#diagrams/use-description.ts';
import { useElementSize } from '#diagrams/use-element-size.ts';
import { smartPunctuation } from '#foundation/smart-punctuation.ts';

/**
 * The characters an id generated from `useId` may contain beyond letters and digits; they are
 * dropped.
 */
const NON_ID_CHARACTERS = /[^a-z0-9]/gi;

/**
 * Props of {@link Layers}.
 */
export type LayersProps = {
  /**
   * An id for the export description.
   */
  id?: string;

  /**
   * What it shows, in a few words: its accessible name.
   */
  title: string;

  /**
   * A fixed height in canvas pixels; without it the stack fills its region.
   */
  height?: number;

  /**
   * The card (a node style the brand defines) for every item of the stack: `default`, `outline`,
   * `solid`, `tint`, `raised` or one of the brand's own. An item's own `card` wins over it; the
   * bands keep the stack's own look unless a `<Layer>` names a card.
   */
  card?: string;

  /**
   * The `<Layer>`s, top to bottom.
   */
  children?: ReactNode;
};

/**
 * A stacked architecture: bands from top (closest to the user) to bottom, each with its name on the
 * left and its building blocks as chips with their kind's icon. Reveal bands by step with `at`;
 * while the stack is being built, the band its step just added is picked out in the accent. Once
 * the last band is in, the build is over and only the bands the author marked (`state`) stand out,
 * so a stack built top down does not end with its bottom band lit.
 *
 * ```mdx
 * <Layers title="The Parcelwise platform">
 *   <Layer title="Experience" subtitle="Web and apps" at={1}>
 *     <Item kind="client" title="Web" />
 *     <Item kind="mobile" title="Courier app" />
 *   </Layer>
 * </Layers>
 * ```
 */
export function Layers({ id, title, height, card, children }: LayersProps): ReactNode {
  const layers = useMemo(() => readLayers(children), [children]);
  const step = useStep();
  const root = useRef<HTMLElement | null>(null);
  const size = useElementSize(root);
  const tokens = useDiagramTokens(root);
  useReadyHold(size === undefined || tokens === undefined);
  const shown = layers.filter((layer) => layer.at === undefined || layer.at <= step);
  const lastAt = lastLayerStep(layers);
  const summary = [
    `${count(shown.length, 'layer')}, top to bottom.`,
    ...shown.map((layer) => `${layer.title}: ${layer.items.map((item) => item.title).join(', ')}.`),
  ].join(' ');
  const generated = useId();
  const diagramId = id ?? `layers-${generated.replace(NON_ID_CHARACTERS, '')}`;
  useDiagramDescription(
    root,
    size === undefined
      ? undefined
      : () => describeLayers(root.current as HTMLElement, diagramId, step, summary),
  );
  return (
    <DiagramFrame
      ref={root}
      kind="layers"
      title={title}
      summary={summary}
      ready={size !== undefined && tokens !== undefined}
      height={height}
      data={{ 'data-diagram-id': diagramId, 'data-diagram-nodes': String(shown.length) }}>
      <StepMarks
        ats={[...new Set(layers.flatMap((layer) => (layer.at === undefined ? [] : [layer.at])))]}
      />
      <div className="kit-layers">
        {layers.map((layer, index) => (
          <section
            key={`${layer.title}-${index}`}
            className="kit-layer"
            data-diagram-part="layer"
            {...bandCardProps(layer.card, card, tokens)}
            data-state={layerState(layer, step, lastAt)}
            data-visible={String(layer.at === undefined || layer.at <= step)}>
            <header className="kit-layer-head">
              <span className="kit-layer-title kit-type-small">
                {smartPunctuation(layer.title)}
              </span>
              {layer.subtitle === undefined ? null : (
                <span className="kit-layer-subtitle kit-type-caption">
                  {smartPunctuation(layer.subtitle)}
                </span>
              )}
            </header>
            <div className="kit-layer-items">
              {layer.items.map((item, itemIndex) => {
                const itemCard = resolveCard((tokens ?? FALLBACK).cards, {
                  own: item.card,
                  diagram: card,
                  kind: item.kind === undefined ? undefined : resolveNodeKind(item.kind),
                });
                const Icon = itemCard.tokens.icon === 'none' ? undefined : item.icon;
                return (
                  <div
                    key={`${item.title}-${itemIndex}`}
                    className="kit-layer-item"
                    data-diagram-part="item"
                    {...cardData(itemCard)}
                    {...cardLook(itemCard)}
                    data-state={item.state ?? 'default'}>
                    {Icon === undefined ? null : (
                      <span className="kit-flow-node-icon" aria-hidden="true">
                        <Icon aria-hidden="true" focusable="false" />
                      </span>
                    )}
                    <span className="kit-layer-item-title kit-type-caption">
                      {smartPunctuation(item.title)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </DiagramFrame>
  );
}

/**
 * The `data-*` attributes and inline style of a part of the stack drawn with a card: its icon and
 * accent styles, its card's variables, its shadow as a `box-shadow` (`--kit-card-box-shadow`, set
 * on every part so a band's never reaches its chips), and `data-card-title="own"` when the brand
 * wrote the card's title type, so its text takes that type at its own size. A chip keeps the
 * stack's own corner (the small radius) unless a card was named for it, so the default card alone
 * does not reshape the chips.
 *
 * @param card - The resolved card.
 */
function cardLook(card: ResolvedCard): {
  style: CSSProperties;
  'data-icon'?: string;
  'data-accent'?: string;
  'data-card-title'?: string;
} {
  const { icon, accent, shape, radius } = card.tokens;
  const style = {
    ...cardStyle(card),
    ...(card.defined && accent.side !== 'none'
      ? { '--kit-card-accent-width': `${accent.width}px` }
      : {}),
    ...(card.defined && card.named
      ? { '--kit-chip-radius': shape === 'pill' ? '999px' : `${radius}px` }
      : {}),
    ...(card.defined
      ? {
          '--kit-card-box-shadow': card.tokens.shadow
            ? `var(--brand-diagram-card-${card.name}-box-shadow)`
            : '0 0 transparent',
        }
      : {}),
  } as CSSProperties;
  return {
    style,
    ...(icon === 'chip' ? {} : { 'data-icon': icon }),
    ...(card.defined && accent.side !== 'none' ? { 'data-accent': accent.side } : {}),
    ...titleOwn(card),
  };
}

/**
 * `data-card-title="own"` for a card whose title type the brand wrote; nothing otherwise, so the
 * part keeps its own type.
 *
 * @param card - The resolved card.
 */
function titleOwn(card: ResolvedCard): { 'data-card-title'?: string } {
  return card.defined && card.tokens.titleOwn ? { 'data-card-title': 'own' } : {};
}

/**
 * The `data-*` attributes and inline style of a band. Its paint is its card's when the `<Layer>`
 * names one the brand has; else the stack's own look, with `data-card-missing` when it named one
 * the brand lacks. Its title takes the title type of its card (the `<Layer>`'s card, else the
 * stack's, else `default`) when the brand wrote that type.
 *
 * @param name - The card the `<Layer>` names.
 * @param stack - The card the `<Layers>` names.
 * @param tokens - The brand's values, once read.
 */
function bandCardProps(
  name: string | undefined,
  stack: string | undefined,
  tokens: DiagramTokens | undefined,
): ReturnType<typeof cardLook> & Partial<ReturnType<typeof cardData>> {
  if (tokens === undefined) {
    return { style: {} };
  }

  const titleCard = resolveCard(tokens.cards, { own: name, diagram: stack });
  const title =
    titleOwn(titleCard)['data-card-title'] === undefined
      ? { style: {} }
      : { style: cardTitleVariables(titleCard.name), 'data-card-title': 'own' };
  if (name === undefined) {
    return title;
  }

  const card = resolveCard(tokens.cards, { own: name });
  if (!card.named) {
    return { ...title, 'data-card-missing': name };
  }

  const look = cardLook(card);
  return {
    ...cardData(card),
    ...look,
    style: { ...look.style, '--kit-chip-radius': undefined } as CSSProperties,
  };
}

/**
 * The last step a band of the stack comes in at.
 *
 * @param layers - The bands.
 * @returns The largest `at`; `undefined` when no band has one.
 */
export function lastLayerStep(layers: readonly Pick<LayerProps, 'at'>[]): number | undefined {
  const steps = layers.flatMap((layer) => (layer.at === undefined ? [] : [layer.at]));
  return steps.length === 0 ? undefined : Math.max(...steps);
}

/**
 * How a band is drawn at a step: picked out when its step just added it and more bands are still to
 * come, else in the state its author gave it. The build's highlight says which band the speaker is
 * on; once the stack is whole, only the author's own emphasis shows.
 *
 * @param layer - The band's step and state.
 * @param step - The step on screen.
 * @param lastAt - The step the last band comes in at.
 * @returns The band's `data-state`.
 */
export function layerState(
  layer: Pick<LayerProps, 'at' | 'state'>,
  step: number,
  lastAt: number | undefined,
): string {
  const building = lastAt !== undefined && step < lastAt;
  if (building && layer.at === step) {
    return 'highlighted';
  }

  return layer.state ?? 'default';
}

/**
 * Describes the bands of a stack at the current step, for the export description.
 *
 * @param element - The stack's root element.
 * @param id - The diagram's id.
 * @param step - The step on screen.
 * @param summary - The diagram's summary line.
 */
function describeLayers(
  element: HTMLElement,
  id: string,
  step: number,
  summary: string,
): ReturnType<typeof describeDiagram> {
  const bands = Array.from(element.querySelectorAll('.kit-layer'));
  return describeDiagram({
    element,
    kind: 'layers',
    id,
    step,
    summary,
    groups: [],
    nodes: [],
    edges: [],
    boxes: bands.flatMap(bandBoxes),
  });
}

/**
 * The boxes of one band and its items; none while the band is not shown yet.
 *
 * @param band - The band's element.
 * @param index - Its position in the stack.
 */
function bandBoxes(band: Element, index: number): DescribeBox[] {
  if (band.getAttribute('data-visible') !== 'true') {
    return [];
  }

  const bandId = `layer-${index + 1}`;
  const items = Array.from(band.querySelectorAll('.kit-layer-item'));
  return [
    {
      id: bandId,
      kind: 'layer',
      state: band.getAttribute('data-state') ?? 'default',
      shape: band,
      described: 'roundRect' as const,
      texts: Array.from(band.querySelectorAll('.kit-layer-title, .kit-layer-subtitle')),
    },
    ...items.map((item, itemIndex) => ({
      id: `${bandId}-item-${itemIndex + 1}`,
      kind: 'item',
      state: item.getAttribute('data-state') ?? 'default',
      shape: item,
      described: 'roundRect' as const,
      texts: Array.from(item.querySelectorAll('.kit-layer-item-title')),
      group: bandId,
    })),
  ];
}

/**
 * A layer as the stack keeps it.
 */
type ParsedLayer = Omit<LayerProps, 'children'> & {
  /**
   * Its items, icons resolved.
   */
  items: (Omit<ItemProps, 'icon'> & { icon?: IconComponent })[];
};

/**
 * Reads the layers and their items.
 *
 * @param children - The stack's children.
 * @throws Error for anything other than `<Layer>`s holding `<Item>`s.
 */
function readLayers(children: ReactNode): ParsedLayer[] {
  return Children.toArray(children).flatMap((child): ParsedLayer[] => {
    if (!isValidElement(child)) {
      return [];
    }

    if (child.type !== Layer) {
      throw new Error(
        'A <Layers> stack holds only <Layer>s, each with <Item>s inside; ' +
          'move anything else out of it.',
      );
    }

    assertDiagramProps('Layer', child.props as Record<string, unknown>);
    const { children: inner, state, ...rest } = child.props as LayerProps;
    const props = { ...rest, ...stateProp(state) };
    const items = Children.toArray(inner).flatMap((item) => {
      if (!isValidElement(item)) {
        return [];
      }

      if (item.type !== Item) {
        throw new Error(
          `The layer "${props.title}" holds something other than <Item>s; ` +
            'a <Layer> holds only <Item>s.',
        );
      }

      assertDiagramProps('Item', item.props as Record<string, unknown>);
      const { icon, state: itemState, ...fields } = item.props as ItemProps;
      return [
        { ...fields, ...stateProp(itemState), ...(typeof icon === 'function' ? { icon } : {}) },
      ];
    });
    return [{ ...props, items }];
  });
}

/**
 * A `state` prop with synonyms read as the state they mean, for spreading; empty when unset.
 *
 * @param state - The prop as written.
 */
function stateProp(state: DiagramState | undefined): { state?: DiagramState } {
  const normalized = normalizeState(state) as DiagramState | undefined;
  return normalized === undefined ? {} : { state: normalized };
}
