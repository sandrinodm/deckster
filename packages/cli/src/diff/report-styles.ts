/**
 * The stylesheet of the diff report page: its own neutral tokens, light and dark, no brand.
 */
export const REPORT_STYLES = `
:root {
  color-scheme: light dark;
  --bg: #f6f6f4;
  --surface: #ffffff;
  --fg: #1c1c1a;
  --muted: #6b6b66;
  --border: #dddcd6;
  --changed: #b45309;
  --added: #15803d;
  --removed: #b91c1c;
  --moved: #4338ca;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #131312;
    --surface: #1c1c1a;
    --fg: #ecece8;
    --muted: #a3a39c;
    --border: #34332f;
    --changed: #f59e0b;
    --added: #4ade80;
    --removed: #f87171;
    --moved: #a5b4fc;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 24px 16px 64px;
  background: var(--bg);
  color: var(--fg);
  font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
main { max-width: 1200px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin: 0 0 4px; }
h2 { font-size: 1.1rem; margin: 40px 0 12px; }
p { margin: 0; }
.meta { color: var(--muted); }
.counts { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 0; padding: 0; list-style: none; }
.counts li {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
}
.card {
  margin: 0 0 20px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
}
.card header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin: 0 0 12px; }
.card h3 { margin: 0; font-size: 1rem; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
.tag { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.changed .tag { color: var(--changed); }
.added .tag { color: var(--added); }
.removed .tag { color: var(--removed); }
.moved .tag { color: var(--moved); }
.card img { display: block; width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--border); }
.card a { color: inherit; }
.step { margin: 16px 0 0; }
.step h4 { margin: 0 0 8px; font-size: 0.9rem; color: var(--muted); font-weight: 600; }
.links { margin-top: 8px; font-size: 0.85rem; color: var(--muted); }
.empty { padding: 24px; border: 1px dashed var(--border); border-radius: 12px; color: var(--muted); }
ul.plain { margin: 0; padding-left: 20px; }
@media (max-width: 600px) {
  body { padding: 16px 16px 48px; }
  h1 { font-size: 1.25rem; }
}
`;
