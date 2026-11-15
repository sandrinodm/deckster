import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The room the label needs above the box, in viewport pixels; nearer the top it goes below.
 */
const LABEL_ROOM_PX = 28;

/**
 * The space the label keeps from the window's edges, in viewport pixels.
 */
const EDGE_GAP_PX = 8;

/**
 * Props of {@link TargetOutline}.
 */
type TargetOutlineProps = {
  /**
   * The box to outline, in viewport pixels.
   */
  box: DOMRect;

  /**
   * The label above the box, such as `h2 · slides/intro.mdx:7`, or `undefined` for none.
   */
  label?: string | undefined;

  /**
   * `hover` while pointing, `selected` while writing a comment, `flash` after a jump from the
   * panel, `region` for a dragged rectangle.
   */
  tone: 'hover' | 'selected' | 'flash' | 'region';
};

/**
 * An outline drawn over an element of the slide, with its source label. It never takes pointer
 * events, so the capture layer below keeps working.
 */
export function TargetOutline({ box, label, tone }: TargetOutlineProps): ReactNode {
  return (
    <div
      className="dc-outline"
      data-tone={tone}
      aria-hidden="true"
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
      {label === undefined ? null : (
        <OutlineLabel text={label} below={box.top < LABEL_ROOM_PX} box={box} />
      )}
    </div>
  );
}

/**
 * The source label over an outline, shifted sideways as far as it takes to stay inside the window
 * (an element at the window's right edge, such as the brand logo, would push it off screen).
 *
 * @param props - The text, whether it goes below the box, and the box, to measure again when it
 *   moves.
 */
function OutlineLabel({
  text,
  below,
  box,
}: {
  text: string;
  below: boolean;
  box: DOMRect;
}): ReactNode {
  const ref = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const left = rect.left - shift;
    const overflow = left + rect.width - (window.innerWidth - EDGE_GAP_PX);
    setShift(
      overflow > 0 ? -Math.min(overflow, left - EDGE_GAP_PX) : Math.max(0, EDGE_GAP_PX - left),
    );
  }, [text, box.left, box.top, box.width, shift]);
  return (
    <span
      ref={ref}
      className="dc-outline-label"
      data-below={below}
      style={shift === 0 ? undefined : { transform: `translateX(${shift}px)` }}>
      {text}
    </span>
  );
}
