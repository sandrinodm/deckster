import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * The enclosing slide's `.deck-placed` DOM element; provided by the engine so placed components
 * rendered inside a TSX slide can portal into it. `null` before the layer mounts or outside a
 * slide.
 */
export const PlacedLayerContext = createContext<HTMLElement | null>(null);

/**
 * Whether the calling component is already rendered directly inside the slide's `.deck-placed`
 * layer (as MDX placed elements are), so it does not need to portal into it.
 */
const InsidePlacedLayerContext = createContext(false);

/**
 * Returns the enclosing slide's `.deck-placed` DOM element, or `null` before it mounts or outside a
 * slide. Placed components in TSX slides portal into this element.
 */
export function usePlacedLayer(): HTMLElement | null {
  return useContext(PlacedLayerContext);
}

/**
 * Returns `true` when the calling component is already rendered directly inside the slide's
 * `.deck-placed` layer (as MDX slides render lifted placed elements), and `false` otherwise.
 */
export function useInsidePlacedLayer(): boolean {
  return useContext(InsidePlacedLayerContext);
}

/**
 * Props of {@link PlacedLayerHost}.
 */
type PlacedLayerHostProps = {
  /**
   * The slide's layout content, rendered before the placed layer.
   */
  children: ReactNode;

  /**
   * Elements lifted into the placed layer by the MDX build; rendered inside `.deck-placed` with
   * {@link useInsidePlacedLayer} returning `true`.
   */
  placed?: ReactNode;
};

/**
 * Renders a slide's layout followed by its `.deck-placed` overlay layer inside
 * `section.deck-slide`, exposing the layer node through {@link PlacedLayerContext} so TSX slides can
 * portal into it.
 */
export function PlacedLayerHost({ children, placed }: PlacedLayerHostProps): ReactNode {
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  return (
    <PlacedLayerContext value={layer}>
      {children}
      <div className="deck-placed" ref={setLayer}>
        {placed === undefined ? null : (
          <InsidePlacedLayerContext value={true}>{placed}</InsidePlacedLayerContext>
        )}
      </div>
    </PlacedLayerContext>
  );
}
