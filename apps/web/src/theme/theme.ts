export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** The cookie that keeps the visitor's theme; `system` is its absence. */
export const THEME_COOKIE = "theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

export function parseTheme(value: string | null | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/** Reads the theme from a `document.cookie` string. */
export function themeFromCookieString(cookies: string): Theme {
  const match = new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`).exec(cookies);
  return parseTheme(match?.[1]);
}

/** The `Set-Cookie`-style string that saves a theme in the browser. */
export function themeCookie(theme: Theme): string {
  return theme === "system"
    ? `${THEME_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
    : `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
}

/**
 * Applies a theme to the document: `data-theme` for an explicit choice, none
 * for `system`, where CSS follows `prefers-color-scheme`.
 */
export function applyTheme(root: HTMLElement, theme: Theme): void {
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/**
 * Runs in <head> before the first paint, so the page never flashes in the
 * wrong theme. Pages stay static: the server does not read the cookie.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=(light|dark)(?:;|$)/);if(m)document.documentElement.dataset.theme=m[1];}catch(e){}})();`;
