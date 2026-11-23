/**
 * Maximum URL characters included in a download refusal note.
 */
const REPORTED_URL_CHARACTERS = 200;

/**
 * The part of an Electron `DownloadItem` the policy reads.
 */
export type DownloadItemLike = {
  /**
   * The URL being downloaded.
   */
  getURL: () => string;
};

/**
 * The part of an Electron `Session` the download policy listens on.
 */
export type DownloadSessionLike = {
  /**
   * Registers the `will-download` listener.
   *
   * @param event - `will-download`.
   * @param listener - Called before a download starts; `event.preventDefault()` cancels it.
   */
  on: (
    event: 'will-download',
    listener: (event: { preventDefault: () => void }, item: DownloadItemLike) => void,
  ) => unknown;
};

/**
 * Cancels every download. The shell presents a deck; it has no use for downloads, and Electron's
 * default for a download without a save path is a native save dialog, which a slide script could
 * raise unprompted (and which keeps the window busy while the CLI waits). Denying is the simplest
 * rule that never shows a dialog: a deck that offers a file to download works in the browser (`deck
 * present --browser`, `deckster dev`), not in the shell. Each refusal is reported.
 *
 * @param session - The session the windows use.
 * @param report - Where the note about a refused download goes; standard error in the shell.
 */
export function installDownloadPolicy(
  session: DownloadSessionLike,
  report: (message: string) => void,
): void {
  session.on('will-download', (event, item) => {
    event.preventDefault();
    report(`deck shell: refused a download of ${item.getURL().slice(0, REPORTED_URL_CHARACTERS)}.`);
  });
}
