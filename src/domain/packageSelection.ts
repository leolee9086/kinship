/** 局部包只沿记录的出向依赖闭包展开，不寻找参与者的所有邻居或关系入边。 */
import type { ConceptRecord } from "../contracts/commands";
import type { GraphPackage } from "../contracts/graphPackage";
import type { Concept } from "./concepts";
import { MAX_PACKAGE_RECORDS } from "../contracts/graphPackage";
import { assert } from "./inputValidation";

export interface PackageSelection {
  selected: readonly string[];
  entrypoints: readonly string[];
  mode: GraphPackage["mode"];
  maxRecords?: number;
}
export function conceptDefinitionIds(concept: Concept): string[] {
  return [...concept.types, ...(concept.broader ?? []), ...(concept.schema?.roles ?? []).map(rule => rule.role),
    ...(concept.participants ?? []).map(slot => slot.role)];
}
export function selectPackageRecords(records: readonly ConceptRecord[], selection: PackageSelection) {
  const limit = selection.maxRecords ?? 1000;
  assert(Number.isSafeInteger(limit) && limit >= 1 && limit <= MAX_PACKAGE_RECORDS, "局部包数量预算无效");
  assert(selection.selected.length > 0 && selection.entrypoints.length > 0, "局部包必须有选择与入口");
  const selected = new Set(selection.selected), included = new Set(selection.selected), targets = new Set<string>();
  assert(selected.size === selection.selected.length, "选择 UUID 重复");
  assert(new Set(selection.entrypoints).size === selection.entrypoints.length, "入口 UUID 重复");
  for (const id of selection.entrypoints) assert(selected.has(id), "入口必须属于显式选择");
  const byId = new Map(records.map(record => [record.concept.id, record]));
  assert(byId.size === records.length, "来源快照的概念 UUID 重复");
  const queue = [...selected];
  const include = (id: string) => { if (!included.has(id)) { included.add(id); queue.push(id); } };
  for (let i = 0; i < queue.length; i++) {
    assert(included.size <= limit, "局部包超过概念数量预算，请缩小选择");
    const record = byId.get(queue[i]); assert(record, `来源概念不存在：${queue[i]}`);
    const concept = record.concept;
    for (const id of conceptDefinitionIds(concept)) include(id);
    for (const slot of concept.participants ?? []) {
      targets.add(slot.concept);
      if (selection.mode === "standalone") include(slot.concept);
    }
  }
  assert(included.size <= limit, "局部包超过概念数量预算，请缩小选择");
  const externals = [...targets].filter(id => !included.has(id)).sort().map(id => {
    const record = byId.get(id); assert(record, `来源参与概念不存在：${id}`); return record;
  });
  assert(externals.length <= MAX_PACKAGE_RECORDS, "局部包外部引用超过数量上限");
  return { records: [...included].sort().map(id => byId.get(id)!),
    selected: [...selected].sort(), dependencies: [...included].filter(id => !selected.has(id)).sort(), externals };
}
