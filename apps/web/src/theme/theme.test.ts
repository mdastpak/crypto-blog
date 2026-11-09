import {
  applyTheme,
  parseTheme,
  themeCookie,
  themeFromCookieString,
  THEME_INIT_SCRIPT,
} from "./theme";

describe("theme", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
    document.cookie = "theme=; Path=/; Max-Age=0";
  });

  it("parses values, defaulting to system", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("blue")).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
  });

  it("reads the cookie among others", () => {
    expect(themeFromCookieString("a=1; theme=dark; b=2")).toBe("dark");
    expect(themeFromCookieString("mytheme=dark")).toBe("system");
  });

  it("clears the cookie for system", () => {
    expect(themeCookie("system")).toContain("Max-Age=0");
    expect(themeCookie("dark")).toMatch(/^theme=dark; Path=\/; Max-Age=\d+; SameSite=Lax$/);
  });

  it("applies data-theme only for an explicit choice", () => {
    const root = document.documentElement;
    applyTheme(root, "dark");
    expect(root.dataset.theme).toBe("dark");
    applyTheme(root, "system");
    expect(root.dataset.theme).toBeUndefined();
  });

  it("the init script applies the saved theme", () => {
    document.cookie = "theme=dark; Path=/";
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("the init script ignores an unknown value", () => {
    document.cookie = "theme=blue; Path=/";
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
