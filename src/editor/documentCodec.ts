/** 这个边界是正文契约与编辑器节点的唯一转换处；不把编辑器节点名写进数据库。 */
import type { Node as EditorNode, Mark } from "prosemirror-model";
import type { DocumentBlock, DocumentBody, Inline } from "../contracts/document";
import { validateDocument } from "../domain/document";
import { editorSchema as schema } from "./schema";
const nodeNames = { paragraph: "paragraph", heading: "heading", quote: "blockquote", code: "code_block", divider: "horizontal_rule" } as const;
const markNames = { bold: "strong", italic: "em", strike: "strike", code: "code", link: "link" } as const;
export function toEditorDocument(body: DocumentBody): EditorNode {
  validateDocument(body); const blocks = new Map(body.blocks.map(block => [block.id, block]));
  const visit = (id: string): EditorNode => {
    const block = blocks.get(id)!;
    const content = block.kind === "quote" ? block.children.map(visit) : block.content.map(inline => inline.kind === "break"
      ? schema.nodes.hard_break.create() : schema.text(inline.text, inline.marks.map(mark => schema.marks[markNames[mark.kind]].create(
        mark.kind === "link" ? { href: mark.href, title: mark.title ?? null } : undefined))));
    return schema.nodes[nodeNames[block.kind]].create({ id, ...(block.level ? { level: block.level } : {}),
      ...(block.language !== undefined ? { language: block.language } : {}) }, content);
  };
  return schema.nodes.doc.create(null, body.roots.map(visit));
}
function fromMark(mark: Mark): Extract<Inline, { kind: "text" }>["marks"][number] {
  if (mark.type === schema.marks.link) return { kind: "link", href: mark.attrs.href,
    ...(mark.attrs.title ? { title: mark.attrs.title } : {}) };
  const kind = Object.entries(markNames).find(([, name]) => name === mark.type.name)?.[0];
  if (!kind || kind === "link") throw new Error("未实现的行内格式不能静默丢弃");
  return { kind: kind as "bold" | "italic" | "code" | "strike" };
}
export function fromEditorDocument(document: EditorNode): DocumentBody {
  const blocks: DocumentBlock[] = [];
  const visit = (node: EditorNode): string => {
    const kind = Object.entries(nodeNames).find(([, name]) => name === node.type.name)?.[0] as DocumentBlock["kind"] | undefined;
    if (!kind) throw new Error(`尚未实现的块类型：${node.type.name}`);
    const block: DocumentBlock = { id: node.attrs.id, kind, children: [], content: [],
      ...(kind === "heading" ? { level: node.attrs.level } : {}), ...(kind === "code" && node.attrs.language ? { language: node.attrs.language } : {}) };
    blocks.push(block);
    node.forEach(child => {
      if (kind === "quote") block.children.push(visit(child));
      else if (child.type === schema.nodes.hard_break) block.content.push({ kind: "break" });
      else if (child.isText) block.content.push({ kind: "text", text: child.text!, marks: child.marks.map(fromMark) });
      else throw new Error("正文包含尚未实现的行内节点");
    });
    return block.id;
  };
  const roots: string[] = []; document.forEach(node => roots.push(visit(node)));
  return validateDocument({ format: "kinship.document", version: 1, roots, blocks });
}
