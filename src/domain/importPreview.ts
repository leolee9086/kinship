/** 预览是纯读取：来源版本只作来源，目标版本才可作为后续提交前置条件。 */
import type { ConceptRecord } from "../contracts/commands";
import type { GraphPackage } from "../contracts/graphPackage";
import { MAX_IMPORT_FILE_BYTES, type ImportPreview } from "../contracts/importPreview";
import { fail } from "../contracts/errors";
import { canonicalJSON } from "../format/json";
import { sha256 } from "../format/digest";

export type ReservedIdentity = { id: string; version: number; deleted: boolean }
  & ({ kind: "concept" | "media" } | { kind: "block"; ownerId: string });
export interface ImportTarget { concepts: ConceptRecord[]; identities: ReservedIdentity[] }
export async function previewImport(value: GraphPackage, target: ImportTarget,
  context: { workspaceId: string; revision: number }): Promise<ImportPreview> {
  const byId = new Map(target.concepts.map(record => [record.concept.id, record]));
  const reserved = new Map(target.identities.map(identity => [identity.id, identity]));
  const slotOwners = new Map(target.concepts.flatMap(record => (record.concept.participants ?? []).map(slot => [slot.id, record.concept.id] as const)));
  const concepts: ImportPreview["concepts"] = []; let comparisonBytes = 0;
  for (const record of value.concepts) {
    const concept = record.concept, identity = reserved.get(concept.id), current = byId.get(concept.id);
    const owner = slotOwners.get(concept.id);
    const collision = concept.participants?.some(slot => reserved.has(slot.id) || byId.has(slot.id)
      || (slotOwners.has(slot.id) && slotOwners.get(slot.id) !== concept.id))
      || concept.body?.blocks.some(block => {
        const claimed = reserved.get(block.id);
        return claimed ? claimed.kind !== "block" || claimed.ownerId !== concept.id : slotOwners.has(block.id);
      });
    const base = { id: concept.id, label: concept.label, incomingSha256: record.sha256 };
    const shapeChanged = current && Boolean(current.concept.participants) !== Boolean(concept.participants);
    if (identity?.deleted || (identity && identity.kind !== "concept") || owner || collision || shapeChanged) {
      concepts.push({ ...base, action: "blocked", reason: identity?.deleted ? "身份已删除，需显式恢复"
        : shapeChanged ? "普通概念与关系的形态转换需要显式操作" : "UUID已由其他资源或参与槽使用" }); continue;
    }
    if (!current) { concepts.push({ ...base, action: "create" }); continue; }
    const targetText = canonicalJSON(current.concept), targetSha256 = await sha256(targetText), identical = targetSha256 === record.sha256;
    if (!identical) {
      comparisonBytes += new TextEncoder().encode(targetText).byteLength;
      if (comparisonBytes > MAX_IMPORT_FILE_BYTES) fail("PAYLOAD_TOO_LARGE", "目标冲突内容超过1 MiB预览预算，请缩小导入范围");
    }
    concepts.push({ ...base, targetVersion: current.version, targetSha256,
      action: identical ? "identical" : "conflict", ...(identical ? {} : { targetConcept: current.concept }) });
  }
  const externals: ImportPreview["externals"] = [];
  for (const reference of value.externals) {
    const current = byId.get(reference.id), identity = reserved.get(reference.id);
    const base = { id: reference.id, label: reference.label };
    if (identity?.deleted || (identity && identity.kind !== "concept") || slotOwners.has(reference.id)) {
      externals.push({ ...base, status: "blocked", reason: identity?.deleted ? "外部身份已删除" : "外部UUID属于其他资源" });
    } else if (!current) externals.push({ ...base, status: "missing" });
    else externals.push({ ...base, targetVersion: current.version,
      status: await sha256(canonicalJSON(current.concept)) === reference.sha256 ? "matched" : "changed" });
  }
  return { packageId: value.id, packageSha256: await sha256(canonicalJSON(value)), ...context, concepts, externals };
}
