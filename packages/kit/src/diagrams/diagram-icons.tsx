import type { ReactNode } from 'react';

import type { IconComponent } from '#diagrams/flow-parts.tsx';

import { isIconImage } from '#diagrams/diagram-icon-source.ts';

/**
 * A component from the React slide or the URL of an image.
 */
export type DiagramIconSource = IconComponent | string;

/**
 * Keeps a functional icon component or an image URL; an MDX name has no runtime glyph.
 */
export function diagramIcon(icon: DiagramIconSource | undefined): DiagramIconSource | undefined {
  if (typeof icon === 'function' || (typeof icon === 'string' && isIconImage(icon))) {
    return icon;
  }

  return undefined;
}

/**
 * Draws an icon as a glyph or an inert decorative image.
 */
export function DiagramIcon({ source }: { source: DiagramIconSource }): ReactNode {
  if (typeof source === 'string') {
    return <img alt="" src={source} draggable={false} />;
  }

  const Glyph = source;
  return <Glyph aria-hidden="true" focusable="false" />;
}
