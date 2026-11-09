import { localizedPath, splitLocale } from "./paths";

describe("paths", () => {
  it("splits the locale prefix", () => {
    expect(splitLocale("/fa/coins/btc")).toEqual({ locale: "fa", rest: "/coins/btc" });
    expect(splitLocale("/en")).toEqual({ locale: "en", rest: "" });
    expect(splitLocale("/coins")).toEqual({ rest: "/coins" });
    expect(splitLocale("/")).toEqual({ rest: "" });
  });

  it("switches the locale of a path", () => {
    expect(localizedPath("/fa/coins/btc", "en")).toBe("/en/coins/btc");
    expect(localizedPath("/en", "fa")).toBe("/fa");
  });
});
