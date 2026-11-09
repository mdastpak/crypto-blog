"use client";

import { useSyncExternalStore } from "react";
import { applyTheme, themeCookie, themeFromCookieString, THEMES, type Theme } from "@/theme/theme";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setTheme(theme: Theme) {
  document.cookie = themeCookie(theme);
  applyTheme(document.documentElement, theme);
  listeners.forEach((listener) => listener());
}

export interface ThemeSwitcherProps {
  label: string;
  names: Record<Theme, string>;
}

export function ThemeSwitcher({ label, names }: ThemeSwitcherProps) {
  const theme = useSyncExternalStore(
    subscribe,
    () => themeFromCookieString(document.cookie),
    () => "system" as Theme,
  );
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={theme}
        onChange={(event) => setTheme(event.target.value as Theme)}
        className="rounded-lg border border-border bg-background px-2 py-1"
      >
        {THEMES.map((value) => (
          <option key={value} value={value}>
            {names[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
