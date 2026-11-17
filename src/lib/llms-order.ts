/**
 * Puts llms.txt, the per-section llms.txt and llms-full.txt in sidebar order, with the sidebar's
 * labels. Nimbus writes the sections alphabetically, labelled by title-casing the folder name
 * ("Ai Agents", "Data And Diagrams"), and the pages of a section alphabetically too; agents should
 * read the same structure people see in the rail.
 *
 * The order comes from astro.config.ts (`sidebar.items`, a label and a folder per section) and each
 * page's `sidebar.order`. Each route passes one of these as the factory's `body` option, so the
 * ETag Nimbus sends is over the reordered text.
 */
import type { APIContext } from "astro";
import { getCollection } from "astro:content";
import { config } from "virtual:nimbus/config";

type Section = { label: string; directory: string };

function sections(): Section[] {
  const items = (config.sidebar?.items ?? []) as unknown[];
  return items.flatMap((item) => {
    const group = item as { label?: string; autogenerate?: { directory?: string } };
    return group.label && group.autogenerate?.directory ? [{ label: group.label, directory: group.autogenerate.directory }] : [];
  });
}

/**
 * A sort key: one number per level of the page's path, then the title. The first level is the
 * section's place; each folder below it takes the `sidebar.order` of its `index` page, and the
 * page's own order comes last. A folder's own index sorts first inside the folder (`-Infinity`
 * at its own level), so `reference/layouts` is [r, 3, -∞], `reference/layouts/title` is
 * [r, 3, 1] and `reference/components` is [r, 4]: a folder's pages stay together where its
 * index sits among its siblings. `names` holds each level's segment, the tie-break when two
 * folders, or a folder and a page, share an order, so their pages never interleave; pages that
 * share an order tie on their title, as in the sidebar.
 */
type Key = { orders: number[]; names: string[]; title: string };

const UNORDERED = Number.MAX_SAFE_INTEGER;

/** A sort key per page path (`get-started/quickstart`). */
async function pageKeys(): Promise<Map<string, Key>> {
  const order = sections().map((s) => s.directory);
  const entries = (await getCollection("docs")).map((entry) => ({
    id: entry.id.replace(/\/index$/, ""),
    order: (entry.data as { sidebar?: { order?: number } }).sidebar?.order ?? UNORDERED,
    title: entry.data.title as string,
  }));
  const orderOf = new Map(entries.map((e) => [e.id, e.order]));
  const isFolder = (id: string) => entries.some((e) => e.id.startsWith(`${id}/`));
  const keys = new Map<string, Key>();
  for (const { id, order: own, title } of entries) {
    if (id === "index") {
      keys.set(id, { orders: [-1], names: [""], title });
      continue;
    }
    const parts = id.split("/");
    const found = order.indexOf(parts[0]!);
    const orders = [found < 0 ? order.length : found];
    const names = [parts[0]!];
    // Each folder between the section and the page: the order of the folder's index page.
    for (let level = 2; level < parts.length; level++) {
      const parent = parts.slice(0, level).join("/");
      orders.push(orderOf.get(parent) ?? UNORDERED);
      names.push(parts[level - 1]!);
    }
    const folder = isFolder(id);
    if (parts.length > 1) {
      // A page's own level ties on its title, as in the sidebar; a folder's on its name.
      orders.push(own);
      names.push(folder ? parts[parts.length - 1]! : "");
    }
    // A folder's index (a section's, or a nested folder's) comes before the folder's pages.
    if (folder) {
      orders.push(-Infinity);
      names.push("");
    }
    keys.set(id, { orders, names, title });
  }
  return keys;
}

/** Compares level by level (order, then segment name), shorter first, then by title. */
const compare = (a: Key | undefined, b: Key | undefined) => {
  if (!a || !b) return 0;
  const n = Math.min(a.orders.length, b.orders.length);
  for (let i = 0; i < n; i++) {
    if (a.orders[i] !== b.orders[i]) return a.orders[i]! < b.orders[i]! ? -1 : 1;
    const byName = a.names[i]!.localeCompare(b.names[i]!);
    if (byName !== 0) return byName;
  }
  return a.orders.length - b.orders.length || a.title.localeCompare(b.title);
};

