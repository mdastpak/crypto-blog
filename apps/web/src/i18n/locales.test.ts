import { intlTag, isAvailableLocale, textDirection } from "./locales";

describe("textDirection", () => {
  it.each([
    ["fa", "rtl"],
    ["ar", "rtl"],
    ["he", "rtl"],
    ["ur", "rtl"],
    ["ps", "rtl"],
    ["ckb", "rtl"],
    ["az-Arab", "rtl"],
    ["en", "ltr"],
    ["az", "ltr"],
    ["tr", "ltr"],
    ["not a tag!", "ltr"],
  ])("%s is %s", (tag, dir) => {
    expect(textDirection(tag)).toBe(dir);
  });
});

it("knows the locales of this build", () => {
  expect(isAvailableLocale("fa")).toBe(true);
  expect(isAvailableLocale("de")).toBe(false);
  expect(isAvailableLocale(undefined)).toBe(false);
});

it("formats Persian with Persian digits", () => {
  expect(intlTag("fa")).toBe("fa-IR");
  expect(intlTag("en")).toBe("en");
});
