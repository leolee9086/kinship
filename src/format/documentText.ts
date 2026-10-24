/** 文件封套与正文契约之间的转换；不装载视图编辑器，不把纯文本当作旧 CRDT 快照。 */
import type { DocumentBlock, DocumentBody } from "../contracts/document";
import { UUIDSchema } from "../contracts/primitives";
import { newId } from "../domain/concepts";
import { fileText, newFile, validateDocument } from "../domain/document";
import { readLayout } from "../sections/layout";
import { SectionStructureError } from "../sections/boundary";
import { parseSectionText, serializeSectionText } from "./sectionText";
import { parseSectionAttributes } from "./sectionAttributes";
export type TextIdentityMode = "preserve" | "copy";
const idKey = "file-id", kindKey = "file-kind", typeKey = "content-type", modeKey = "edit-mode";
const layoutType = "application/vnd.kinship.layout+json", uuid = new RegExp(UUIDSchema.pattern!);
export interface ParsedDocumentText { body: DocumentBody; fallback: number; collaborative: number }
export function importDocumentText(text: string, identity: TextIdentityMode): ParsedDocumentText {
  const sections = parseSectionText(text), declared = new Map<string, number>(), remap = new Map<string, string>();
  // 重复源身份即使选择复制也有歧义：布局引用无法确定指向哪个文件，必须报错。
  const identities = sections.map(section => {
    const source = section.attributes?.values[idKey];
    if (source !== undefined) {
      if (!uuid.test(source)) throw new SectionStructureError(section.line - 1, "file-id 必须是 UUID");
      const previous = declared.get(source);
      if (previous !== undefined) throw new SectionStructureError(section.line - 1, `file-id 与第 ${previous} 行重复`);
      declared.set(source, section.line - 1);
    }
    const id = source && identity === "preserve" ? source : newId();
    if (source) remap.set(source, id);
    return id;
  });
  let fallback = 0, collaborative = 0;
  const blocks: DocumentBlock[] = sections.map((section, index) => {
    const attributes = section.attributes?.values ?? {}, kind = attributes[kindKey], mode = attributes[modeKey], contentType = attributes[typeKey];
    const source = section.attributes ? { sourceIal: section.attributes.raw } : {};
    const base = { id: identities[index], version: 1, ...source };
    if (kind === "layout" && mode === "whole-file" && contentType === layoutType) {
      const layout = readLayout(section.text);
      const text = identity === "copy" ? JSON.stringify({ ...layout, members: layout.members.map(id => remap.get(id) ?? id) }) : section.text;
      return { ...base, kind, mode, contentType, text };
    }
    if (kind === "file" && mode === "crdt" && contentType === "text/plain") {
      collaborative++;
      return { ...newFile(contentType, section.text, mode), ...base };
    }
    if (section.attributes && !(kind === "file" && mode === "whole-file" && contentType === "text/x-kramdown")) fallback++;
    // 合法但不完整/不认识的声明由默认编辑器保存原文；原始 IAL 仍归文件持有。
    return { ...base, kind: "file", mode: "whole-file", contentType: "text/x-kramdown", text: section.text };
  });
  const contained = new Set(blocks.flatMap(block => block.kind === "layout" ? readLayout(block.text).members : []));
  const body = validateDocument({ format: "kinship.document", version: 2, roots: blocks.filter(block => !contained.has(block.id)).map(block => block.id), blocks });
  return { body, fallback, collaborative };
}
export function exportDocumentText(value: DocumentBody | undefined): string {
  if (!value) return "";
  const body = validateDocument(value), blocks = new Map(body.blocks.map(block => [block.id, block])), ordered: DocumentBlock[] = [];
  const visit = (id: string) => {
    const block = blocks.get(id)!; ordered.push(block);
    if (block.kind === "layout") readLayout(block.text).members.forEach(visit);
  };
  body.roots.forEach(visit);
  return serializeSectionText(ordered.map(block => {
    const tokens = block.sourceIal !== undefined
      ? parseSectionAttributes(block.sourceIal).tokens.filter(token => token.kind !== "attribute" || token.name !== idKey).map(token => token.raw)
      : [`${kindKey}=${JSON.stringify(block.kind)}`, `${typeKey}=${JSON.stringify(block.contentType)}`, `${modeKey}=${JSON.stringify(block.mode)}`];
    // 未识别声明保持原属性，不能在导出时补齐它而让下次导入意外启用专门适配器。
    const raw = `{: ${idKey}=${JSON.stringify(block.id)}${tokens.length ? " " + tokens.join(" ") : ""}}`;
    return { text: fileText(block), attributes: parseSectionAttributes(raw) };
  }));
}
