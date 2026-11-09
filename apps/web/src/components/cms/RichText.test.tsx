import { renderToStaticMarkup } from "react-dom/server";
import { RichText, safeHref } from "./RichText";

const doc = (...children: unknown[]) => ({ root: { children } });
const p = (...children: unknown[]) => ({ type: "paragraph", children });
const txt = (text: string, format = 0) => ({ type: "text", text, format });

function html(value: ReturnType<typeof doc>) {
  return renderToStaticMarkup(<RichText value={value} locale="en" order={["en", "fa"]} />);
}

describe("rich text", () => {
  it("renders headings below the page title, lists, quotes, and formats", () => {
    const out = html(
      doc(
        { type: "heading", tag: "h1", children: [txt("Title")] },
        { type: "heading", tag: "h3", children: [txt("Sub")] },
        p(txt("bold", 1), txt(" "), txt("code", 16)),
        {
          type: "list",
          listType: "number",
          children: [{ type: "listitem", children: [txt("one")] }],
        },
        { type: "quote", children: [txt("said")] },
      ),
    );
    expect(out).toContain("<h2><span>Title</span></h2>");
    expect(out).toContain("<h3><span>Sub</span></h3>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<code>code</code>");
    expect(out).toContain("<ol><li><span>one</span></li></ol>");
    expect(out).toContain("<blockquote>");
  });

  it("keeps only safe links, and marks external ones", () => {
    const link = (url: string) => ({ type: "link", fields: { url }, children: [txt("x")] });
    const out = html(
      doc(p(link("https://example.com"), link("javascript:alert(1)"), link("/en/coins"))),
    );
    expect(out).toContain('<a href="https://example.com" rel="noopener noreferrer nofollow">');
    expect(out).not.toContain("javascript:");
    expect(out).toContain('<a href="/en/coins">');
    expect(safeHref("//evil.example")).toBeUndefined();
    expect(safeHref("mailto:a@b.c")).toBe("mailto:a@b.c");
  });

  it("links internal documents to their page", () => {
    const out = html(
      doc(
        p({
          type: "link",
          fields: { linkType: "internal", doc: { relationTo: "articles", value: { slug: "a" } } },
          children: [txt("read")],
        }),
      ),
    );
    expect(out).toContain('<a href="/en/blog/a">');
  });

  it("renders uploads as images from the media route, and never raw HTML", () => {
    const out = html(
      doc(
        {
          type: "upload",
          value: { id: 1, filename: "a.png", width: 10, height: 5, alt: { en: "Chart" } },
        },
        { type: "html", html: "<script>alert(1)</script>" },
        p(txt("<b>not bold</b>")),
      ),
    );
    expect(out).toContain('src="/cms-media/a.png"');
    expect(out).toContain('alt="Chart"');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;b&gt;not bold&lt;/b&gt;");
  });
});
