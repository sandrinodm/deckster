'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const FULLSCREEN_EVENT = 'deck-shell:fullscreen';

contextBridge.exposeInMainWorld('deckShell', {
  isShell: true,
  displays: () => ipcRenderer.invoke('deck-shell:displays'),
  openPresenter: (displayId) => ipcRenderer.invoke('deck-shell:open-presenter', displayId),
  setFullscreen: (on) => ipcRenderer.invoke('deck-shell:set-fullscreen', Boolean(on)),
  isFullscreen: () => ipcRenderer.invoke('deck-shell:is-fullscreen'),
  onFullscreenChange: (listener) => {
    const handler = (_event, on) => listener(Boolean(on));
    ipcRenderer.on(FULLSCREEN_EVENT, handler);
    return () => ipcRenderer.removeListener(FULLSCREEN_EVENT, handler);
  },
  moveToDisplay: (displayId) => ipcRenderer.invoke('deck-shell:move-to-display', displayId),
});
