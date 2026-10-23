/** 验证 UI 草稿→字段/槽位命令→真实事务，防止客户端差异编译重新退化为整对象覆盖。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { createHttpAdapter } from "../adapter/api";
import { createInternalDispatch } from "../adapter/internalDispatch";
import type { Apply } from "../contracts/commands";
import { registry } from "../contracts/rpc";
import { newId, type Concept } from "../domain/concepts";
import { C } from "../testing/starterFixtures";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";

const repositories: IndexedDbRepository[] = [];
function session() {
  const repository = new IndexedDbRepository("fields-" + newId()); repositories.push(repository);
  const dispatch = createInternalDispatch(buildDataRouter(repository)), requests: Apply[] = [];
  const adapter = createHttpAdapter(async (path, body, signal) => {
    if (path === registry.apply.path) requests.push(structuredClone((body as { params: Apply }).params));
    return dispatch(path, body, signal);
  });
  return { adapter, requests, dispatch };
}
afterEach(async () => { await Promise.all(repositories.splice(0).map(repository => repository.close())); });
it("sends only edited fields and preserves omitted data, rejecting an editor opened at an old version", async () => {
  const { adapter, requests } = session(); await adapter.load();
  const initial: Concept = { id: newId(), label: "电场强度", types: [C.concept], description: "打开编辑器时的说明", properties: { unit: "N/C" } };
  await adapter.mutate({ put: [initial] });
  const next = { ...initial, label: "电场强度 E" };
  const result = await adapter.mutate({ put: [next] }, { expectedVersions: { [initial.id]: 1 }, initialConcepts: { [initial.id]: initial } });
  expect(requests.at(-1)).toEqual({ operations: [{ type: "concept.updateFields", id: initial.id, expectedVersion: 1, fields: { label: next.label } }] });
  expect(result.concepts.find(concept => concept.id === initial.id)).toEqual(next);
  await expect(adapter.mutate({ put: [{ ...initial, label: "旧草稿" }] }, { expectedVersions: { [initial.id]: 1 }, initialConcepts: { [initial.id]: initial } }))
    .rejects.toMatchObject({ fault: { code: "VERSION_CONFLICT" } });
});
it("applies a relation label edit and slot replacement/reorder in one resource version", async () => {
  const { adapter, requests } = session(); const base = await adapter.load();
  const template = base.concepts.find(concept => concept.participants?.length === 2 && concept.types.includes(C.location))!;
  const original: Concept = { ...template, id: newId(), participants: [
    ...template.participants!.map(slot => ({ ...slot, id: newId() })),
    { id: newId(), role: C.participant, concept: base.settings.focusId! },
  ] };
  await adapter.mutate({ put: [original] });
  const existing = original.participants!, replacement = { id: newId(), role: existing[0].role, concept: existing[0].concept };
  const next: Concept = { ...original, label: "更明确的关系说明", participants: [existing[1], replacement, existing[0]] };
  const data = await adapter.mutate({ put: [next] }, { expectedVersions: { [original.id]: 1 }, initialConcepts: { [original.id]: original } });
  expect(data.concepts.find(concept => concept.id === original.id)).toEqual(next);
  expect(data.conceptVersions[original.id]).toBe(2);
  const ops = requests.at(-1)!.operations;
  expect(ops.map(op => op.type)).toEqual(["concept.updateFields", "relation.removeParticipation", "relation.moveParticipation", "relation.addParticipation"]);
  expect(ops.filter(op => "expectedVersion" in op && op.expectedVersion !== 1)).toHaveLength(0);
});
it("rejects an invalid final slot count and rolls all same-resource fields back", async () => {
  const { adapter } = session(); const base = await adapter.load();
  const relation = base.concepts.find(concept => concept.participants?.length === 2)!;
  await expect(adapter.execute({ operations: [
    { type: "concept.updateFields", id: relation.id, expectedVersion: 1, fields: { label: "不应保存" } },
    { type: "relation.removeParticipation", id: relation.id, expectedVersion: 1, slotId: relation.participants![0].id },
  ] })).rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT" } });
  const after = await adapter.load(); expect(after.revision).toBe(0);
  expect(after.concepts.find(concept => concept.id === relation.id)).toEqual(relation);
});
it("atomically creates/renames/removes a perspective with personal selection fields", async () => {
  const { adapter, requests } = session(); const base = await adapter.load(), settings = structuredClone(base.settings);
  const preset = { ...settings.perspective.presets[0], id: newId(), label: "高中物理视角" };
  settings.perspective.presets.push(preset); settings.perspective.presetId = preset.id;
  await adapter.saveSettings(settings);
  expect(requests.at(-1)!.operations.map(op => op.type)).toEqual(["perspective.create", "viewState.updateFields"]);
  const saved = await adapter.load();
  expect(saved.presentationVersion).toBe(2); expect(saved.viewStateVersion).toBe(2);
  const next = structuredClone(saved.settings); next.perspective.presets.find(item => item.id === preset.id)!.label = "物理";
  await adapter.saveSettings(next);
  expect(requests.at(-1)!.operations).toEqual([{ type: "perspective.updateFields", id: preset.id, expectedVersion: 2, fields: { label: "物理" } }]);
  const current = await adapter.load(), removed = structuredClone(current.settings);
  removed.perspective.presets = removed.perspective.presets.filter(item => item.id !== preset.id);
  removed.perspective.presetId = removed.perspective.presets[0].id;
  await adapter.saveSettings(removed);
  expect(requests.at(-1)!.operations.map(op => op.type)).toEqual(["perspective.delete", "viewState.updateFields"]);
  expect((await adapter.load()).settings.perspective.presets.some(item => item.id === preset.id)).toBe(false);
});
