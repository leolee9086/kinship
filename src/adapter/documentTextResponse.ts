/** 预览是“追加”，响应不得借此移除或改写原正文文件。 */
import type { DocumentTextPreview } from "../contracts/documentText";
import type { Request, Result } from "../contracts/rpc";
import { fail } from "../contracts/errors";
import { sameField } from "../format/fieldDiff";
export function verifyDocumentTextPreview(id: string, preview: DocumentTextPreview): void {
  if (preview.target.concept.id !== id || Boolean(preview.collisions.length) !== (preview.candidate === null))
    fail("INTERNAL_ERROR", "正文文本预览目标或冲突状态不一致");
  if (!preview.candidate) return;
  const before = preview.target.concept.body, next = preview.candidate, originals = before?.blocks ?? [];
  const blocks = new Map(next.blocks.map(block => [block.id, block]));
  if (next.blocks.length !== originals.length + preview.added || blocks.size !== next.blocks.length
    || originals.some(block => !sameField(block, blocks.get(block.id)))
    || before?.roots.some((root, index) => next.roots[index] !== root))
    fail("INTERNAL_ERROR", "正文文本预览不能改写原有文件或顺序");
}
export function verifyDocumentTextFile(params: Request<"previewDocumentTextFile">["params"], result: Result<"previewDocumentTextFile">): void {
  if (result.source.name !== params.name || result.source.size !== params.size || result.source.sha256 !== params.sha256)
    fail("INTERNAL_ERROR", "正文文件预览与上传的文件不一致");
  verifyDocumentTextPreview(params.id, result.preview);
}
