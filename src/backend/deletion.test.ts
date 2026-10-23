/** 真正经过POST/IDB事务验证引用预览、并发围栏、持久重放和历史原子性。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { createHttpAdapter } from "../adapter/api";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { registry, successSchema } from "../contracts/rpc";
import type { DeletePreview } from "../contracts/deletion";
import { parse } from "../contracts/validate";
import { C, newId, type Concept } from "../domain/concepts";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";
import { scopedQuery } from "./workspaceQueries";
import { STORES as S, type HistoryEntry } from "./workspaceDb";
import * as query from "./deletionQuery";
const repositories: IndexedDbRepository[] = [];
function session(name = "delete-" + newId(), role: "administrator" | "guest" = "administrator") {
  const repository = new IndexedDbRepository(name, indexedDB, role, "blank"); repositories.push(repository);
  const dispatch = createInternalDispatch(buildDataRouter(repository));
  return { repository, dispatch, adapter: createHttpAdapter(dispatch), name };
}
const params = (preview: DeletePreview) => ({ id: preview.target.concept.id, expectedVersion: preview.target.version,
  expectedRevision: preview.revision, expectedViewStateVersion: preview.viewStateVersion });
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(repositories.splice(0).map(repository => repository.close())); });
async function connect(name: string) { return new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(name, 1);
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
async function addOtherNavigation(target: ReturnType<typeof session>, id: string) {
  const data = await target.repository.bootstrap(), db = await connect(target.name);
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction(S.viewState, "readwrite");
    tx.objectStore(S.viewState).put({ ...data.viewState, id: newId(), data: { ...data.viewState.data, focusId: id } });
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
}
it("previews exact slot/type/presentation references without writes and refuses to cascade", async () => {
  const target = session(); await target.adapter.load();
  const a: Concept = { id: newId(), label: "概念甲", types: [C.concept] }, b: Concept = { id: newId(), label: "概念乙", types: [C.concept] };
  const slot = newId(), relation: Concept = { id: newId(), label: "独立事实", types: [C.relation], participants: [
    { id: slot, role: C.participant, concept: a.id }, { id: newId(), role: C.participant, concept: b.id } ] };
  await target.adapter.mutate({ put: [a, b, relation] });
  const before = await target.adapter.load(), preview = await target.adapter.previewDelete(a.id);
  expect(preview).toMatchObject({ canDelete: false, blockers: [{ kind: "concept", ownerId: relation.id, path: `participants.${slot}.concept` }] });
  expect(await target.adapter.load()).toEqual(before);
  await expect(target.adapter.deleteConcept(params(preview))).rejects.toMatchObject({ fault: { code: "REFERENCE_CONFLICT" } });
  const core = await target.adapter.previewDelete(C.participant);
  expect(core.blockers.some(ref => ref.kind === "core")).toBe(true);
  expect(core.blockers.some(ref => ref.path.endsWith(".role"))).toBe(true);
  expect((await target.adapter.previewDelete(C.relation)).blockers.some(ref => ref.kind === "view")).toBe(true);
  expect(await target.adapter.load()).toEqual(before);
});
it("includes classification, schema roles, inactive perspectives and saved overrides in the complete reference list", async () => {
  const target = session(); await target.adapter.load();
  const category: Concept = { id: newId(), label: "可配置分类", types: [C.type], broader: [C.concept] };
  const role: Concept = { id: newId(), label: "可配置角色", types: [C.role] };
  const relationType: Concept = { id: newId(), label: "带角色约束的关系类型", types: [C.type], broader: [C.relation], schema: { roles: [{ role: role.id, min: 0 }] } };
  const item: Concept = { id: newId(), label: "分类实例", types: [category.id], broader: [category.id] };
  await target.adapter.mutate({ put: [category, role, relationType, item] });
  const snapshot = await target.adapter.load(), settings = snapshot.settings, inactive = settings.perspective.presets.find(p => p.id !== settings.perspective.presetId)!;
  await target.adapter.saveSettings({ ...settings, views: settings.views.map((view, at) => at ? view : { ...view, primaryTypes: [...view.primaryTypes, category.id],
    rules: [...view.rules, { id: newId(), relationType: relationType.id, focusRole: role.id, otherRole: role.id, region: "left", priority: 0 }] }),
    perspective: { ...settings.perspective, presets: settings.perspective.presets.map(p => p.id !== inactive.id ? p : { ...p, concepts: { ...p.concepts, [category.id]: "dim" } }),
      overrides: { ...settings.perspective.overrides, [inactive.id]: { concepts: { [category.id]: "hidden" }, relations: {} } } } });
  const before = await target.adapter.load(), categoryPreview = await target.adapter.previewDelete(category.id), rolePreview = await target.adapter.previewDelete(role.id);
  expect(categoryPreview.blockers.map(ref => ref.kind)).toEqual(["concept", "concept", "view", "perspective", "navigation"]);
  expect(categoryPreview.blockers.filter(ref => ref.kind === "concept").map(ref => ref.path)).toEqual(["types", "broader"]);
  expect(categoryPreview.blockers.find(ref => ref.kind === "perspective")?.ownerId).toBe(inactive.id);
  expect(rolePreview.blockers.some(ref => ref.path === "schema.roles.0.role")).toBe(true);
  expect(rolePreview.blockers.filter(ref => ref.kind === "view")).toHaveLength(2);
  expect(await target.adapter.load()).toEqual(before);
});
it("deletes once with focus/expanded cleanup, preserves before-values and tombstones across reopen", async () => {
  const target = session(); await target.adapter.load();
  const a: Concept = { id: newId(), label: "保留的参与者", types: [C.concept] }, relation: Concept = { id: newId(), label: "可移除的关系", types: [C.relation], participants: [
    { id: newId(), role: C.participant, concept: a.id }, { id: newId(), role: C.participant, concept: a.id } ] };
  await target.adapter.mutate({ put: [a, relation] });
  const current = await target.adapter.load();
  await target.adapter.saveSettings({ ...current.settings, focusId: relation.id, expandedRelations: [relation.id] });
  const preview = await target.adapter.previewDelete(relation.id), commandId = newId();
  expect(preview).toMatchObject({ canDelete: true, clearFocus: true, removeExpanded: true, historyRetained: true });
  const second = session(target.name); await second.adapter.load();
  const commits = await Promise.all([target.adapter.deleteConcept(params(preview), { commandId }), second.adapter.deleteConcept(params(preview), { commandId })]);
  expect(commits.filter(commit => !commit.replayed)).toHaveLength(1);
  expect(new Set(commits.map(commit => commit.eventId)).size).toBe(1);
  const after = await target.adapter.load(); expect(after.revision).toBe(preview.revision + 1);
  expect(after.settings.focusId).toBe(null); expect(after.settings.expandedRelations).toEqual([]);
  expect(after.concepts.some(concept => concept.id === a.id)).toBe(true);
  expect(after.concepts.some(concept => concept.id === relation.id)).toBe(false);
  const db = await connect(target.name), bootstrap = await target.repository.bootstrap();
  const history = await scopedQuery<HistoryEntry>(db, bootstrap.workspaceId, [S.events], (tx, _state, done) => {
    const request = tx.objectStore(S.events).get(after.revision); request.onsuccess = () => done(request.result as HistoryEntry); });
  db.close(); expect(history.value.before.concepts).toEqual([preview.target]);
  expect(history.value.before.viewState?.data.focusId).toBe(relation.id);
  await target.repository.close(); const reopened = session(target.name);
  expect(await reopened.adapter.deleteConcept(params(preview), { commandId })).toMatchObject({ replayed: true, eventId: commits[0].eventId });
  await expect(reopened.adapter.deleteConcept({ ...params(preview), expectedRevision: after.revision }, { commandId })).rejects.toMatchObject({ fault: { code: "IDEMPOTENCY_KEY_REUSED" } });
  await expect(reopened.adapter.mutate({ put: [relation] })).rejects.toMatchObject({ fault: { code: "VERSION_CONFLICT" } });
});
it("refuses oversized complete reference lists instead of truncating them", async () => {
  const target = session(); await target.adapter.load(); const item: Concept = { id: newId(), label: "高引用目标", types: [C.concept] };
  const relation: Concept = { id: newId(), label: "完整参与槽", types: [C.relation], participants: Array.from({ length: 2001 }, () => ({ id: newId(), role: C.participant, concept: item.id })) };
  await target.adapter.mutate({ put: [item, relation] }); const before = await target.adapter.load();
  await expect(target.adapter.previewDelete(item.id)).rejects.toMatchObject({ fault: { code: "PAYLOAD_TOO_LARGE" } });
  expect(await target.adapter.load()).toEqual(before);
});
it("rejects both shared edits and personal navigation after the reviewed snapshot", async () => {
  const target = session(); await target.adapter.load(); const item = { id: newId(), label: "目标", types: [C.concept] };
  await target.adapter.mutate({ put: [item] }); let preview = await target.adapter.previewDelete(item.id);
  const saved = await target.adapter.load(); await target.adapter.saveSettings({ ...saved.settings, focusId: item.id });
  await expect(target.adapter.deleteConcept(params(preview))).rejects.toMatchObject({ fault: { code: "VERSION_CONFLICT" } });
  preview = await target.adapter.previewDelete(item.id); await target.adapter.mutate({ put: [{ ...item, label: "同时改名" }] });
  const before = await target.adapter.load();
  await expect(target.adapter.deleteConcept(params(preview))).rejects.toMatchObject({ fault: { code: "VERSION_CONFLICT" } });
  expect(await target.adapter.load()).toEqual(before);
});
it("checks other saved navigation inside the write transaction, including raw command deletes", async () => {
  const target = session(); await target.adapter.load(); const item = { id: newId(), label: "另一人正在阅读", types: [C.concept] };
  await target.adapter.mutate({ put: [item] }); const preview = await target.adapter.previewDelete(item.id), original = query.readDeletionState;
  vi.spyOn(query, "readDeletionState").mockImplementationOnce(async (...args) => {
    const reviewed = await original(...args); await addOtherNavigation(target, item.id); return reviewed;
  });
  await expect(target.adapter.deleteConcept(params(preview))).rejects.toMatchObject({ fault: { code: "REFERENCE_CONFLICT" } });
  const latest = await target.adapter.previewDelete(item.id);
  expect(latest.blockers).toEqual([{ kind: "navigation", ownerId: "other-view-state", label: "其他已保存的导航", path: "focusId" }]);
  await expect(target.adapter.execute({ operations: [{ type: "concept.deleteUnreferenced", id: item.id, expectedVersion: 1 }] })).rejects.toMatchObject({ fault: { code: "REFERENCE_CONFLICT" } });
  expect((await target.adapter.load()).revision).toBe(preview.revision);
});
it("keeps deletion, tombstone, cleanup and command result atomic when history cannot be stored", async () => {
  const target = session(); await target.adapter.load(); const item = { id: newId(), label: "事务失败保留", types: [C.concept] };
  await target.adapter.mutate({ put: [item] }); const preview = await target.adapter.previewDelete(item.id), before = await target.adapter.load();
  const add = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function(this: IDBObjectStore, ...args: Parameters<typeof add>) {
    if (this.name === S.events) throw new Error("injected history failure"); return add.apply(this, args);
  });
  await expect(target.adapter.deleteConcept(params(preview))).rejects.toMatchObject({ fault: { code: "INTERNAL_ERROR" } });
  expect(await target.adapter.load()).toEqual(before);
  vi.restoreAllMocks(); expect((await target.adapter.deleteConcept(params(preview))).replayed).toBe(false);
});
it("rejects guest writes and malformed RPC, and treats the wrong deleted UUID response as ambiguous", async () => {
  const target = session(); await target.adapter.load(); const item = { id: newId(), label: "协议关联", types: [C.concept] };
  await target.adapter.mutate({ put: [item] }); const preview = await target.adapter.previewDelete(item.id), guest = session(target.name, "guest");
  await expect(guest.adapter.deleteConcept(params(preview))).rejects.toMatchObject({ fault: { code: "FORBIDDEN" } });
  const badPreview = createHttpAdapter(async (path, body, signal) => { const response = await target.dispatch(path, body, signal);
    if (path !== registry.previewDelete.path || response.status !== 200) return response;
    const envelope = structuredClone(parse(successSchema(registry.previewDelete.result), response.body)); envelope.result.target.concept.id = newId();
    return { ...response, body: envelope }; });
  await expect(badPreview.previewDelete(item.id)).rejects.toMatchObject({ fault: { code: "INTERNAL_ERROR" } });
  const invalid = await target.dispatch(registry.deleteConcept.path, { protocol: "kinship.rpc", version: 1, requestId: newId(), workspaceId: preview.workspaceId,
    commandId: newId(), params: { ...params(preview), actorId: newId() } }); expect(invalid.status).toBe(400);
  const adapter = createHttpAdapter(async (path, body, signal) => { const response = await target.dispatch(path, body, signal);
    if (path !== registry.deleteConcept.path || response.status !== 200) return response;
    const envelope = structuredClone(parse(successSchema(registry.deleteConcept.result), response.body)); envelope.result.changes.removed[0].id = newId();
    return { ...response, body: envelope }; });
  const commandId = newId(); await expect(adapter.deleteConcept(params(preview), { commandId })).rejects.toMatchObject({ fault: { code: "RESULT_UNKNOWN" } });
  expect(await target.adapter.deleteConcept(params(preview), { commandId })).toMatchObject({ commandId, replayed: true });
});
