/*
 * The stylesheets of the kit that belong to no single layout: the component styles (apps, code,
 * icons, media, links, motion, placed elements) and the page chrome. A module that registers the
 * kit (`runtime.ts`, or the deck plugin's generated `virtual:deck/kit-runtime`) imports this file
 * after the layouts, so these rules come after the layouts' own in the stylesheet, which rules of
 * equal weight in the same layer rely on.
 */
import '#apps/apps.css';
import '#code/code.css';
import '#icons/icon.css';
import '#media/media.css';
import '#links/links.css';
import '#chrome/chrome.css';
import '#motion/motion.css';
import '#place/place.css';
