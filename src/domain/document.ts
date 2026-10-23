/** 主体只校验文件边界、布局和身份；段落、列表、行内语法归各自适配器。 */
import type { DocumentBody, DocumentBlock, FileBlock } from "../contracts/document";
import { DocumentBodySchema } from "../contracts/document";
import { parse } from "../contracts/validate";
import { assert } from "./inputValidation";
import { newId } from "./concepts";
import { validateSectionText } from "../sections/boundary";
import { crdtCodec } from "../sections/codecs";
import { readLayout } from "../sections/layout";
import { decodeBinary, encodeBinary } from "../sections/binary";
export function newFile(contentType = "text/x-kramdown", text = "", mode: "whole-file" | "crdt" = "whole-file"): FileBlock {
  const base = { id: newId(), kind: "file" as const, version: 1, contentType };
  return mode === "whole-file" ? { ...base, mode, text } : { ...base, mode, state: encodeBinary(crdtCodec(contentType).initialize(text)) };
}
export function emptyDocument(): DocumentBody {
  const file = newFile(); return { format: "kinship.document", version: 2, roots: [file.id], blocks: [file] };
}
export function fileText(file: DocumentBlock): string {
  return file.mode === "whole-file" ? file.text : crdtCodec(file.contentType).text(decodeBinary(file.state));
}
export function validateFileText(text: string): void {
  try { validateSectionText(text); }
  catch (cause) { assert(false, cause instanceof Error ? cause.message : String(cause)); }
}
export function validateDocument(value: unknown): DocumentBody {
  const body = parse(DocumentBodySchema, value, "DOMAIN_CONSTRAINT"), blocks = new Map(body.blocks.map(block => [block.id, block]));
  assert(blocks.size === body.blocks.length, "正文区段 UUID 重复");
  const visited = new Set<string>(), stack = body.roots.map(id => ({ id, depth: 1 }));
  while (stack.length) {
    const { id, depth } = stack.pop()!, block = blocks.get(id);
    assert(block, "正文区段不存在"); assert(depth <= 64, "布局嵌套超过 64 层");
    assert(!visited.has(id), "正文区段不能有多个父级或成环"); visited.add(id);
    validateFileText(fileText(block));
    if (block.kind === "layout") for (const child of readLayout(block.text).members) stack.push({ id: child, depth: depth + 1 });
  }
  assert(visited.size === blocks.size, "正文包含未排列的游离区段"); return body;
}
