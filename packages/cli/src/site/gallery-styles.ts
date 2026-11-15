/**
 * The stylesheet of the site gallery: the deck tools' own palette (the deckster mark's paper, ink
 * and vermilion), light only, not a brand.
 */
export const GALLERY_STYLES = `
:root {
  color-scheme: light;
  --bg: #f4f1eb;
  --surface: #fffefb;
  --fg: #161514;
  --muted: #625c54;
  --border: #dcd6cb;
  --accent: #c2361a;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 32px 16px 64px;
  background: var(--bg);
  color: var(--fg);
  font: 16px/1.5 'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-optical-sizing: auto;
  -webkit-font-smoothing: antialiased;
}
main { max-width: 1120px; margin: 0 auto; }
h1 { font-size: 1.75rem; font-weight: 600; letter-spacing: -0.02em; margin: 0 0 4px; }
.lede { margin: 0 0 32px; color: var(--muted); }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 20px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}
.thumb {
  display: block;
  aspect-ratio: 16 / 9;
  background: var(--border);
}
.thumb img { display: block; width: 100%; height: 100%; object-fit: cover; }
.body { display: flex; flex-direction: column; gap: 4px; padding: 16px; }
.body h2 { margin: 0; font-size: 1.1rem; font-weight: 600; letter-spacing: -0.011em; }
.body h2 a { color: inherit; text-decoration: none; }
.body h2 a:hover, .body h2 a:focus-visible { color: var(--accent); text-decoration: underline; }
.meta { margin: 0; color: var(--muted); font-size: 0.875rem; }
.downloads { display: flex; gap: 12px; margin-top: 8px; font-size: 0.875rem; }
.downloads a { color: var(--accent); }
.empty { padding: 24px; border: 1px dashed var(--border); border-radius: 12px; color: var(--muted); }
@media (max-width: 480px) {
  body { padding: 24px 16px 48px; }
  h1 { font-size: 1.4rem; }
}
`;
