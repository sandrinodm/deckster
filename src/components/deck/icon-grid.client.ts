/** IconGrid: filters the names as you type, and copies a name when it is selected. */

function setUp(): void {
  for (const root of document.querySelectorAll<HTMLElement>("[data-dk-icons]:not([data-ready])")) {
    root.setAttribute("data-ready", "");
    const input = root.querySelector<HTMLInputElement>("[data-dk-icons-filter]");
    const count = root.querySelector<HTMLElement>("[data-dk-icons-count]");
    const empty = root.querySelector<HTMLElement>("[data-dk-icons-empty]");
    const items = [...root.querySelectorAll<HTMLButtonElement>(".dk-icon-name")];
    const total = items.length;

    input?.addEventListener("input", () => {
      // Names are kebab-case: "Arrow Right", "arrow_right" and "arrow-right" all find arrow-right.
      const query = input.value.trim().toLowerCase().replace(/[\s_]+/g, "-");
      let shown = 0;
      for (const item of items) {
        const match = !query || item.dataset.name!.includes(query);
        item.parentElement!.hidden = !match;
        if (match) shown++;
      }
      if (count) count.textContent = query ? `${shown} of ${total} icons` : `${total} icons`;
      if (empty) empty.hidden = shown > 0;
    });

    root.addEventListener("click", async (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(".dk-icon-name");
      if (!button) return;
      try {
        await navigator.clipboard.writeText(button.dataset.name!);
        if (count) count.textContent = `Copied ${button.dataset.name}`;
      } catch {
        if (count) count.textContent = `Copy failed; the name is ${button.dataset.name}`;
      }
    });
  }
}

// Astro's ClientRouter swaps pages without reloading this module.
document.addEventListener("astro:page-load", setUp);
setUp();
