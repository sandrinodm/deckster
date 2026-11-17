import { existsSync } from "node:fs";
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import nimbus, {
  defineConfig as defineNimbusConfig,
} from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";
import { deckMarkdownComponents } from "./src/components/deck/markdown";

const nimbusConfig = defineNimbusConfig({
  // GitHub Pages project site. The path part lives in Astro's `base` below;
  // a custom domain later only changes `site` and `base`.
  site: "https://sandrinodm.github.io",
  title: "deckster",
  description:
    "deckster: a code-first slide framework with typed brands, MDX slides and a deck CLI.",
  locale: "en",
  github: "https://github.com/sandrinodm/deckster",
  // Pages live on the docs-site branch of the main repository. Nimbus
  // replaces `{path}` with the file's repo path (`src/content/docs/….mdx`).
  editPattern: "https://github.com/sandrinodm/deckster/edit/docs-site/{path}",
  // No site-wide socialImageAlt: BaseLayout passes one per page to NimbusHead
  // ("<title> — deckster docs"), since each page has its own card.
  // Origin-root discovery files (/.well-known/*) can't be served from a
  // project page under /deckster, so leave them out.
  agents: { discovery: false },
  // Top-level order of the rail; each folder's pages fill in automatically.
  sidebar: {
    items: [
      "index",
      { label: "Get started", autogenerate: { directory: "get-started" } },
      { label: "Concepts", autogenerate: { directory: "concepts" } },
      { label: "Write slides", autogenerate: { directory: "write-slides" } },
      { label: "Data and diagrams", autogenerate: { directory: "data-and-diagrams" } },
      { label: "Brands", autogenerate: { directory: "brands" } },
      { label: "Review", autogenerate: { directory: "review" } },
      { label: "Present", autogenerate: { directory: "present" } },
      { label: "Export and publish", autogenerate: { directory: "export-and-publish" } },
      { label: "AI agents", autogenerate: { directory: "ai-agents" } },
      { label: "Reference", autogenerate: { directory: "reference" } },
      { label: "Examples", autogenerate: { directory: "examples" } },
      { label: "Project", autogenerate: { directory: "project" } },
    ],
  },
});

export default defineConfig({
  // Served at https://sandrinodm.github.io/deckster/. Write internal links
  // without the base (`/get-started/quickstart/`); Nimbus adds it.
  base: "/deckster",
  // nimbus:adapter
  output: "static",
  // Tailwind v4 via its Vite plugin (the integration Astro recommends for
  // Tailwind v4 — replaces the PostCSS plugin, which doesn't build under
  // Astro 7's Vite 8 bundler).
  vite: {
    plugins: [tailwindcss()],
  },
  // Hover-prefetch link targets so full-page navigations feel instant without
  // a client-side router.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    nimbus(nimbusConfig, {
      // Authoring rules are opt-in by design — your repo, your taste. The
      // two below are the load-bearing pair: frontmatter has to validate
      // against the content schema for the page to render properly, and
      // broken internal links are 404s for your readers. Add the others
      // (heading hierarchy, code-block language, style, etc.) when you're
      // ready to enforce them — see `nimbus-docs lint --help`.
      rules: {
        "nimbus/frontmatter-shape": "error",
        // Built decks are copied into public/decks/ by the deploy and aren't
        // committed. Without that folder, links to /decks/... can't be
        // checked, so they're skipped; check them by hand. When the folder
        // is there (the deploy build), deck links are checked like any other.
        "nimbus/internal-link": existsSync("public/decks")
          ? "error"
          : ["error", { ignore: ["/decks/**"] }],
      },
      markdown: {
        // Wrap wide tables so they scroll instead of overflowing the page
        // (styled by `.nb-table-scroll` in src/styles/prose.css).
        hastPlugins: [tableScroll()],
        // `## Install {#install}` gives a heading a fixed id. A heading that
        // ends in other `{…}` text, such as `{account_id}` in a .md file, is
        // read as attributes too; remove this to keep it as text.
        features: { headingAttributes: true },
        // The deck components' Markdown: without these, a self-closing custom component is
        // dropped from each page's index.md and llms-full.txt. See src/components/deck/markdown.ts.
        componentMap: deckMarkdownComponents(),
      },
    }),
  ],
});
