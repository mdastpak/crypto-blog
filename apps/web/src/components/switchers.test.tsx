import { fireEvent, render, screen } from "@testing-library/react";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeSwitcher } from "./ThemeSwitcher";

vi.mock("next/navigation", () => ({ usePathname: () => "/fa/coins/btc" }));

afterEach(() => {
  document.cookie = "theme=; Path=/; Max-Age=0";
  document.cookie = "locale=; Path=/; Max-Age=0";
  delete document.documentElement.dataset.theme;
});

describe("LocaleSwitcher", () => {
  it("links to the same page in each locale and saves the choice", () => {
    render(<LocaleSwitcher current="fa" locales={["fa", "en"]} label="Language" />);
    const en = screen.getByRole("link", { name: "English" });
    expect(en).toHaveAttribute("href", "/en/coins/btc");
    expect(en).toHaveAttribute("hreflang", "en");
    expect(screen.getByRole("link", { name: "فارسی" })).toHaveAttribute("aria-current", "true");
    fireEvent.click(en);
    expect(document.cookie).toContain("locale=en");
  });
});

describe("ThemeSwitcher", () => {
  const names = { light: "Light", dark: "Dark", system: "System" };

  it("starts from the saved theme and saves a new one", () => {
    document.cookie = "theme=light; Path=/";
    render(<ThemeSwitcher label="Theme" names={names} />);
    const select = screen.getByRole("combobox", { name: "Theme" });
    expect(select).toHaveValue("light");
    fireEvent.change(select, { target: { value: "dark" } });
    expect(select).toHaveValue("dark");
    expect(document.cookie).toContain("theme=dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("system clears the saved theme", () => {
    document.cookie = "theme=dark; Path=/";
    render(<ThemeSwitcher label="Theme" names={names} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "system" } });
    expect(document.cookie).not.toContain("theme=");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
