/** 导入必须保留UUID、整批提交，并把预览版本/冲突决策/来源和持久幂等放在同一协议中。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { createHttpAdapter, type DataAdapter } from "../adapter/api";
import { createInternalDispatch } from "../adapter/internalDispatch";
import type { GraphPackage } from "../contracts/graphPackage";
import { registry, successSchema } from "../contracts/rpc";
import { parse } from "../contracts/validate";
import { C, newId, type Concept } from "../domain/concepts";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";

const repositories: IndexedDbRepository[] = [];
function session(name = "import-tx-" + newId()) {
  const repository = new IndexedDbRepository(name); repositories.push(repository);
  const dispatch = createInternalDispatch(buildDataRouter(repository));
  return { repository, adapter: createHttpAdapter(dispatch), dispatch, name };
}
afterEach(async () => { await Promise.all(repositories.splice(0).map(repository => repository.close())); });
async function prepare(adapter: DataAdapter, value: GraphPackage) {
  const preview = await adapter.previewImport(value);
  return { package: value, packageSha256: preview.packageSha256, expectedRevision: preview.revision, conflicts: [], acceptChangedExternals: [] };
}
async function fixture() {
  const source = session(); await source.adapter.load();
  const a: Concept = { id: newId(), label: "作用力", types: [C.concept] }, b: Concept = { id: newId(), label: "运动状态", types: [C.concept] };
  const relation: Concept = { id: newId(), label: "力改变运动", types: [C.relation], participants: [
    { id: newId(), role: C.participant, concept: a.id }, { id: newId(), role: C.participant, concept: b.id },
  ] };
  await source.adapter.mutate({ put: [a, b, relation] });
  const value = await source.adapter.exportGraph({ selected: [relation.id], entrypoints: [relation.id], mode: "standalone" });
  return { source, a, b, relation, value };
}
it("atomically imports complete facts and source history, then replays after reopening and later edits", async () => {
  const { a, b, relation, value } = await fixture(), target = session(), before = await target.adapter.load();
  const params = await prepare(target.adapter, value), commandId = newId();
  const commit = await target.adapter.importGraph(params, { commandId });
  expect(commit.revision).toBe(before.revision + 1); expect(commit.changes.put).toHaveLength(3);
  expect(commit.importSource).toEqual({ packageId: value.id, packageSha256: params.packageSha256, source: value.source });
  const after = await target.adapter.load();
  for (const concept of [a, b, relation]) expect(after.concepts.find(item => item.id === concept.id)).toEqual(concept);
  expect(after.concepts).toHaveLength(before.concepts.length + 3);
  await target.adapter.mutate({ put: [{ ...a, label: "导入后的继续编辑" }] }); await target.repository.close();
  const reopened = session(target.name), replay = await reopened.adapter.importGraph(params, { commandId });
  expect(replay).toMatchObject({ commandId, replayed: true, revision: commit.revision });
  expect((await reopened.adapter.load()).concepts.find(item => item.id === a.id)?.label).toBe("导入后的继续编辑");
  await expect(reopened.adapter.importGraph({ ...params, expectedRevision: params.expectedRevision + 1 }, { commandId })).rejects.toMatchObject({ fault: { code: "IDEMPOTENCY_KEY_REUSED" } });
});
it("requires explicit conflict decisions and can preserve the target or accept complete incoming fields", async () => {
  const { a, value } = await fixture(), target = session(); await target.adapter.load();
  await target.adapter.mutate({ put: [{ ...a, label: "目标已更名", description: "仅目标拥有的说明" }] });
  let params = await prepare(target.adapter, value), before = await target.adapter.load();
  await expect(target.adapter.importGraph(params)).rejects.toMatchObject({ fault: { code: "REFERENCE_CONFLICT" } });
  expect(await target.adapter.load()).toEqual(before);
  await target.adapter.importGraph({ ...params, conflicts: [{ id: a.id, resolution: "keep-target" }] });
  expect((await target.adapter.load()).concepts.find(item => item.id === a.id)?.label).toBe("目标已更名");
  params = await prepare(target.adapter, value);
  const update = await target.adapter.importGraph({ ...params, conflicts: [{ id: a.id, resolution: "use-incoming" }] });
  expect(update.changes.put).toHaveLength(1);
  expect((await target.adapter.load()).concepts.find(item => item.id === a.id)).toEqual(a);
});
it("refuses expired previews and missing externals without publishing partial records", async () => {
  const { source, a, relation, value } = await fixture(), target = session(); await target.adapter.load();
  const params = await prepare(target.adapter, value);
  await target.adapter.mutate({ put: [{ id: newId(), label: "同时编辑", types: [C.concept] }] });
  const before = await target.adapter.load();
  await expect(target.adapter.importGraph(params)).rejects.toMatchObject({ fault: { code: "VERSION_CONFLICT" } });
  const boundary = await source.adapter.exportGraph({ selected: [relation.id], entrypoints: [relation.id], mode: "boundary" });
  await expect(target.adapter.importGraph(await prepare(target.adapter, boundary))).rejects.toMatchObject({ fault: { code: "REFERENCE_CONFLICT" } });
  expect(await target.adapter.load()).toEqual(before); expect(before.concepts.some(item => item.id === a.id)).toBe(false);
});
it("replays concurrent connections submitting the same logical import exactly once", async () => {
  const { value } = await fixture(), target = session(), other = session(target.name);
  const before = await target.adapter.load(); await other.adapter.load();
  const params = await prepare(target.adapter, value), commandId = newId();
  const commits = await Promise.all([target.adapter.importGraph(params, { commandId }), other.adapter.importGraph(params, { commandId })]);
  expect(commits.filter(commit => !commit.replayed)).toHaveLength(1);
  expect(new Set(commits.map(commit => commit.eventId)).size).toBe(1);
  expect((await target.adapter.load()).revision).toBe(before.revision + 1);
});
for (const damage of ["commandId", "source"] as const) it(`treats a response with the wrong ${damage} as ambiguous and safely replays it`, async () => {
  const { value } = await fixture(), target = session();
  const adapter = createHttpAdapter(async (path, body, signal) => {
    const response = await target.dispatch(path, body, signal);
    if (path !== registry.importGraph.path || response.status !== 200) return response;
    const envelope = structuredClone(parse(successSchema(registry.importGraph.result), response.body));
    if (damage === "commandId") envelope.result.commandId = newId();
    else envelope.result.importSource!.packageId = newId();
    return { ...response, body: envelope };
  });
  await adapter.load(); const params = await prepare(adapter, value), commandId = newId();
  await expect(adapter.importGraph(params, { commandId })).rejects.toMatchObject({ fault: { code: "RESULT_UNKNOWN" } });
  const replay = await target.adapter.importGraph(params, { commandId });
  expect(replay).toMatchObject({ commandId, replayed: true });
});
it("persists an identical import command without changing shared revision and serializes concurrent imports", async () => {
  const target = session(), before = await target.adapter.load(), id = before.settings.focusId!;
  const value = await target.adapter.exportGraph({ selected: [id], entrypoints: [id], mode: "standalone" });
  const params = await prepare(target.adapter, value), commandId = newId();
  const noop = await target.adapter.importGraph(params, { commandId });
  expect(noop.changes.put).toEqual([]); expect(noop.revision).toBe(before.revision);
  expect((await target.adapter.importGraph(params, { commandId })).replayed).toBe(true);
  const first = await fixture(), second = await fixture();
  const commands = await Promise.all([prepare(target.adapter, first.value), prepare(target.adapter, second.value)]);
  const results = await Promise.allSettled(commands.map(command => target.adapter.importGraph(command)));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { fault: { code: "VERSION_CONFLICT" } } });
  expect((await target.adapter.load()).revision).toBe(before.revision + 1);
});
