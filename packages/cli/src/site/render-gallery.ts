import { escapeHtml } from '#diff/escape-html.ts';
import { GALLERY_STYLES } from '#site/gallery-styles.ts';

/**
 * One deck in the gallery.
 */
export type GalleryEntry = {
  /**
   * The deck folder name, which is also its folder in the site.
   */
  id: string;

  /**
   * The deck's title from its config.
   */
  title: string;

  /**
   * The folder name of the brand the deck uses, such as `nocturne`.
   */
  brand: string;

  /**
   * The brand's own name from its `label`, such as `Nocturne`, which the card shows.
   */
  brandLabel: string;

  /**
   * How many slides the deck has.
   */
  slides: number;

  /**
   * Whether `<id>/thumbnail.png` exists.
   */
  thumbnail: boolean;

  /**
   * Whether `<id>/<id>.pdf` exists.
   */
  pdf: boolean;

  /**
   * Whether `<id>/<id>.pptx` exists.
   */
  pptx: boolean;
};

/**
 * Renders the site's root page: a responsive grid with each deck's thumbnail, title, brand label
 * and slide count, and links to the deck and to its PDF and PPTX when they were exported. It has no
 * script, and every link is relative so the site works under any path.
 *
 * @param entries - The decks, in the order to show them.
 */
export function renderGallery(entries: readonly GalleryEntry[]): string {
  const cards = entries.map(card).join('\n');
  const noun = entries.length === 1 ? 'deck' : 'decks';
  const list =
    entries.length === 0
      ? '<p class="empty">No decks were built.</p>'
      : `<ul class="grid">\n${cards}\n</ul>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Decks</title>
<style>${GALLERY_STYLES}</style>
</head>
<body>
<main>
<h1>Decks</h1>
<p class="lede">${entries.length} ${noun}</p>
${list}
</main>
</body>
</html>
`;
}

/**
 * One deck's card.
 *
 * @param entry - The deck.
 */
function card(entry: GalleryEntry): string {
  const href = `${encodeURIComponent(entry.id)}/`;
  const title = escapeHtml(entry.title);
  const picture = entry.thumbnail
    ? `<img src="${href}thumbnail.png" alt="First slide of ${title}" loading="lazy">`
    : '';
  const downloads = [
    entry.pdf ? `<a href="${href}${encodeURIComponent(entry.id)}.pdf">PDF</a>` : '',
    entry.pptx ? `<a href="${href}${encodeURIComponent(entry.id)}.pptx">PPTX</a>` : '',
  ].filter((link) => link !== '');
  const brandFolder = escapeHtml(entry.brand);
  const brand = `<span title="brands/${brandFolder}">${escapeHtml(entry.brandLabel)}</span>`;
  const slides = `${entry.slides} ${entry.slides === 1 ? 'slide' : 'slides'}`;
  return `<li class="card">
<a class="thumb" href="${href}" tabindex="-1" aria-hidden="true">${picture}</a>
<div class="body">
<h2><a href="${href}">${title}</a></h2>
<p class="meta">${escapeHtml(entry.id)} &middot; ${brand} &middot; ${slides}</p>
${downloads.length === 0 ? '' : `<p class="downloads">${downloads.join('')}</p>`}
</div>
</li>`;
}
