/** 局部事实边界：多人/嵌套关系保真、显式外部引用、身份不按名称合并、超预算明确失败。 */
import { expect, it } from "vitest";
import { C, newId } from "../domain/concepts";
import { initialSnapshot } from "../domain/ontology";
import { exportGraphPackage } from "./exportGraphPackage";
import { readGraphPackage, writeGraphPackage } from "./graphPackage";

function source() {
  const snapshot = initialSnapshot(), records = snapshot.concepts.map(concept => ({ concept, version: 3 }));
  const context = { workspaceId: newId(), revision: 7 };
  const named = (label: string) => snapshot.concepts.find(concept => concept.label === label)!;
  return { records, context, named };
}
it("exports full multiparty facts and definitions without expanding incoming neighbors", async () => {
  const { records, context, named } = source(), relation = named("三人共同整理史料");
  const value = await exportGraphPackage(records, context, { selected: [relation.id], entrypoints: [relation.id], mode: "standalone" });
  expect(value.source).toEqual(context); expect(value.selected).toEqual([relation.id]); expect(value.externals).toEqual([]);
  const ids = new Set(value.concepts.map(record => record.concept.id));
  for (const slot of relation.participants!) expect(ids.has(slot.concept) && ids.has(slot.role)).toBe(true);
  expect(ids.has(named("林照月").id)).toBe(false);
  expect(ids.has(named("林承远与沈知微的配偶关系").id)).toBe(false);
  expect(value.concepts.find(record => record.concept.id === relation.id)).toMatchObject({ version: 3, concept: relation });
  expect(await readGraphPackage(await writeGraphPackage(value))).toEqual(value);
  value.concepts.find(record => record.concept.id === relation.id)!.concept.participants!.pop();
  expect(relation.participants).toHaveLength(3);
});
it("keeps boundary participants external while preserving all slots and complete role definitions", async () => {
  const { records, context, named } = source(), relation = named("三人共同整理史料");
  const value = await exportGraphPackage(records, context, { selected: [relation.id], entrypoints: [relation.id], mode: "boundary" });
  expect(value.externals.map(reference => reference.id).sort()).toEqual(relation.participants!.map(slot => slot.concept).sort());
  expect(value.concepts.find(record => record.concept.id === relation.id)!.concept.participants).toHaveLength(3);
  expect(value.externals.every(reference => reference.kind === "concept")).toBe(true);
  await expect(readGraphPackage({ ...value, externals: [] })).rejects.toThrow("参与概念不存在");
  await expect(readGraphPackage({ ...value, mode: "standalone" })).rejects.toThrow("独立包不能包含未解析外部引用");
});
it("follows a relation participating in a relation, and retains same-name distinct UUIDs", async () => {
  const { records, context, named } = source(), root = named("纪要记载父子关系");
  const value = await exportGraphPackage(records, context, { selected: [root.id], entrypoints: [root.id], mode: "standalone" });
  expect(value.concepts.some(record => record.concept.id === named("林承远与林见川的父子关系").id)).toBe(true);
  expect(value.concepts.some(record => record.concept.id === named("父子同时也是同僚").id)).toBe(false);
  const twins = [newId(), newId()].map(id => ({ concept: { id, label: "同名", types: [C.concept] }, version: 1 }));
  const selected = twins.map(record => record.concept.id);
  const duplicateNames = await exportGraphPackage([...records, ...twins], context, { selected, entrypoints: selected, mode: "standalone" });
  expect(duplicateNames.concepts.filter(record => record.concept.label === "同名")).toHaveLength(2);
});
it("rejects damaged content, ambiguous manifests and count/byte overflow instead of truncating facts", async () => {
  const { records, context, named } = source(), id = named("会议参与记录").id;
  const selection = { selected: [id], entrypoints: [id], mode: "standalone" as const };
  const value = await exportGraphPackage(records, context, selection);
  const corrupt = structuredClone(value); corrupt.concepts[0].concept.label = "摘要已失效";
  await expect(readGraphPackage(corrupt)).rejects.toThrow("概念内容摘要不匹配");
  await expect(readGraphPackage({ ...value, dependencies: [...value.dependencies, id] })).rejects.toThrow();
  await expect(exportGraphPackage(records, context, { ...selection, maxRecords: 1 })).rejects.toThrow("数量预算");
  await expect(exportGraphPackage(records, context, selection, 128)).rejects.toThrow("字节预算");
  await expect(readGraphPackage({ ...value, spec: 1 })).rejects.toThrow();
  await expect(readGraphPackage({ ...value, spec: 3 })).rejects.toThrow();
  await expect(readGraphPackage({ ...value, coverage: { ...value.coverage, documents: "omitted" } })).rejects.toThrow();
  const extra = named("林照月"), detached = { ...value,
    dependencies: [...value.dependencies, extra.id],
    concepts: [...value.concepts, { concept: extra, version: 3, sha256: "0".repeat(64) }],
  };
  await expect(readGraphPackage(detached)).rejects.toThrow("依赖包含与所选概念无关的记录");
});
