import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { CANVAS_HEIGHT, CANVAS_WIDTH, fitCanvas, type CanvasFit } from '#canvas/fit-canvas.ts';

/**
 * Props of {@link Canvas}.
 */
type CanvasProps = {
  /**
   * The slides, laid out in canvas pixels.
   */
  children?: ReactNode;
};

/**
 * The fit before the stage has been measured: scale 0 keeps the canvas invisible for the first
 * frame instead of flashing it at full size.
 */
const UNMEASURED: CanvasFit = {
  /**
   * Zero until the stage size is known.
   */
  scale: 0,

  /**
   * No horizontal offset before measuring.
   */
  offsetX: 0,

  /**
   * No vertical offset before measuring.
   */
  offsetY: 0,
};

/**
 * The 1920x1080 logical canvas, scaled with a CSS transform to fit its container. Everything inside
 * is laid out in canvas pixels, so slides look the same at every window size.
 */
export function Canvas({ children }: CanvasProps): ReactNode {
  const stageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(UNMEASURED);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (stage === null) {
      return;
    }

    /**
     * Fits the canvas to the stage's current size; runs once on mount and on every resize.
     */
    const measure = () => {
      setFit(fitCanvas({ width: stage.clientWidth, height: stage.clientHeight }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={stageRef} className="deck-stage">
      <div
        className="deck-canvas"
        data-scale={fit.scale}
        style={{
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          transform: `translate(${fit.offsetX}px, ${fit.offsetY}px) scale(${fit.scale})`,
        }}>
        {children}
      </div>
    </div>
  );
}
