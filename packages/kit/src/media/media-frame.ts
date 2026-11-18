import { createContext, useContext } from 'react';

/**
 * What a layout's media frame tells the pictures inside it: the treatment the slide names (or the
 * brand's default) and whether the frame keeps rounded corners.
 */
export type MediaFrame = {
  /**
   * The treatment the frame draws its pictures in.
   */
  treatment: string;

  /**
   * `false` for a frame that bleeds to the slide edges, whose corners are the slide's.
   */
  rounded: boolean;

  /**
   * How pictures that name no `fit` of their own fill the frame; `cover` when left out.
   */
  fit?: 'cover' | 'contain' | undefined;
};

/**
 * The media frame around a component, so an `<Image>` (which a Markdown image becomes) in a
 * layout's media slot takes the slide's `treatment` and the frame's corners, as a bare `<img>`
 * there does; `undefined` outside a frame.
 */
export const MediaFrameContext = createContext<MediaFrame | undefined>(undefined);

/**
 * The media frame around the calling component, if any.
 *
 * @returns The frame's treatment and corners; `undefined` outside a frame.
 */
export function useMediaFrame(): MediaFrame | undefined {
  return useContext(MediaFrameContext);
}
