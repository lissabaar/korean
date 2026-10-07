"use client";

/**
 * Light / dark switch in the top navigation.
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

/** Apply and remember a theme. */
function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the switch still works until the page is reloaded.
  }
  listeners.forEach((listener) => listener());
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
