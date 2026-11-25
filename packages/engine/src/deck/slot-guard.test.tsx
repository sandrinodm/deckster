import { Fragment, isValidElement, memo, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vite-plus/test';

import { guardSlotContent } from '#deck/slot-guard.tsx';

/**
 * A content component with a prop and children.
 */
function Card({ label, children }: { label: string; children?: ReactNode }): ReactNode {
  return (
    <section data-label={label}>
      <h3>{label}</h3>
      {children}
    </section>
  );
}

/**
 * A memoized content component, whose type is an object rather than a function.
 */
const Badge = memo(({ text }: { text: string }): ReactNode => <em>{text}</em>);

/**
 * Slot content of every kind MDX and TSX slides produce.
 */
function mixedContent(): ReactNode {
  return [
    <h2 key="title">
      Title <Badge text="new" />
    </h2>,
    'plain text',
    42,
    null,
    <Fragment key="group">
      <p>
        In a <strong>fragment</strong>
      </p>
      <Card label="Inner">
        <Badge text="nested" />
      </Card>
    </Fragment>,
    <ul key="list">
      {['a', 'b', 'c'].map((item) => (
        <li key={item}>
          <Badge text={item} />
        </li>
      ))}
    </ul>,
    <Card key="card" label="Outer" />,
  ];
}

describe('guardSlotContent', () => {
  it('renders the same markup as the content it guards', () => {
    expect(renderToStaticMarkup(guardSlotContent(mixedContent()))).toBe(
      renderToStaticMarkup(mixedContent()),
    );
  });

  it('keeps props, keys and the types of HTML elements and fragments', () => {
    const original = mixedContent() as ReactNode[];
    const guarded = guardSlotContent(original) as ReactNode[];
    const describeItem = (item: ReactNode, index: number): unknown => {
      if (!isValidElement(item)) {
        return item;
      }

      const before = original[index];
      const sameType = isValidElement(before) && item.type === before.type;
      return { key: item.key, sameType, props: sameType ? 'kept' : item.props };
    };
    expect(guarded.map(describeItem)).toEqual([
      { key: 'title', sameType: true, props: 'kept' },
      'plain text',
      42,
      null,
      { key: 'group', sameType: true, props: 'kept' },
      { key: 'list', sameType: true, props: 'kept' },
      { key: 'card', sameType: false, props: { label: 'Outer' } },
    ]);
  });

  it('returns content without components as it is and guards nothing twice', () => {
    const text = [<p key="a">Only text</p>, 'and more'];
    expect(guardSlotContent(text)).toBe(text);
    const once = guardSlotContent(<Card label="Once" />);
    expect(guardSlotContent(once)).toBe(once);
  });
});
