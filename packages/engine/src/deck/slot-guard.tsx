import {
  cloneElement,
  Component,
  createElement,
  isValidElement,
  type ElementType,
  type FunctionComponent,
  type ReactElement,
  type ReactNode,
} from 'react';

/**
 * The errors slot content threw, so a layout's own error boundary can tell them from its own.
 */
const slotContentErrors = new WeakSet<Error>();

/**
 * Each content component's guarded stand-in, so an element keeps one type across renders and its
 * state survives them.
 */
const guardedTypes = new WeakMap<object, FunctionComponent<object>>();

/**
 * The guarded stand-ins, so content that is guarded already is not guarded twice.
 */
const guardTypes = new WeakSet<object>();

/**
 * Whether an error was thrown by a slide's slot content rather than by its layout.
 *
 * @param error - A caught error.
 */
export function isSlotContentError(error: unknown): boolean {
  return error instanceof Error && slotContentErrors.has(error);
}

/**
 * Marks an error as thrown by slot content, wrapping a thrown non-Error value in an Error with its
 * text.
 *
 * @param error - Whatever the content threw.
 * @returns The marked error.
 */
function markContentError(error: unknown): Error {
  const marked = error instanceof Error ? error : new Error(String(error));
  slotContentErrors.add(marked);
  return marked;
}

/**
 * Props of {@link SlotGuard}.
 */
type SlotGuardProps = {
  /**
   * The slot's name. It is a prop under this name because layouts that read a slot's direct
   * children (the kit's `dashboard`) recognise the engine's wrapper by it.
   */
  'data-slot': string;

  /**
   * The slot's content.
   */
  children?: ReactNode;
};

/**
 * State of {@link SlotGuard}.
 */
type SlotGuardState = {
  /**
   * What the slot content threw while rendering, or `undefined` while it renders normally.
   */
  error: Error | undefined;
};

/**
 * A filled slot's wrapper. It renders `<span class="deck-slot" data-slot="<name>">`, which has
 * `display: contents`, so `deckster lint` can find and measure it. It also marks what the slot's
 * content throws while rendering and throws it again, so a boundary around the layout can leave it
 * to the slide's own error boundary: a broken slide component is not the layout's failure.
 *
 * The element a layout receives in `slots` is a `SlotGuard` element, not the `<span>`: its type is
 * this class, and its only props are `data-slot` (the slot's name) and `children` (the content). It
 * has no `className`, and other props given to it (through `cloneElement`, say) are not passed to
 * the `<span>`. A layout may read the content from `props.children` and replace it with
 * `cloneElement(slot, {}, newChildren)`, which keeps the guard.
 *
 * The content is guarded on its own as well (see {@link guardSlotContent}), so a layout that takes
 * it out of this element and renders it elsewhere still has what it throws reported as the slide's
 * error.
 */
export class SlotGuard extends Component<SlotGuardProps, SlotGuardState> {
  /**
   * No error until the content throws.
   */
  override state: SlotGuardState = { error: undefined };

  /**
   * Records and marks what the content threw; a thrown non-Error value is wrapped in an Error with
   * its text.
   *
   * @param error - Whatever the content threw.
   */
  static getDerivedStateFromError(error: unknown): SlotGuardState {
    return { error: markContentError(error) };
  }

  /**
   * The wrapped content, or the error it threw, thrown again to the next boundary up.
   */
  override render(): ReactNode {
    const { error } = this.state;
    if (error !== undefined) {
      throw error;
    }

    return (
      <span className="deck-slot" data-slot={this.props['data-slot']}>
        {this.props.children}
      </span>
    );
  }
}

/**
 * Props of {@link ContentBoundary}.
 */
type ContentBoundaryProps = {
  /**
   * One content element, rendered as it is.
   */
  children?: ReactNode;
};

/**
 * Marks what one content element throws while rendering and throws it again, wherever the layout
 * renders that element. It draws nothing of its own.
 */
