import { useReadyHold, useStep } from '@deckster/engine';
import { Children, isValidElement, useId, useMemo, useRef, type ReactNode } from 'react';

import type { IconComponent } from '#diagrams/flow-parts.tsx';
import type { DiagramState } from '#diagrams/flow-spec.ts';

import { StepMarks } from '#code/step-marks.tsx';
import { describeDiagram, type DescribeBox } from '#diagrams/describe-diagram.ts';
import { DiagramFrame } from '#diagrams/diagram-frame.tsx';
import { assertDiagramProps, normalizeState } from '#diagrams/diagram-props.ts';
import { count } from '#diagrams/diagram-summary.ts';
import { Item, Layer, type ItemProps, type LayerProps } from '#diagrams/form-parts.tsx';
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
   * The `<Layer>`s, top to bottom.
   */
  children?: ReactNode;
};

/**
 * A stacked architecture: bands from top (closest to the user) to bottom, each with its name on the
 * left and its building blocks as chips with their kind's icon. Reveal bands by step with `at`; the
 * band of the current step is picked out in the accent.
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
export function Layers({ id, title, height, children }: LayersProps): ReactNode {
  const layers = useMemo(() => readLayers(children), [children]);
  const step = useStep();
  const root = useRef<HTMLElement | null>(null);
  const size = useElementSize(root);
  useReadyHold(size === undefined);
  const shown = layers.filter((layer) => layer.at === undefined || layer.at <= step);
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
      ready={size !== undefined}
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
            data-state={layer.at === step ? 'highlighted' : (layer.state ?? 'default')}
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
                const Icon = item.icon;
                return (
                  <div
                    key={`${item.title}-${itemIndex}`}
                    className="kit-layer-item"
                    data-diagram-part="item"
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
