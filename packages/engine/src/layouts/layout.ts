import type { ComponentType, ReactNode } from 'react';

import type { AnyLayoutContract, BodySlot } from '#contract/layout-contract.ts';
import type { SlideFrontmatter } from '#contract/slide-frontmatter.ts';

/**
 * The slot names of a contract, `body` included.
 */
export type LayoutSlotName<Contract extends AnyLayoutContract> =
  | (keyof Contract['slots'] & string)
  | BodySlot;

/**
 * The filled slots a layout receives, by name. A slot the slide leaves empty is `undefined`, so a
 * layout can collapse the space it would take.
 */
export type LayoutSlots<Contract extends AnyLayoutContract = AnyLayoutContract> = {
  readonly [Slot in LayoutSlotName<Contract>]?: ReactNode;
};

/**
 * Props every layout component receives. Pass the contract's type to get its fields and slots:
 * `LayoutProps<typeof splitContract>`.
 */
export type LayoutProps<Contract extends AnyLayoutContract = AnyLayoutContract> = {
  /**
   * The id of the slide being laid out.
   */
  slideId: string;

  /**
   * The slide's validated frontmatter: the fields every slide has plus the layout's own, with the
   * contract schema's defaults applied.
   */
  frontmatter: SlideFrontmatter & Contract['schema']['Type'];

  /**
   * The slide's content sorted into the layout's slots. Each filled slot is wrapped in a `<span
   * class="deck-slot" data-slot="<name>">` with `display: contents`, which does not affect layout
   * and lets `deck lint` measure the slot.
   */
  slots: LayoutSlots<Contract>;
};

/**
 * An edge of the slide that a layout's media can run to.
 */
export type BleedSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * What a layout's {@link LayoutDefinition.bleed} reads to decide which edges a slide covers.
 */
export type BleedInput<Contract extends AnyLayoutContract = AnyLayoutContract> = {
  /**
   * The slide's validated frontmatter.
   */
  frontmatter: SlideFrontmatter & Contract['schema']['Type'];

  /**
   * The named slots the slide fills; `body` is not listed.
   */
  slots: readonly string[];
};

/**
 * A layout as the engine renders it: the name from its contract and the component that places a
 * slide's slots on the canvas.
 */
export type LayoutDefinition = {
  /**
   * The name slides use in `layout:` frontmatter; it matches the layout's contract in the catalog.
   */
  readonly name: string;

  /**
   * Places the slide's slots on the 1920x1080 canvas.
   */
  readonly component: ComponentType<LayoutProps>;

  /**
   * The edges of the slide the layout's media runs to on a given slide, so page chrome moves out of
   * the way; none when it is left out.
   */
  readonly bleed?: (input: BleedInput) => readonly BleedSide[];
};

/**
 * Layouts by the name slides use in `layout:` frontmatter.
 */
export type LayoutRegistry = ReadonlyMap<string, LayoutDefinition>;

/**
 * What {@link defineLayout} takes for a contract: its name, and a component typed by it.
 */
export type LayoutRegistration<Contract extends AnyLayoutContract> = {
  /**
   * The contract's name.
   */
  readonly name: Contract['name'];

  /**
   * The component, which receives the contract's fields and slots.
   */
  readonly component: ComponentType<LayoutProps<Contract>>;

  /**
   * The edges the layout's media runs to on a slide, read by page chrome before the slide renders
   * so it can move what would sit on a photo; leave it out for a layout that never bleeds.
   */
  readonly bleed?: (input: BleedInput<Contract>) => readonly BleedSide[];
};

/**
 * Registers a layout's component for the runtime, typed by its contract. The contract itself stays
 * in its Node-safe file; import it here only as a type, so the browser bundle never carries the
 * schema:
 *
 * ```tsx
 * import type { splitContract } from '#layouts/split-layout.contract.ts';
 *
 * function SplitLayout({ slots, frontmatter }: LayoutProps<typeof splitContract>) { ... }
 *
 * export const splitLayout = defineLayout<typeof splitContract>({
 *   name: 'split',
 *   component: SplitLayout,
 * });
 * ```
 *
 * @param registration - The contract's name and the component.
 * @returns The layout, for a plugin's `layouts` list.
 */
export function defineLayout<Contract extends AnyLayoutContract>(
  registration: LayoutRegistration<Contract>,
): LayoutDefinition {
  // The build decodes every slide's frontmatter against the contract of the layout it names, so at
  // run time a layout only ever receives props of its own contract's shape.
  return registration as unknown as LayoutDefinition;
}
