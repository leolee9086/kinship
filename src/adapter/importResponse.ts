/** 文件回包还需核对包摘要、身份与目标快照；不能只信可通过JSON Schema的预览。 */
import type { Result } from "../contracts/rpc";
import type { GraphPackage } from "../contracts/graphPackage";
import type { ImportPreview } from "../contracts/importPreview";
import { fail } from "../contracts/errors";
import { readGraphPackage } from "../format/graphPackage";
import { canonicalJSON } from "../format/json";
import { sha256 } from "../format/digest";

export async function verifyImportPreview(value: GraphPackage, preview: ImportPreview, context: { workspaceId: string; revision: number }) {
  const incoming = new Map(value.concepts.map(record => [record.concept.id, record]));
  const external = new Set(value.externals.map(item => item.id));
  const bad = () => fail("INTERNAL_ERROR", "导入预览与包内容或目标快照不一致");
  if (preview.workspaceId !== context.workspaceId || preview.revision !== context.revision
    || preview.packageId !== value.id || preview.packageSha256 !== await sha256(canonicalJSON(value))) bad();
  if (preview.concepts.length !== incoming.size || new Set(preview.concepts.map(item => item.id)).size !== incoming.size
    || preview.externals.length !== external.size || new Set(preview.externals.map(item => item.id)).size !== external.size) bad();
  for (const item of preview.concepts) {
    const record = incoming.get(item.id);
    if (!record || item.incomingSha256 !== record.sha256 || item.label !== record.concept.label) bad();
    if (item.action === "identical" && (!item.targetVersion || item.targetSha256 !== record!.sha256)) bad();
    if (item.action === "conflict" && (!item.targetVersion || !item.targetConcept || item.targetConcept.id !== item.id
      || await sha256(canonicalJSON(item.targetConcept)) !== item.targetSha256)) bad();
  }
  for (const item of preview.externals) if (!external.has(item.id)) bad();
}

export async function verifyImportFile(result: Result<"previewImportFile">, context: { workspaceId: string; revision: number }) {
  await verifyImportPreview(result.package, result.preview, context);
  try { await readGraphPackage(result.package); }
  catch { fail("INTERNAL_ERROR", "文件导入响应未通过身份、引用或摘要校验"); }
}
