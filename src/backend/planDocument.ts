/** 文件专用计划在现有命令事务内运行，不建立第二个正文保存入口。 */
import type { ConceptRecord, Operation } from "../contracts/commands";
import type { DocumentBody } from "../contracts/document";
import { fail } from "../contracts/errors";
import { checkVersion } from "./versions";
import { validateDocument, validateFileText } from "../domain/document";
import { readLayout } from "../sections/layout";
import { dispatchFileCommand } from "../sections/fileCommands";
import { decodeBinary, encodeBinary } from "../sections/binary";
import { crdtCodec } from "../sections/codecs";
import { sameField } from "../format/fieldDiff";
import type { ConceptChange } from "./planConcept";

export function planDocument(op: Operation, records: ReadonlyMap<string, ConceptRecord>): ConceptChange | null {
  if (op.type !== "document.replaceFile" && op.type !== "document.updateCrdt") return null;
  const old = records.get(op.id), body = old?.concept.body;
  if (!old || !body) fail("NOT_FOUND", "正文不存在", { id: op.id });
  const file = body.blocks.find(block => block.id === op.fileId);
  if (!file) fail("NOT_FOUND", "正文文件不存在", { id: op.fileId });
  const intent = op.type === "document.replaceFile" ? "replace" : "crdt-update";
  const decision = dispatchFileCommand({ mode: file.mode, intent, writable: true, busy: false, exists: true });
  if (decision !== intent) fail("DOMAIN_CONSTRAINT", "文件写入模式不匹配", { id: op.fileId });
  let replacement: typeof file;
  if (op.type === "document.replaceFile" && file.mode === "whole-file") {
    checkVersion(file.id, op.expectedVersion, file.version); validateFileText(op.text);
    if (file.kind === "layout") { readLayout(op.text);
      const checked = { ...body, blocks: body.blocks.map(block => block.id === file.id ? { ...file, text: op.text, version: file.version + 1 } : block) };
      validateDocument(checked);
    }
    replacement = { ...file, text: op.text, version: file.version + 1 };
  } else if (op.type === "document.updateCrdt" && file.mode === "crdt") {
    const candidate = crdtCodec(file.contentType).merge(decodeBinary(file.state), decodeBinary(op.update));
    validateFileText(candidate.text);
    replacement = { ...file, state: encodeBinary(candidate.state), version: file.version + 1 };
  } else fail("DOMAIN_CONSTRAINT", "不支持此文件操作");
  const next = { ...body, blocks: body.blocks.map(block => block.id === file.id ? replacement : block) };
  return { before: old, put: { concept: { ...old.concept, body: next }, version: old.version + 1 } };
}
/** 整正文 CAS 可排列/新增/移除文件，但不能绕过文件接口改写已存在文件。 */
export function guardStructureChange(before: DocumentBody | undefined, after: DocumentBody): void {
  const originals = new Map(before?.blocks.map(block => [block.id, block]) ?? []);
  for (const block of after.blocks) {
    const prior = originals.get(block.id);
    if (prior && !sameField(prior, block))
      fail("DOMAIN_CONSTRAINT", "已有文件的内容和模式只能通过文件接口提交", { id: block.id });
    if (!prior && block.version !== 1)
      fail("DOMAIN_CONSTRAINT", "新文件必须从版本 1 开始", { id: block.id });
    if (prior && prior.kind !== block.kind) fail("DOMAIN_CONSTRAINT", "不能改变已有区段的类型", { id: block.id });
  }
}
