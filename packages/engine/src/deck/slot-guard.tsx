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
 * The guarded items of one-shot iterators, which React may encounter again on a render retry.
 */
const guardedIterators = new WeakMap<Iterable<ReactNode>, ReactNode[]>();

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
 * A filled slot's wrapper. It renders `<span class="deck-slot" data-slot="<name>">`, which has
 * `display: contents`, so `deckster lint` can find and measure it. A layout may read its
 * `data-slot` and `children` props and use `cloneElement` to keep the wrapper around new children.
 * The span takes its class from the engine and its slot name from `data-slot`.
 *
 * The slide's content carries its own error boundaries (see {@link guardSlotContent}). When a
 * layout adds children to the wrapper, errors from those children belong to the layout.
 */
export function SlotGuard({ 'data-slot': name, children }: SlotGuardProps): ReactNode {
  return (
    <span className="deck-slot" data-slot={name}>
      {children}
    </span>
  );
}

/**
 * Props of {@link ContentBoundary}.
 */
type ContentBoundaryProps = {
  /**
   * One piece of slide content, rendered as it is.
   */
  children?: ReactNode;
};

/**
 * State of {@link ContentBoundary}.
 */
type ContentBoundaryState = {
  /**
   * What the slide content threw while rendering, or `undefined` while it renders normally.
   */
  error: Error | undefined;
};

/**
 * Marks what slide content throws while rendering and throws it again, wherever the layout renders
 * that content. It draws nothing of its own.
 */
class ContentBoundary extends Component<ContentBoundaryProps, ContentBoundaryState> {
  /**
   * No error until the content throws.
   */
  override state: ContentBoundaryState = { error: undefined };

  /**
   * Records and marks what the content threw.
   *
   * @param error - Whatever the content threw.
   */
  static getDerivedStateFromError(error: unknown): ContentBoundaryState {
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
 * Component props, children and keys stay available to the layout. Arrays and iterables keep their
 * order and nesting. Text stays as text, HTML elements and fragments keep their type, and thenables
 * and portals render inside their own boundary. The boundaries draw no DOM.
 *
 * @param node - A filled slot's content.
 * @returns The content with error boundaries where React can render slide-owned code.
 */
export function guardSlotContent(node: ReactNode): ReactNode {
  if (Array.isArray(node)) {
    const items: readonly ReactNode[] = node;
    const guarded = items.map(guardSlotContent);
    return guarded.some((item, index) => item !== items[index]) ? guarded : node;
  }

  if (!isValidElement<{ children?: ReactNode }>(node)) {
    if (typeof node !== 'object' || node === null) {
      return node;
    }

    if (Symbol.iterator in node && typeof node[Symbol.iterator] === 'function') {
      return guardIterable(node);
    }

    const key = 'key' in node && typeof node.key === 'string' ? node.key : undefined;
    return <ContentBoundary key={key}>{node}</ContentBoundary>;
  }

  const { type } = node;
  if (typeof type === 'string' || typeof type === 'symbol') {
    return guardChildren(node);
  }

  if (typeof type !== 'function' && (typeof type !== 'object' || type === null)) {
    return node;
  }

  if (guardTypes.has(type) || type === ContentBoundary || type === SlotGuard) {
    return node;
  }

  const props = node.key === null ? node.props : { ...node.props, key: node.key };
  return createElement(guardedType(type), props);
}

/**
 * Guards the items when read and lets a one-shot generator supply the same children on a retry.
 *
 * @param nodes - The original child iterable.
 */
function guardIterable(nodes: Iterable<ReactNode>): Iterable<ReactNode> {
  return {
    [Symbol.iterator]: () => {
      const known = guardedIterators.get(nodes);
      if (known !== undefined) {
        return known[Symbol.iterator]();
      }

      const iterator = nodes[Symbol.iterator]();
      const guarded = Array.from({ [Symbol.iterator]: () => iterator }, guardSlotContent);
      if (Object.is(iterator, nodes)) {
        guardedIterators.set(nodes, guarded);
      }

      return guarded[Symbol.iterator]();
    },
  };
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

  if (Array.isArray(guarded) && guarded.length > 1) {
    // Multiple static MDX children can stay positional without gaining key warnings.
    const items: readonly ReactNode[] = guarded;
    return cloneElement(node, {}, ...items);
  }

  // React turns one positional child into a scalar, so pass a singleton array whole.
  return cloneElement(node, {}, guarded);
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
