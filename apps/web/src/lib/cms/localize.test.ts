import { fallbackOrder, isEmptyRichText, pick, shown, text } from "./localize";

const body = (words: string) => ({
  root: { children: [{ type: "paragraph", children: [{ type: "text", text: words }] }] },
});
const empty = { root: { children: [{ type: "paragraph", children: [] }] } };

describe("fallback rules", () => {
  it("tries the page's locale, then the other served ones", () => {
    expect(fallbackOrder("en", ["fa", "en"])).toEqual(["en", "fa"]);
    expect(fallbackOrder("fa", ["fa", "en"])).toEqual(["fa", "en"]);
    // Only served locales: an English-only release never shows Persian.
    expect(fallbackOrder("en", ["en"])).toEqual(["en"]);
  });

  it("picks the first translation present, skipping null and blank values", () => {
    expect(pick({ fa: "سلام", en: "Hello" }, ["en", "fa"])).toEqual({
      value: "Hello",
      locale: "en",
    });
    expect(pick({ fa: "سلام", en: null }, ["en", "fa"])).toEqual({ value: "سلام", locale: "fa" });
    expect(pick({ fa: "سلام", en: "  " }, ["en", "fa"])).toEqual({ value: "سلام", locale: "fa" });
    expect(pick({ fa: "سلام" }, ["en"])).toBeUndefined();
    expect(text({}, ["en", "fa"])).toBeUndefined();
  });

  it("treats Lexical's empty paragraph as untranslated", () => {
    expect(isEmptyRichText(empty)).toBe(true);
    expect(isEmptyRichText(body("x"))).toBe(false);
    expect(pick({ en: empty, fa: body("متن") }, ["en", "fa"])?.locale).toBe("fa");
  });
});

describe("how a document is shown", () => {
  it("shows a translated document in the page's locale", () => {
    expect(shown({ fa: "عنوان", en: "Title" }, "en", ["fa", "en"])).toEqual({
      docLocale: "en",
      docOrder: ["en", "fa"],
      untranslated: false,
      translations: ["fa", "en"],
    });
  });

  it("falls back to a served locale for a document not translated", () => {
    const view = shown({ fa: "عنوان", en: null }, "en", ["fa", "en"]);
    expect(view).toMatchObject({ docLocale: "fa", untranslated: true, translations: ["fa"] });
    // Its fields then fall back from the document's own locale.
    expect(view?.docOrder).toEqual(["fa", "en"]);
  });

  it("shows nothing when no served locale has the document", () => {
    expect(shown({ fa: "عنوان" }, "en", ["en"])).toBeUndefined();
  });
});
