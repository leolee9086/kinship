/** GraphPackage 文件边界：严格结构、身份分区、引用与逐记录字节摘要校验。 */
import { GraphPackageSchema, MAX_PACKAGE_BYTES, type GraphPackage } from "../contracts/graphPackage";
import { parse } from "../contracts/validate";
import { assert } from "../domain/inputValidation";
import { validateConcepts } from "../domain/validation";
import { conceptDefinitionIds } from "../domain/packageSelection";
import { canonicalJSON } from "./json";
import { sha256 } from "./digest";

export async function readGraphPackage(source: unknown): Promise<GraphPackage> {
  const text = typeof source === "string" ? source : canonicalJSON(source);
  assert(new TextEncoder().encode(text).byteLength <= MAX_PACKAGE_BYTES, "图谱包超过16MiB大小上限");
  const value = parse(GraphPackageSchema, JSON.parse(text), "DOMAIN_CONSTRAINT");
  const records = new Set(value.concepts.map(record => record.concept.id));
  assert(records.size === value.concepts.length, "包内概念 UUID 重复");
  const selected = new Set(value.selected), dependencies = new Set(value.dependencies);
  assert(selected.size + dependencies.size === records.size, "选择与依赖必须准确覆盖全部概念");
  for (const id of selected) assert(records.has(id) && !dependencies.has(id), "选择和依赖身份无效或重叠");
  for (const id of dependencies) assert(records.has(id), "依赖没有完整记录");
  for (const id of value.entrypoints) assert(selected.has(id), "入口必须属于显式选择");
  const external = new Set(value.externals.map(reference => reference.id));
  assert(external.size === value.externals.length, "外部引用 UUID 重复");
  assert(value.mode !== "standalone" || external.size === 0, "独立包不能包含未解析外部引用");
  const targets = new Set(value.concepts.flatMap(record => record.concept.participants?.map(slot => slot.concept) ?? []));
  for (const id of external) assert(!records.has(id) && targets.has(id), "外部引用必须来自范围边界，且不能伪装为完整记录");
  validateConcepts(value.concepts.map(record => record.concept), external);
  const byId = new Map(value.concepts.map(record => [record.concept.id, record.concept]));
  const reachable = new Set(selected), queue = [...selected];
  for (let i = 0; i < queue.length; i++) {
    const concept = byId.get(queue[i])!;
    for (const id of [...conceptDefinitionIds(concept), ...(concept.participants ?? []).map(slot => slot.concept)]) {
      if (byId.has(id) && !reachable.has(id)) { reachable.add(id); queue.push(id); }
    }
  }
  assert(reachable.size === records.size, "依赖包含与所选概念无关的记录");
  await Promise.all(value.concepts.map(async record => {
    assert(await sha256(canonicalJSON(record.concept)) === record.sha256, `概念内容摘要不匹配：${record.concept.id}`);
  }));
  return structuredClone(value);
}
export async function writeGraphPackage(value: GraphPackage): Promise<string> {
  return canonicalJSON(await readGraphPackage(value));
}
