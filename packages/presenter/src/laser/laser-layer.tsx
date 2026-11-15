import { useEffect, useState, type ReactNode } from 'react';

import { updateUi, useUiState, type LaserPoint } from '#ui/ui-state.ts';

/**
 * How long a laser point from the presenter window stays on the audience screen without moving, in
 * milliseconds.
 */
const REMOTE_LASER_IDLE_MS = 2500;

/**
 * The selector of the scaled canvas the presenter's laser point is mapped onto.
 */
const CANVAS_SELECTOR = '.deck-canvas';

/**
 * The class both laser dots share: the local pointer and the one the presenter window sends.
 */
const LASER_CLASS_NAME = 'dp-ui dp-laser';

/**
 * The laser pointer in the audience window: a red dot with a white ring that follows the cursor
 * while laser mode is on, and the dot the presenter window sends while it moves.
 */
export function LaserLayer(): ReactNode {
  const { laser, remoteLaser } = useUiState();
  return (
    <>
      {laser ? <LocalLaser /> : null}
      {remoteLaser === undefined ? null : <RemoteLaser point={remoteLaser} />}
    </>
  );
}

/**
 * The dot that follows this window's cursor. It hides the cursor itself while it is on.
 */
function LocalLaser(): ReactNode {
  const [position, setPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => {
    /**
     * Follows the cursor.
     */
    const onMove = (event: PointerEvent) => setPosition({ x: event.clientX, y: event.clientY });
    /**
     * Hides the dot when the cursor leaves the window.
     */
    const onLeave = () => setPosition(undefined);
    window.addEventListener('pointermove', onMove);
    document.documentElement.addEventListener('pointerleave', onLeave);
    document.documentElement.dataset['dpLaser'] = '';
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      delete document.documentElement.dataset['dpLaser'];
    };
  }, []);
  if (position === undefined) {
    return null;
  }

  return (
    <div
      className={LASER_CLASS_NAME}
      data-deck-interactive=""
      data-laser="local"
      style={{ left: position.x, top: position.y }}
    />
  );
}

/**
 * Props of {@link RemoteLaser}.
 */
type RemoteLaserProps = {
  /**
   * Where the presenter points, as fractions of the slide.
   */
  point: LaserPoint;
};

/**
 * The dot the presenter window sends, drawn over the canvas and cleared when it stops moving.
 */
function RemoteLaser({ point }: RemoteLaserProps): ReactNode {
  useEffect(() => {
    const timer = window.setTimeout(
      () => updateUi({ remoteLaser: undefined }),
      REMOTE_LASER_IDLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [point]);
  const canvas = document.querySelector(CANVAS_SELECTOR)?.getBoundingClientRect();
  if (canvas === undefined) {
    return null;
  }

  return (
    <div
      className={LASER_CLASS_NAME}
      data-deck-interactive=""
      data-laser="remote"
      style={{
        left: canvas.left + point.x * canvas.width,
        top: canvas.top + point.y * canvas.height,
      }}
    />
  );
}