/** The page path of a URL on the site: `…/deckster/get-started/quickstart/index.md` → `get-started/quickstart`. */
function pathOf(url: string, site: string): string {
  const rest = url.startsWith(site) ? url.slice(site.length) : url;
  return rest.replace(/^\/+/, "").replace(/(\/index\.md|\/llms\.txt|\/)$/, "").replace(/\/$/, "") || "index";
}

/** Sorts each run of consecutive list lines by the page or section their link points at. */
function sortLists(body: string, key: (line: string) => Key | undefined): string {
  const lines = body.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    if (!lines[i]!.startsWith("- [")) {
      out.push(lines[i++]!);
      continue;
    }
    const run: string[] = [];
    while (i < lines.length && lines[i]!.startsWith("- [")) run.push(lines[i++]!);
    out.push(...run.map((line, n) => ({ line, n })).sort((a, b) => compare(key(a.line), key(b.line)) || a.n - b.n).map((x) => x.line));
  }
  return out.join("\n");
}

function siteRoot(context: APIContext): string {
  return new URL(import.meta.env.BASE_URL, context.site ?? context.url).href.replace(/\/$/, "");
}

const LINK = /^- \[([^\]]*)\]\(([^)]+)\)/;

/** /llms.txt: section labels from the sidebar, sections in sidebar order. */
export async function orderedLlms(body: string, context: APIContext): Promise<string> {
  const site = siteRoot(context);
  const byDir = new Map(sections().map((s, i) => [s.directory, { ...s, i }]));
  const relabelled = body
    .split("\n")
    .map((line) => {
      const m = LINK.exec(line);
      const section = m && /\/llms\.txt$/.test(m[2]!) ? byDir.get(pathOf(m[2]!, site)) : undefined;
      return section ? line.replace(LINK, `- [${section.label}](${m![2]})`) : line;
    })
    .join("\n");
  return sortLists(relabelled, (line) => {
    const m = LINK.exec(line);
    if (!m) return undefined;
    const path = pathOf(m[2]!, site);
    if (path === "index") return { orders: [-1], names: [""], title: "" };
    const section = byDir.get(path);
    return section ? { orders: [section.i], names: [section.directory], title: "" } : undefined;
  });
}

/** /<section>/llms.txt: the sidebar's label as the heading, pages in sidebar order. */
export async function orderedSectionLlms(body: string, context: APIContext): Promise<string> {
  const site = siteRoot(context);
  const keys = await pageKeys();
  const section = sections().find((s) => s.directory === String(context.params.section ?? ""));
  const titled = section ? body.replace(/^# .*$/m, `# ${section.label}`) : body;
  return sortLists(titled, (line) => {
    const m = LINK.exec(line);
    return m ? keys.get(pathOf(m[2]!, site)) : undefined;
  });
}

/** /llms-full.txt: the pages in sidebar order. Each page starts `# Title`, `> description`, `Source: <url> · …`. */
export async function orderedLlmsFull(body: string, context: APIContext): Promise<string> {
  const site = siteRoot(context);
  const keys = await pageKeys();
  const lines = body.split("\n");
  // A page block starts at the `# ` line two lines above its `Source:` line.
  const starts: { at: number; path: string }[] = [];
  lines.forEach((line, i) => {
    const m = /^Source: (\S+) · Markdown: /.exec(line);
    if (m && i >= 4 && lines[i - 4]!.startsWith("# ") && lines[i - 2]!.startsWith("> ")) starts.push({ at: i - 4, path: pathOf(m[1]!, site) });
  });
  if (starts.length === 0) return body;
  const head = lines.slice(0, starts[0]!.at);
  const blocks = starts.map((s, n) => ({ ...s, n, lines: lines.slice(s.at, starts[n + 1]?.at ?? lines.length) }));
  // The last block runs to the end of the file; keep the file's own ending.
  const last = blocks[blocks.length - 1]!.lines;
  const trailing: string[] = [];
  while (last.length > 0 && last[last.length - 1] === "") trailing.unshift(last.pop()!);
  for (const b of blocks) {
    if (b.lines[b.lines.length - 1] !== "") b.lines.push("");
  }
  blocks.sort((a, b) => compare(keys.get(a.path), keys.get(b.path)) || a.n - b.n);
  const joined = blocks.flatMap((b) => b.lines);
  while (joined.length > 0 && joined[joined.length - 1] === "") joined.pop();
  return [...head, ...joined, ...trailing].join("\n");
}
