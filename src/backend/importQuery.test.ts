/** 预览使用目标一致快照/身份墓碑，只报告差异；UUID相同与名称相同是不同情况。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { createHttpAdapter } from "../adapter/api";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { C, newId, type Concept } from "../domain/concepts";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";

const repositories: IndexedDbRepository[] = [];
function session() {
  const repository = new IndexedDbRepository("import-preview-" + newId()); repositories.push(repository);
  return createHttpAdapter(createInternalDispatch(buildDataRouter(repository)));
}
afterEach(async () => { await Promise.all(repositories.splice(0).map(repository => repository.close())); });
it("matches by UUID and content, reports stale-source conflicts and never changes target data", async () => {
  const adapter = session(), original = await adapter.load(), id = original.settings.focusId!;
  const value = await adapter.exportGraph({ selected: [id], entrypoints: [id], mode: "standalone" });
  const identical = await adapter.previewImport(value);
  expect(identical.concepts.every(item => item.action === "identical")).toBe(true);
  const current = original.concepts.find(concept => concept.id === id)!;
  const changed = await adapter.mutate({ put: [{ ...current, label: "目标库已经改名" }] });
  const preview = await adapter.previewImport(value);
  expect(preview.revision).toBe(changed.revision);
  expect(preview.concepts.find(item => item.id === id)).toMatchObject({ action: "conflict", targetVersion: 2 });
  expect(await adapter.load()).toEqual(changed);
});
it("keeps same-name different-UUID concepts separate and refuses tombstone identity reuse", async () => {
  const source = session(), target = session(); await source.load(); const targetInitial = await target.load();
  const item: Concept = { id: newId(), label: "林承远", types: [C.concept] };
  await source.mutate({ put: [item] });
  const value = await source.exportGraph({ selected: [item.id], entrypoints: [item.id], mode: "standalone" });
  expect((await target.previewImport(value)).concepts.find(entry => entry.id === item.id)?.action).toBe("create");
  await target.mutate({ put: [item] }); await target.mutate({ remove: [item.id] });
  const preview = await target.previewImport(value);
  expect(preview.concepts.find(entry => entry.id === item.id)).toMatchObject({ action: "blocked", reason: "身份已删除，需显式恢复" });
  expect((await target.load()).concepts).toEqual(targetInitial.concepts);
});
it("reports changed or missing externals without replacing them by same-name concepts", async () => {
  const source = session(), target = session(); await source.load(); await target.load();
  const a: Concept = { id: newId(), label: "源对象", types: [C.concept] };
  const b: Concept = { id: newId(), label: "外部对象", types: [C.concept] };
  const relation: Concept = { id: newId(), label: "外部边界", types: [C.relation], participants: [
    { id: newId(), role: C.participant, concept: a.id }, { id: newId(), role: C.participant, concept: b.id },
  ] };
  await source.mutate({ put: [a, b, relation] });
  await target.mutate({ put: [{ ...a, label: "目标中改名" }, { ...b, id: newId() }] });
  const value = await source.exportGraph({ selected: [relation.id], entrypoints: [relation.id], mode: "boundary" });
  const preview = await target.previewImport(value);
  expect(preview.externals.find(entry => entry.id === a.id)).toMatchObject({ status: "changed", targetVersion: 1 });
  expect(preview.externals.find(entry => entry.id === b.id)?.status).toBe("missing");
  const occupied: Concept = { ...relation, id: newId(), participants: relation.participants!.map(slot => ({ ...slot, concept: a.id })) };
  await target.mutate({ put: [occupied] });
  expect((await target.previewImport(value)).concepts.find(entry => entry.id === relation.id)?.action).toBe("blocked");
});
