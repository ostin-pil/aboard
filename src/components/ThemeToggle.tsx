"use client";

import { useEffect, useState } from "react";

type Mode = "system" | "light" | "dark";

function getStored(): Mode {
  if (typeof window === "undefined") return "system";
  try {
    return (localStorage.getItem("aboard.theme") as Mode) || "system";
  } catch {
    return "system";
  }
}

function effective(mode: Mode): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

function apply(mode: Mode) {
  const html = document.documentElement;
  if (mode === "light" || mode === "dark") {
    html.setAttribute("data-theme", mode);
  } else {
    html.removeAttribute("data-theme");
  }
  if (mode === "system") {
    try {
      localStorage.removeItem("aboard.theme");
    } catch {}
  } else {
    try {
      localStorage.setItem("aboard.theme", mode);
    } catch {}
  }
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  const [eff, setEff] = useState<"light" | "dark">("light");

  useEffect(() => {
    // Client-only theme init after hydration: the stored mode and the system
    // preference are unknowable during SSR, so state starts at a neutral default
    // and is corrected here on mount. Setting state in this effect is intentional
    // — it is the one render that reconciles with the client environment.
    const m = getStored();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(m);
    setEff(effective(m));
    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        if (getStored() === "system") setEff(effective("system"));
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, []);

  const cycle = () => {
    const next: Mode = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    apply(next);
    setMode(next);
    setEff(effective(next));
  };

  const label = mode === "system" ? `auto · ${eff}` : mode;

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      aria-label={`theme: ${label}`}
      title={`theme: ${label} (click to cycle)`}
    >
      <span className="glyph" />
      <span className="label">{label}</span>
    </button>
  );
}
