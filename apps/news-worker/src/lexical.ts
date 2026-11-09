/**
 * Rich text in Payload's Lexical format, the shape the CMS stores and the
 * blog renders. Only the nodes drafts need.
 */
export type Direction = "rtl" | "ltr";

export interface LexicalNode {
  type: string;
  version: number;
  [key: string]: unknown;
}

export interface LexicalRoot {
  root: LexicalNode & { type: "root"; children: LexicalNode[] };
}

export const directionOf = (language: string): Direction => (language === "fa" ? "rtl" : "ltr");

export function text(value: string, bold = false): LexicalNode {
  return {
    type: "text",
    text: value,
    format: bold ? 1 : 0,
    detail: 0,
    mode: "normal",
    style: "",
    version: 1,
  };
}

const block = (type: string, direction: Direction, children: LexicalNode[]) => ({
  type,
  format: "",
  indent: 0,
  version: 1,
  direction,
  children,
});

export function paragraph(direction: Direction, children: LexicalNode[]): LexicalNode {
  return { ...block("paragraph", direction, children), textFormat: 0 };
}

export function heading(direction: Direction, tag: "h2" | "h3", value: string): LexicalNode {
  return { ...block("heading", direction, [text(value)]), tag };
}

/** An external link; the blog adds rel="nofollow noopener" to it. */
export function link(direction: Direction, url: string, value: string): LexicalNode {
  return {
    ...block("link", direction, [text(value)]),
    version: 3,
    fields: { url, newTab: true, linkType: "custom" },
  };
}

export function bulletList(direction: Direction, items: LexicalNode[][]): LexicalNode {
  return {
    ...block(
      "list",
      direction,
      items.map((children, i) => ({ ...block("listitem", direction, children), value: i + 1 })),
    ),
    listType: "bullet",
    start: 1,
    tag: "ul",
  };
}

export function root(direction: Direction, children: LexicalNode[]): LexicalRoot {
  return { root: { ...block("root", direction, children), type: "root" } };
}

/** The plain text of a tree, for tests and length checks. */
export function plainText(node: LexicalNode | LexicalRoot): string {
  const n = "root" in node && !("type" in node) ? node.root : (node as LexicalNode);
  if (n.type === "text") return n.text as string;
  const children = (n.children as LexicalNode[] | undefined) ?? [];
  const sep = n.type === "root" || n.type === "list" ? "\n" : "";
  return children.map(plainText).join(sep);
}
