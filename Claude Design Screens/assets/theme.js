/* aboard / theme.js
   - respects prefers-color-scheme by default
   - manual override persisted in localStorage('aboard.theme')
   - any element with [data-theme-toggle] becomes a cycle button:
       system → light → dark → system
   - run as early as possible to avoid flash; safe to run before DOMContentLoaded
*/
(function () {
  const KEY = "aboard.theme";
  const html = document.documentElement;

  function read() {
    try { return localStorage.getItem(KEY) || "system"; } catch (_) { return "system"; }
  }
  function write(v) {
    try { if (v === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch (_) {}
  }
  function effective(mode) {
    if (mode === "light" || mode === "dark") return mode;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function apply(mode) {
    if (mode === "light" || mode === "dark") html.setAttribute("data-theme", mode);
    else html.removeAttribute("data-theme");
    html.dataset.themeMode = mode;
    update_buttons(mode);
  }
  function update_buttons(mode) {
    const eff = effective(mode);
    document.querySelectorAll("[data-theme-toggle]").forEach(btn => {
      const label = btn.querySelector(".label");
      if (label) {
        if (mode === "system") label.textContent = "auto · " + eff;
        else label.textContent = mode;
      }
      btn.dataset.mode = mode;
      btn.setAttribute("aria-label", "theme: " + (mode === "system" ? ("auto, currently " + eff) : mode));
      btn.setAttribute("title", "theme: " + (mode === "system" ? ("auto · " + eff) : mode) + " (click to cycle)");
    });
  }

  // initial apply (synchronously, before paint)
  apply(read());

  // wire up listeners after DOM is ready
  function init() {
    document.querySelectorAll("[data-theme-toggle]").forEach(btn => {
      if (btn.dataset.themeWired === "1") return;
      btn.dataset.themeWired = "1";
      btn.addEventListener("click", () => {
        const cur = read();
        const next = cur === "system" ? "light" : cur === "light" ? "dark" : "system";
        write(next);
        apply(next);
        // notify listeners on the page (e.g. graph SVG) so they can re-tint
        document.dispatchEvent(new CustomEvent("aboard:themechange", { detail: { mode: next, effective: effective(next) } }));
      });
    });
    update_buttons(read());
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // reflect system pref changes when in 'system' mode
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (read() === "system") {
        update_buttons("system");
        document.dispatchEvent(new CustomEvent("aboard:themechange", { detail: { mode: "system", effective: effective("system") } }));
      }
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  // public API for any consumer
  window.AboardTheme = {
    get: read,
    set: (v) => { write(v); apply(v); document.dispatchEvent(new CustomEvent("aboard:themechange", { detail: { mode: v, effective: effective(v) } })); },
    effective: () => effective(read()),
  };
})();
