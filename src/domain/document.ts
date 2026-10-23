/** 正文树完整性与通用构造独立于编辑器；导入、RPC 和当前图使用同一条规则。 */
import type { DocumentBody } from "../contracts/document";
import { DocumentBodySchema } from "../contracts/document";
import { parse } from "../contracts/validate";
import { assert } from "./inputValidation";
import { newId } from "./concepts";
export function emptyDocument(): DocumentBody {
  const id = newId(); return { format: "kinship.document", version: 1, roots: [id],
    blocks: [{ id, kind: "paragraph", children: [], content: [] }] };
}
export function validateDocument(value: unknown): DocumentBody {
  const body = parse(DocumentBodySchema, value, "DOMAIN_CONSTRAINT"), blocks = new Map(body.blocks.map(block => [block.id, block]));
  assert(blocks.size === body.blocks.length, "正文块 UUID 重复");
  const visited = new Set<string>(), stack = body.roots.map(id => ({ id, depth: 1 }));
  while (stack.length) {
    const { id, depth } = stack.pop()!, block = blocks.get(id);
    assert(block, "正文子块不存在"); assert(depth <= 64, "正文嵌套超过 64 层");
    assert(!visited.has(id), "正文块不能有多个父级或成环"); visited.add(id);
    assert(block.kind === "heading" ? block.level !== undefined : block.level === undefined, "标题级别只能属于标题块");
    assert(block.kind === "code" || block.language === undefined, "语言只能属于代码块");
    if (block.kind === "quote") assert(!block.content.length && block.children.length > 0, "引用块需要子块，不直接保存行内文本");
    else assert(!block.children.length, "当前文本块不能包含子块");
    if (block.kind === "divider") assert(!block.content.length, "分隔线不能包含文本");
    for (const inline of block.content) if (inline.kind === "text") {
      assert(new Set(inline.marks.map(mark => mark.kind)).size === inline.marks.length, "相同行内格式不能重复");
      if (block.kind === "code") assert(!inline.marks.length, "代码内容不能包含富文本格式");
    } else assert(block.kind !== "code", "代码换行直接保存在文本中");
    for (const child of block.children) stack.push({ id: child, depth: depth + 1 });
  }
  assert(visited.size === blocks.size, "正文包含不属于树的游离块"); return body;
}
