/** 明确处理每个冲突后编译原子操作；来源版本不充当目标版本，省略对象永不删除。 */
import type { Operation } from "../contracts/commands";
import type { ImportPreview } from "../contracts/importPreview";
import type { Request } from "../contracts/rpc";
import { fail } from "../contracts/errors";
import { conceptCommands } from "./conceptCommands";
import type { ImportTarget } from "./importPreview";

export function importCommands(params: Request<"importGraph">["params"], preview: ImportPreview, target: ImportTarget): Operation[] {
  if (params.expectedRevision !== preview.revision) fail("VERSION_CONFLICT", "目标库在预览后发生变化，请重新预览");
  if (params.packageSha256 !== preview.packageSha256) fail("VERSION_CONFLICT", "图谱包在预览后发生变化，请重新预览");
  const decisions = new Map(params.conflicts.map(item => [item.id, item.resolution]));
  if (decisions.size !== params.conflicts.length) fail("INVALID_REQUEST", "冲突选择的 UUID 重复");
  const conflicts = preview.concepts.filter(item => item.action === "conflict");
  if (decisions.size !== conflicts.length || conflicts.some(item => !decisions.has(item.id)))
    fail("REFERENCE_CONFLICT", "请逐项选择保留目标内容或使用包内内容");
  const changed = preview.externals.filter(item => item.status === "changed"), accepted = new Set(params.acceptChangedExternals);
  if (changed.length !== accepted.size || changed.some(item => !accepted.has(item.id)))
    fail("REFERENCE_CONFLICT", "范围外对象内容已变化，需要明确接受当前目标对象");
  if (preview.concepts.some(item => item.action === "blocked") || preview.externals.some(item => item.status === "blocked" || item.status === "missing"))
    fail("REFERENCE_CONFLICT", "存在身份冲突或缺失外部引用，不能导入");
  const byId = new Map(target.concepts.map(record => [record.concept.id, record]));
  const incoming = new Map(params.package.concepts.map(record => [record.concept.id, record.concept]));
  const operations: Operation[] = [];
  for (const item of preview.concepts) {
    if (item.action === "identical" || decisions.get(item.id) === "keep-target") continue;
    const current = byId.get(item.id);
    operations.push(...conceptCommands(incoming.get(item.id)!, current?.concept, current?.version ?? null));
  }
  if (operations.length > 128) fail("PAYLOAD_TOO_LARGE", "导入超过单次128操作预算，请缩小选择；不会分批截断事务");
  return operations;
}
