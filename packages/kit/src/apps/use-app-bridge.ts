import {
  createHostMessenger,
  type AppMessage,
  type DeckPayload,
  type HostMessenger,
} from '@deckster/app-bridge/host';
import { useBrand } from '@deckster/brand/runtime';
import { useDeck, useSlide, useStatic } from '@deckster/engine';
import { useEffect, useEffectEvent, useRef } from 'react';

import { appTheme, collectFontFaces } from '#apps/app-brand.ts';

/**
 * What the deck does with each message an app sends.
 */
export type BridgeHandlers = {
  /**
   * The app reported its first complete frame.
   */
  onReady: () => void;

  /**
   * The app asked for this many steps.
   */
  onRequestSteps: (count: number) => void;

  /**
   * The app sent a size hint.
   */
  onResize: (size: { width?: number; height?: number }) => void;

  /**
   * The app reported a failure.
   */
  onError: (message: string) => void;

  /**
   * The app handed the keyboard back (Escape inside it).
   */
  onRelease: () => void;

  /**
   * The app's page gained or lost keyboard focus.
   */
  onFocus: (focused: boolean) => void;
};

/**
 * Options of {@link useAppBridge}.
 */
export type AppBridgeOptions = {
  /**
   * The app's iframe element, once it exists.
   */
  frame: HTMLIFrameElement | null;

  /**
   * The origin the app is served from.
   */
  origin: string;

  /**
   * Whether the bridge runs at all: off for an external page that did not opt in.
   */
  enabled: boolean;

  /**
   * Whether the app should run (its slide is on screen).
   */
  running: boolean;

  /**
   * The slide's current step.
   */
  step: number;

  /**
   * What to do with the app's messages.
   */
  handlers: BridgeHandlers;
};

/**
 * Connects the enclosing slide to one app frame. When the app says `hello` it answers with `init`
 * (the surface's brand tokens as variables and as an object, color scheme, slide, step, activity),
 * and afterwards keeps the app current: `activate` and `deactivate` as the slide comes and goes,
 * `step` as steps change, and a fresh `init` when the brand changes. `next` and `prev` from the app
 * move the deck. Messages from any other window or origin, and anything that fails the protocol's
 * schema, are ignored.
 *
 * @param options - The frame, its origin, its state and the handlers.
 */
export function useAppBridge(options: AppBridgeOptions): void {
  const { frame, origin, enabled, running, step } = options;
  const deck = useDeck();
  const slide = useSlide();
  const isStatic = useStatic();
  const view = useBrand();
  const messenger = useRef<HostMessenger | undefined>(undefined);
  const connected = useRef(false);
  /**
   * The `init` message for the app's current state.
   */
  const initPayload = (): DeckPayload => {
    const { brand, cssVariables } = appTheme(view);
    return {
      type: 'init',
      brand,
      cssVariables,
      fontFaces: collectFontFaces(),
      scheme: view.surface.scheme,
      slide: { index: slide.index, id: slide.id },
      step,
      active: running,
      static: isStatic,
    };
  };
  const onMessage = useEffectEvent((message: AppMessage) => {
    switch (message.type) {
      case 'hello':
        connected.current = true;
        messenger.current?.send(initPayload());
        return;
      case 'ready':
        options.handlers.onReady();
        return;
      case 'requestSteps':
        options.handlers.onRequestSteps(message.count);
        return;
      case 'next':
        deck.next();
        return;
      case 'prev':
        deck.prev();
        return;
      case 'resize':
        options.handlers.onResize({
          ...(message.width === undefined ? {} : { width: message.width }),
          ...(message.height === undefined ? {} : { height: message.height }),
        });
        return;
      case 'error':
        options.handlers.onError(message.message);
        return;
      case 'release':
        options.handlers.onRelease();
        return;
      case 'focus':
        options.handlers.onFocus(message.focused);
        return;
    }
  });
  useEffect(() => {
    if (frame === null || !enabled) {
      return undefined;
    }

    connected.current = false;
    const created = createHostMessenger({ frame, origin, onMessage });
    messenger.current = created;
    return () => {
      created.dispose();
      messenger.current = undefined;
    };
  }, [frame, origin, enabled]);
  const send = useEffectEvent((payload: DeckPayload) => {
    if (connected.current) {
      messenger.current?.send(payload);
    }
  });
  useEffect(() => {
    send({ type: running ? 'activate' : 'deactivate' });
  }, [running]);
  useEffect(() => {
    send({ type: 'step', step });
  }, [step]);
  useEffect(() => {
    send({ type: 'static', static: isStatic });
  }, [isStatic]);
  const themeKey = `${view.brand.name}/${view.surface.name}`;
  useEffect(() => {
    if (connected.current) {
      messenger.current?.send(initPayload());
    }
    // The brand and surface are the only inputs that warrant a fresh init.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey]);
}
