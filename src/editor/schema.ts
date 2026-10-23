/** ProseMirror 只负责交互；块 UUID 和正文语义由独立文档契约承载。 */
import { Schema, type DOMOutputSpec, type NodeSpec } from "prosemirror-model";
const id = { default: null as string | null };
const blockDOM = (tag: string, blockId: string | null): DOMOutputSpec => [tag, { "data-block-id": blockId }, 0];
export const editorSchema = new Schema({ nodes: {
  doc: { content: "block+" },
  paragraph: { group: "block", content: "inline*", attrs: { id }, parseDOM: [{ tag: "p" }],
    toDOM: node => blockDOM("p", node.attrs.id) },
  heading: { group: "block", content: "inline*", defining: true, attrs: { id, level: { default: 2 } },
    parseDOM: [1, 2, 3, 4, 5, 6].map(level => ({ tag: `h${level}`, attrs: { level } })),
    toDOM: node => blockDOM(`h${node.attrs.level}`, node.attrs.id) },
  blockquote: { group: "block", content: "block+", defining: true, attrs: { id }, parseDOM: [{ tag: "blockquote" }],
    toDOM: node => blockDOM("blockquote", node.attrs.id) },
  code_block: { group: "block", content: "text*", marks: "", code: true, defining: true,
    attrs: { id, language: { default: "" } }, parseDOM: [{ tag: "pre", preserveWhitespace: "full" }],
    toDOM: node => ["pre", { "data-block-id": node.attrs.id }, ["code", 0]] as DOMOutputSpec },
  horizontal_rule: { group: "block", attrs: { id }, parseDOM: [{ tag: "hr" }],
    toDOM: node => ["hr", { "data-block-id": node.attrs.id }] as DOMOutputSpec },
  text: { group: "inline" }, hard_break: { inline: true, group: "inline", selectable: false,
    parseDOM: [{ tag: "br" }], toDOM: () => ["br"] },
} satisfies Record<string, NodeSpec>, marks: {
  strong: { parseDOM: [{ tag: "strong" }, { tag: "b" }], toDOM: () => ["strong", 0] },
  em: { parseDOM: [{ tag: "em" }, { tag: "i" }], toDOM: () => ["em", 0] },
  strike: { parseDOM: [{ tag: "s" }, { tag: "del" }], toDOM: () => ["s", 0] },
  code: { code: true, excludes: "_", parseDOM: [{ tag: "code" }], toDOM: () => ["code", 0] },
  link: { attrs: { href: {}, title: { default: null } }, inclusive: false,
    parseDOM: [{ tag: "a[href]", getAttrs: element => {
      const href = element.getAttribute("href") ?? "";
      return /^(https?:\/\/|mailto:)/.test(href) ? { href, title: element.getAttribute("title") } : false;
    } }], toDOM: mark => ["a", { ...mark.attrs, rel: "noopener noreferrer" }, 0] },
} });