class ContentBoundary extends Component<ContentBoundaryProps, SlotGuardState> {
  /**
   * No error until the content throws.
   */
  override state: SlotGuardState = { error: undefined };

  /**
   * Records and marks what the content threw.
   *
   * @param error - Whatever the content threw.
   */
  static getDerivedStateFromError(error: unknown): SlotGuardState {
    return { error: markContentError(error) };
  }

  /**
   * The content, or the error it threw, thrown again to the next boundary up.
   */
  override render(): ReactNode {
    const { error } = this.state;
    if (error !== undefined) {
      throw error;
    }

    return this.props.children;
  }
}

/**
 * Slot content with every component element in it guarded on its own: each one becomes an element
 * of a stand-in type that renders the original type, with the same props and key, inside a boundary
 * that marks what it throws as the slide's error. A layout can then render the content anywhere,
 * inside the slot's element or taken out of it, and an error the slide's content throws is never
 * the layout's.
 *
 * Only the element's type changes. Its `props` (and `props.children`) and `key` are the original's,
 * so a layout that reads them, counts the children or rebuilds an element with `cloneElement` keeps
 * working. Text, HTML elements and fragments keep their type: they cannot throw on their own, so
 * the component elements inside them are guarded instead, and a component's own children are left
 * as they are, for components that read them. The stand-in draws no DOM, so the page is unchanged.
 *
 * @param node - A filled slot's content.
 * @returns The same content, guarded; the very same node when it holds no component element.
 */
export function guardSlotContent(node: ReactNode): ReactNode {
  if (Array.isArray(node)) {
    const items: readonly ReactNode[] = node;
    const guarded = items.map(guardSlotContent);
    return guarded.some((item, index) => item !== items[index]) ? guarded : node;
  }

  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return node;
  }

  const { type } = node;
  if (typeof type === 'string' || typeof type === 'symbol') {
    return guardChildren(node);
  }

  if (typeof type !== 'function' && (typeof type !== 'object' || type === null)) {
    return node;
  }

  if (guardTypes.has(type) || type === SlotGuard) {
    return node;
  }

  const props = node.key === null ? node.props : { ...node.props, key: node.key };
  return createElement(guardedType(type), props);
}

/**
 * An HTML element or a fragment (or another of React's own element types) with the component
 * elements among its children guarded, or the element itself when there are none.
 *
 * @param node - The element.
 */
function guardChildren(node: ReactElement<{ children?: ReactNode }>): ReactNode {
  const { children } = node.props;
  const guarded = guardSlotContent(children);
  if (guarded === children) {
    return node;
  }

  // Children passed one by one, as the compiled MDX passes them, so React does not ask for keys.
  return Array.isArray(guarded)
    ? cloneElement(node, {}, ...(guarded as ReactNode[]))
    : cloneElement(node, {}, guarded);
}

/**
 * The guarded stand-in for a component type, made once per type.
 *
 * @param type - The content element's component type.
 */
function guardedType(type: ElementType & object): FunctionComponent<object> {
  const known = guardedTypes.get(type);
  if (known !== undefined) {
    return known;
  }

  /**
   * Renders the original component inside a boundary that marks its errors as the slide's.
   *
   * @param props - The original element's props.
   */
  const Guarded = (props: object): ReactElement => (
    <ContentBoundary>{createElement(type, props)}</ContentBoundary>
  );
  Guarded.displayName = `SlotContent(${typeName(type)})`;
  guardedTypes.set(type, Guarded);
  guardTypes.add(Guarded);
  return Guarded;
}

/**
 * A component type's name, for the stand-in's display name.
 *
 * @param type - The component type.
 */
function typeName(type: object): string {
  const named: { displayName?: unknown; name?: unknown } = type;
  if (typeof named.displayName === 'string' && named.displayName !== '') {
    return named.displayName;
  }

  return typeof named.name === 'string' && named.name !== '' ? named.name : 'Component';
}
