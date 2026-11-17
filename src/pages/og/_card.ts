/**
 * The site's social cards, 1200 × 630 PNGs rendered at build time: the logo
 * over a hairline, then the page's section (after the logo's vermilion square), its title and
 * its description. `og/[...slug].ts`
 * draws one per page and `og.png.ts` the site's own, with its description as
 * the title. This file is the cards' look; edit it freely.
 *
 * `@cloudflare/nimbus-docs/og` does the rest: it loads the fonts, fits text
 * to its lines by measuring it, and renders the PNG. To use another script,
 * such as Chinese or Japanese, add a font that covers it to `fonts`.
 *
 * The leading underscore keeps Astro from routing this file or `_fonts/`.
 */
import { createCardRenderer, type CardNode, type CardTypography } from "@cloudflare/nimbus-docs/og";
import { root } from "astro:config/server";
import { config } from "virtual:nimbus/config";

import { logo } from "@/components/logo";

// The site's light theme (src/styles/globals.css), in hex for Satori.
const FOREGROUND = "#161514";
const MUTED = "#6b6862";
const BORDER = "#e7e6e5";
const BACKGROUND = "#ffffff";

const WIDTH = 1200;
const HEIGHT = 630;
const LEFT = 80;
const COLUMN = WIDTH - LEFT - 200;

const TITLE: CardTypography = { fontFamily: "Inter", fontWeight: 500, letterSpacing: "-0.025em", lineHeight: 1.1, color: FOREGROUND };
const DESCRIPTION: CardTypography = { fontFamily: "Inter", fontWeight: 400, lineHeight: 1.35, color: MUTED };
const SECTION: CardTypography = { fontFamily: "Inter", fontWeight: 400, lineHeight: 1.2, color: MUTED };
const WORDMARK = { fontFamily: "Inter", fontWeight: 500, fontSize: 30, letterSpacing: "-0.02em", lineHeight: 1, color: FOREGROUND };

// Fonts sit beside this file, not in public/, so they never ship. Read from
// the project so `astro build --root <site>` finds them.
const font = (file: string) => new URL(`src/pages/og/_fonts/${file}`, root);
const renderer = await createCardRenderer({
  width: WIDTH,
  height: HEIGHT,
  fonts: [
    { name: "Inter", source: font("Inter-Regular.ttf"), weight: 400 },
    { name: "Inter", source: font("Inter-Medium.ttf"), weight: 500 },
  ],
  emoji: "strip",
});

type Style = Record<string, string | number>;
const el = (type: string, style: Style, children?: CardNode | (CardNode | undefined)[] | string): CardNode => ({
  type,
  props: { style, children },
});

const Logo = (height: number): CardNode => ({
  type: "svg",
  props: {
    width: Math.round((height * logo.width) / logo.height),
    height,
    viewBox: `0 0 ${logo.width} ${logo.height}`,
    children: [
      { type: "rect", props: { x: logo.card.x, y: logo.card.y, width: logo.card.width, height: logo.card.height, rx: logo.card.radius, fill: FOREGROUND } },
      ...logo.squares.map(([x, y], i) => ({
        type: "rect",
        props: { x, y, width: logo.size, height: logo.size, fill: i === logo.accentIndex ? logo.accent : BACKGROUND },
      })),
    ],
  },
});

async function card({ section, title, description, sizes }: { section?: string; title: string; description?: string; sizes: number[] }): Promise<CardNode> {
  const heading = await renderer.fit(title, { width: COLUMN, sizes, lines: 3, style: TITLE });
  const label = section ? await renderer.fit(section, { width: COLUMN, sizes: [26], lines: 1, style: SECTION }) : undefined;
  const about = description ? await renderer.fit(description, { width: COLUMN, sizes: [28, 26, 24], lines: 2, style: DESCRIPTION }) : undefined;
  return el("div", { width: WIDTH, height: HEIGHT, display: "flex", position: "relative", background: BACKGROUND }, [
    // The mark and the site name, so a shared link says what it's about.
    el("div", { position: "absolute", left: LEFT, top: 72, display: "flex", alignItems: "center", gap: 14 }, [
      Logo(30),
      el("div", { display: "flex", ...WORDMARK }, config.title),
    ]),
    el("div", { position: "absolute", left: LEFT, right: LEFT, top: 148, height: 0, borderTop: `1.5px solid ${BORDER}` }),
    // Hung from the hairline rather than set on the bottom margin: X crops
    // the card to 2:1 and covers its foot with the link's domain.
    el("div", { position: "absolute", left: LEFT, top: 204, display: "flex", flexDirection: "column" }, [
      label &&
        el("div", { display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }, [
          el("div", { width: 14, height: 14, background: logo.accent }),
          label.node,
        ]),
      heading.node,
      about && el("div", { display: "flex", marginTop: 28 }, about.node),
    ]),
  ]);
}

/** A page's card. */
export const renderPageCard = async (input: { section?: string; title: string; description?: string }) =>
  renderer.png(await card({ ...input, sizes: [64, 56, 50, 44] }));

/** The site's card: its description, or its title when it has none. */
export const renderSiteCard = async (input: { title: string }) =>
  renderer.png(await card({ ...input, sizes: [72, 64, 56, 50, 44] }));
