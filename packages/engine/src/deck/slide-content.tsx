import {
  Children,
  createContext,
  createElement,
  Fragment,
  isValidElement,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

import type { SlideEntry, SlideMeta } from '#contract/manifest.ts';
import type { LayoutDefinition, LayoutSlots } from '#layouts/layout.ts';

import { BODY_SLOT, PLACED_SLOT, SLOT_ELEMENT, SLOTS_ELEMENT, slotTag } from '#contract/slots.ts';
import { useDeckRuntime } from '#deck/deck-runtime.ts';
import { isComponent } from '#deck/is-component.ts';
import { PlacedLayerHost } from '#deck/placed-layer.tsx';
import { SlideProblem } from '#deck/slide-problem.tsx';
import { SlotGuard } from '#deck/slot-guard.tsx';
import { Notes } from '#notes/notes.tsx';

/**
 * What the MDX slots host needs to render the slide's layout.
 */
type LayoutHost = {
  /**
   * The layout the slide names.
   */
  layout: LayoutDefinition;

  /**
   * The slide id.
   */
  slideId: string;

  /**
   * The slide's validated frontmatter.
   */
  frontmatter: SlideMeta['frontmatter'];

  /**
   * The element types that are speaker notes, kept out of the slots.
   */
  notesTypes: ReadonlySet<unknown>;
};

/**
 * The layout host of the MDX slide being rendered.
 */
const LayoutHostContext = createContext<LayoutHost | undefined>(undefined);

/**
 * Props of {@link SlideContent}.
 */
type SlideContentProps = {
  /**
   * The slide to render.
   */
  entry: SlideEntry;
};

/**
 * A slide's content inside the layout its frontmatter names, with the content sorted into the
 * layout's slots.
 *
 * - MDX: the build wraps the slide's top-level content in `<DeckSlots>` and renames each top-level
 *   slot tag (`<Left>`) to `<DeckSlot name="left">`. The engine renders the layout in place of
 *   `<DeckSlots>`, with every `<DeckSlot>` in its slot and the rest in `body`.
 * - TSX: the default export fills `body`, and each export named after a slot's tag (`export function
 *   Left()`) fills that slot. The build lists those exports in `slideMeta.slots`.
 */
export function SlideContent({ entry }: SlideContentProps): ReactNode {
  const { runtime } = useDeckRuntime('A slide');
  const { frontmatter } = entry.module.slideMeta;
  const layout = runtime.layouts.get(frontmatter.layout);
  const { components } = runtime;
  const mdxComponents = useMemo(
    () => ({ ...components, [SLOTS_ELEMENT]: SlotsHost, [SLOT_ELEMENT]: SlotMarker }),
    [components],
  );
  const host = useMemo(
    () =>
      layout === undefined
        ? undefined
        : {
            layout,
            slideId: entry.id,
            frontmatter,
            notesTypes: new Set<unknown>([Notes, components['Notes']]),
          },
    [layout, entry.id, frontmatter, components],
  );
  if (host === undefined) {
    const available = [...runtime.layouts.keys()].join(', ');
    const message = `Unknown layout "${frontmatter.layout}". Set layout to one of: ${available}.`;
    return <SlideProblem file={entry.file} message={message} />;
  }

  const Content = entry.module.default;
  if (entry.kind === 'mdx') {
    return (
      <LayoutHostContext value={host}>
        <Content components={mdxComponents} />
      </LayoutHostContext>
    );
  }

  return (
    <PlacedLayerHost>
      <LayoutFrame host={host} slots={tsxSlots(entry, <Content components={components} />)} />
    </PlacedLayerHost>
  );
}

/**
 * Props of {@link SlotsHost}.
 */
type SlotsHostProps = {
  /**
   * The MDX slide's top-level content.
   */
  children?: ReactNode;
};

/**
 * Renders the MDX slide's layout in place of the `<DeckSlots>` element the build wrapped the slide
 * in, with the top-level content sorted into slots and any placed elements in `.deck-placed`.
 */
function SlotsHost({ children }: SlotsHostProps): ReactNode {
  const host = useContext(LayoutHostContext);
  if (host === undefined) {
    throw new Error(`<${SLOTS_ELEMENT}> is added by the build; do not write it in a slide.`);
  }

  const { slots, placed, notes } = sortIntoSlots(children, host.notesTypes);
  return (
    <>
      <PlacedLayerHost placed={placed.length > 0 ? placed : undefined}>
        <LayoutFrame host={host} slots={slots} />
      </PlacedLayerHost>
      {notes}
    </>
  );
}

/**
 * Props of {@link SlotMarker}.
 */
type SlotMarkerProps = {
  /**
   * The slot the content belongs to.
   */
  name: string;

  /**
   * The slot's content.
   */
  children?: ReactNode;
};

/**
 * The element a top-level slot tag becomes. {@link SlotsHost} takes its children out; rendered
 * anywhere else, it fails with the fix.
 */
function SlotMarker({ name }: SlotMarkerProps): never {
  throw new Error(
    `<${slotTag(name)}> must be at the top level of the slide, outside other elements.`,
  );
}

/**
 * Props of {@link LayoutFrame}.
 */
type LayoutFrameProps = {
  /**
   * The layout and the slide it lays out.
   */
  host: LayoutHost;

  /**
   * The filled slots.
   */
  slots: LayoutSlots;
};

/**
 * The layout component with every filled slot wrapped in its measurable `.deck-slot` span.
 */
function LayoutFrame({ host, slots }: LayoutFrameProps): ReactNode {
  const Layout = host.layout.component;
  return <Layout slideId={host.slideId} frontmatter={host.frontmatter} slots={wrapSlots(slots)} />;
}

/**
 * Sorts an MDX slide's top-level content: `<DeckSlot name="__placed">` into the placed layer, every
 * other `<DeckSlot>` into its slot, speaker notes aside, and everything else into `body` in source
 * order. Whitespace between elements is dropped.
 *
 * @param children - The top-level content.
 * @param notesTypes - The element types that are speaker notes.
 */
function sortIntoSlots(
  children: ReactNode,
  notesTypes: ReadonlySet<unknown>,
): { slots: LayoutSlots; placed: ReactNode[]; notes: ReactNode[] } {
  const slots: Record<string, ReactNode> = {};
  const body: ReactNode[] = [];
  const placed: ReactNode[] = [];
  const notes: ReactNode[] = [];
  for (const child of Children.toArray(children)) {
    if (isValidElement<SlotMarkerProps>(child) && child.type === SlotMarker) {
      if (child.props.name === PLACED_SLOT) {
        const items = Children.toArray(child.props.children).filter(
          (item) => typeof item !== 'string' || item.trim() !== '',
        );
        if (items.length > 0) {
          placed.push(<Fragment key={child.key}>{items}</Fragment>);
        }
      } else {
        slots[child.props.name] = Children.toArray(child.props.children);
      }
    } else if (isValidElement(child) && notesTypes.has(child.type)) {
      notes.push(child);
    } else if (typeof child !== 'string' || child.trim() !== '') {
      body.push(child);
    }
  }

  if (body.length > 0) {
    slots[BODY_SLOT] = body;
  }

  return { slots, placed, notes };
}

/**
 * A TSX slide's slots: the default export in `body`, and the export named after each slot the build
 * found.
 *
 * @param entry - The TSX slide.
 * @param body - The rendered default export.
 */
function tsxSlots(entry: SlideEntry, body: ReactNode): LayoutSlots {
  const slots: Record<string, ReactNode> = { [BODY_SLOT]: body };
  for (const name of entry.module.slideMeta.slots) {
    const component = entry.module[slotTag(name)];
    if (isComponent(component)) {
      slots[name] = createElement(component);
    }
  }

  return slots;
}

/**
 * Wraps each filled slot in a {@link SlotGuard}, which draws `<span class="deck-slot"
 * data-slot="<name>">` (`display: contents`) so `deckster lint` can find and measure it, and tells
 * an error the content throws from one the layout throws.
 *
 * @param slots - The filled slots.
 */
function wrapSlots(slots: LayoutSlots): LayoutSlots {
  const wrapped: Record<string, ReactNode> = {};
  for (const [name, content] of Object.entries(slots)) {
    if (content !== undefined) {
      wrapped[name] = <SlotGuard data-slot={name}>{content}</SlotGuard>;
    }
  }

  return wrapped;
}
