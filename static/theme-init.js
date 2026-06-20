"use strict";
// Theme initialization (before page render to prevent flicker)
const THEME_REGEX = /theme=(\w+)/;
(() => {
  const c = document.cookie.match(THEME_REGEX)?.[1];
  const h = document.documentElement;

  try {
    const systemPrefersLight = matchMedia("(prefers-color-scheme: light)").matches;
    let isDark = true;

    if (c === "dark") {
      isDark = true;
    } else if (c === "light") {
      isDark = false;
    } else if (c === "system" || !c) {
      isDark = !systemPrefersLight;
    }

    if (isDark) {
      h.classList.add("dark");
      h.classList.remove("light");
    } else {
      h.classList.add("light");
      h.classList.remove("dark");
    }
  } catch (e) {
    console.error("[SSR Script] Error:", e);
  }
})();
