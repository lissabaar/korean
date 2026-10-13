"use client";

/**
 * Light / dark theme: the choice on the Settings page (ThemeChoice). It used
 * to be a sun/moon button in the top navigation (ThemeToggle, kept for
 * reuse); the nav needed the room for more pages.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys.
 *
 * The choice is stored in localStorage ("hangugo:theme") and applied as
 * data-theme on <html>; globals.css swaps the colour variables on it. An
 * inline script in app/layout.tsx applies the stored choice before the first
 * paint, so a dark page never flashes white. Without a choice the system
 * setting decides.
 */

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "hangugo:theme";

const listeners = new Set<() => void>();

/** The theme on screen: the user's choice, else the system's. */
function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Re-render when the theme changes here or the system setting changes. */
function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", listener);
  };
}

/** Apply and remember a theme; null = follow the system setting again. */
function setTheme(theme: Theme | null) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  try {
    if (theme) localStorage.setItem(STORAGE_KEY, theme);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the switch still works until the page is reloaded.
  }
  listeners.forEach((listener) => listener());
}

/** The stored choice: "light", "dark", or "system" when there is none. */
function storedChoice(): Theme | "system" {
  const chosen = document.documentElement.dataset.theme;
  return chosen === "light" || chosen === "dark" ? chosen : "system";
}

/**
 * Settings: Light / Dark / System (follow the phone or computer). Saved in
 * this browser only (localStorage), like the nav button was.
 */
export function ThemeChoice() {
  const choice = useSyncExternalStore(subscribe, storedChoice, () => "system" as const);
  return (
    <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
      {(
        [
          ["light", "Light", "bi-sun"],
          ["dark", "Dark", "bi-moon-stars"],
          ["system", "As on this device", "bi-circle-half"],
        ] as const
      ).map(([value, label, icon]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          onClick={() => setTheme(value === "system" ? null : value)}
          className={`rounded-md border px-3 py-2 text-sm ${
            choice === value ? "border-celadon-deep bg-celadon-deep text-paper" : "border-line"
          }`}
        >
          <i className={`bi ${icon} mr-1.5`} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

/** Sun/moon button that flips between light and dark. */
export default function ThemeToggle() {
  // On the server the theme is unknown; "light" until the browser says.
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="rounded-md px-2 py-1.5 text-sm text-muted hover:text-ink"
    >
      <i className={`bi ${theme === "dark" ? "bi-sun" : "bi-moon-stars"}`} aria-hidden />
    </button>
  );
}
