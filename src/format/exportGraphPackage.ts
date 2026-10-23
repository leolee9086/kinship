/** 从后端提供的一致快照构造交换包；摘要在读事务结束后计算，不依赖 DOM 或站点存储。 */
import type { ConceptRecord } from "../contracts/commands";
import { MAX_PACKAGE_BYTES, type GraphPackage } from "../contracts/graphPackage";
import { newId } from "../domain/concepts";
import { ConceptIndex } from "../domain/conceptIndex";
import { selectPackageRecords, type PackageSelection } from "../domain/packageSelection";
import { assert } from "../domain/inputValidation";
import { canonicalJSON } from "./json";
import { sha256 } from "./digest";
import { readGraphPackage } from "./graphPackage";

export async function exportGraphPackage(records: readonly ConceptRecord[], source: GraphPackage["source"],
  selection: PackageSelection, maxBytes = 1024 * 1024): Promise<GraphPackage> {
  assert(Number.isSafeInteger(maxBytes) && maxBytes >= 1 && maxBytes <= MAX_PACKAGE_BYTES, "图谱包字节预算无效");
  const chosen = selectPackageRecords(records, selection);
  const index = new ConceptIndex(records.map(record => record.concept));
  let payloadBytes = 0;
  const encoder = new TextEncoder();
  const encoded = chosen.records.map(record => {
    const text = canonicalJSON(record.concept); payloadBytes += encoder.encode(text).byteLength;
    assert(payloadBytes <= maxBytes, "图谱包超过字节预算，请缩小选择"); return text;
  });
  const concepts = await Promise.all(chosen.records.map(async (record, i) => ({ ...record, sha256: await sha256(encoded[i]) })));
  const externals: GraphPackage["externals"] = [];
  // 外部对象可能有很长的说明，逐个计算摘要，避免并行复制所有范围外内容。
  for (const record of chosen.externals) externals.push({ id: record.concept.id,
    label: record.concept.label, version: record.version, sha256: await sha256(canonicalJSON(record.concept)),
    kind: index.isType(record.concept) ? "type" : index.isRole(record.concept) ? "role"
      : record.concept.participants ? "relation" : "concept",
  });
  const value: GraphPackage = { format: "kinship.graph-package", spec: 1, id: newId(), source,
    mode: selection.mode, entrypoints: [...selection.entrypoints], selected: chosen.selected, dependencies: chosen.dependencies,
    concepts, externals, coverage: { concepts: "complete-records", documents: "omitted", media: "omitted", presentation: "omitted", history: "omitted" },
  };
  assert(new TextEncoder().encode(canonicalJSON(value)).byteLength <= maxBytes, "图谱包超过字节预算，请缩小选择");
  return readGraphPackage(value);
}
