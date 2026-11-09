/** Rich text in Payload's Lexical format, from plain paragraphs. */
export function paragraphs(texts: string[], direction: "rtl" | "ltr") {
  return {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction,
      children: texts.map((text) => ({
        type: "paragraph",
        format: "",
        indent: 0,
        version: 1,
        direction,
        textFormat: 0,
        children: [
          { type: "text", text, format: 0, detail: 0, mode: "normal", style: "", version: 1 },
        ],
      })),
    },
  } as const;
}
