import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

import {
  DIAGRAM_DESCRIPTION_ATTRIBUTE,
  type DiagramDescription,
} from '#diagrams/diagram-description.ts';

/**
 * Keeps a diagram's `data-diagram-description` current: written after every render, and again once
 * its transitions and animations end and when its slide comes on screen, so the live description
 * has final opacities, colors and text rather than values caught mid-fade or while the slide was
 * hidden.
 *
 * @param root - The diagram's root element.
 * @param describe - Builds the description from the rendered diagram; `undefined` while the diagram
 *   is not laid out.
 */
export function useDiagramDescription(
  root: RefObject<HTMLElement | null>,
  describe: (() => DiagramDescription) | undefined,
): void {
  const latest = useRef(describe);
  useLayoutEffect(() => {
    latest.current = describe;
    writeDescription(root.current, describe);
  });
  useEffect(() => {
    const element = root.current;
    if (element === null) {
      return undefined;
    }

    let frame = 0;
    /**
     * Rewrites the description on the next frame, once whatever just finished has settled.
     */
    const schedule = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => writeDescription(root.current, latest.current));
    };
    element.addEventListener('transitionend', schedule);
    element.addEventListener('animationend', schedule);
    const slide = element.closest('.deck-slide');
    const observer = new MutationObserver(schedule);
    if (slide !== null) {
      observer.observe(slide, { attributes: true, attributeFilter: ['data-slide-active'] });
    }

    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('transitionend', schedule);
      element.removeEventListener('animationend', schedule);
      observer.disconnect();
    };
  }, [root]);
}

/**
 * Writes a description on its element, when there is one to write.
 *
 * @param element - The diagram's root.
 * @param describe - Builds the description.
 */
function writeDescription(
  element: HTMLElement | null,
  describe: (() => DiagramDescription) | undefined,
): void {
  if (element === null || describe === undefined) {
    return;
  }

  const json = JSON.stringify(describe());
  if (element.getAttribute(DIAGRAM_DESCRIPTION_ATTRIBUTE) !== json) {
    element.setAttribute(DIAGRAM_DESCRIPTION_ATTRIBUTE, json);
  }
}
