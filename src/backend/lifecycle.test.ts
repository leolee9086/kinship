/** 生命周期走真实POST与IDB，不改写参与事实；恢复和撤销都追加新的提交。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { createHttpAdapter } from "../adapter/api";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { registry, successSchema } from "../contracts/rpc";
import { parse } from "../contracts/validate";
import { C, newId, type Concept } from "../domain/concepts";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";
import { scopedQuery } from "./workspaceQueries";
import { STORES as S, type HistoryEntry } from "./workspaceDb";
const repositories: IndexedDbRepository[] = [];
function session(name = "lifecycle-" + newId(), role: "administrator" | "guest" = "administrator") {
  const repository = new IndexedDbRepository(name, indexedDB, role, "blank"); repositories.push(repository);
  const dispatch = createInternalDispatch(buildDataRouter(repository));
  return { repository, dispatch, adapter: createHttpAdapter(dispatch), name };
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(repositories.splice(0).map(repository => repository.close())); });
const item = (): Concept => ({ id: newId(), label: "往返概念", types: [C.concept], aliases: ["另一个称呼"], description: "内容不能在恢复时丢失", properties: { note: [1, "来源", true] } });
async function history(target: ReturnType<typeof session>, revision: number) {
  const bootstrap = await target.repository.bootstrap();
  const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open(target.name, 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  try { return (await scopedQuery<HistoryEntry>(db, bootstrap.workspaceId, [S.events], (tx, _state, done) => {
    const request = tx.objectStore(S.events).get(revision); request.onsuccess = () => done(request.result as HistoryEntry); })).value;
  } finally { db.close(); }
}
it("preserves identity, fields, complete slots and other facts; restore adds a new actor-attributed event", async () => {
  const target = session(); await target.adapter.load(); const a = item(), b = item(); b.label = "另一对象";
  const relation: Concept = { id: newId(), label: "独立的完整关系", types: [C.relation], participants: [
    { id: newId(), role: C.participant, concept: a.id }, { id: newId(), role: C.participant, concept: b.id }, { id: newId(), role: C.participant, concept: a.id } ] };
  await target.adapter.mutate({ put: [a, b, relation] });
  const before = await target.adapter.load(), bootstrap = await target.repository.bootstrap();
  const forgotten = await target.adapter.setForgotten(a.id, true, 1);
  expect(forgotten).toMatchObject({ actorId: bootstrap.actorId, revision: before.revision + 1, changes: { put: [{ concept: { ...a, forgotten: true }, version: 2 }], removed: [] } });
  const middle = await target.adapter.load(); expect(middle.concepts).toHaveLength(before.concepts.length);
  expect(middle.concepts.find(c => c.id === relation.id)).toEqual(relation); expect(middle.conceptVersions[relation.id]).toBe(1);
  expect((await history(target, forgotten.revision)).before.concepts).toEqual([{ concept: a, version: 1 }]);
  const restored = await target.adapter.setForgotten(a.id, false, 2);
  expect(restored.revision).toBe(forgotten.revision + 1); expect(restored.eventId).not.toBe(forgotten.eventId);
  expect(restored.changes.put).toEqual([{ concept: a, version: 3 }]);
  expect((await history(target, restored.revision)).before.concepts).toEqual([{ concept: { ...a, forgotten: true }, version: 2 }]);
  expect((await target.adapter.load()).concepts).toEqual(before.concepts);
});
it("serializes one command across connections and replays after restore/reopen without resurrecting an old state", async () => {
  const target = session(); await target.adapter.load(); const a = item(); await target.adapter.mutate({ put: [a] });
  const other = session(target.name); await other.adapter.load(); const commandId = newId();
  const commits = await Promise.all([target.adapter.setForgotten(a.id, true, 1, { commandId }), other.adapter.setForgotten(a.id, true, 1, { commandId })]);
  expect(commits.filter(c => !c.replayed)).toHaveLength(1); expect(new Set(commits.map(c => c.eventId)).size).toBe(1);
  await target.adapter.setForgotten(a.id, false, 2); await target.repository.close(); const reopened = session(target.name);
  expect(await reopened.adapter.setForgotten(a.id, true, 1, { commandId })).toMatchObject({ replayed: true, eventId: commits[0].eventId });
  const saved = await reopened.adapter.load(); expect(saved.concepts.find(c => c.id === a.id)).toEqual(a); expect(saved.conceptVersions[a.id]).toBe(3);
  await expect(reopened.adapter.setForgotten(a.id, false, 2, { commandId })).rejects.toMatchObject({ fault: { code: "IDEMPOTENCY_KEY_REUSED" } });
});
it("rejects stale versions, protected roots, duplicate state and generic-field bypass without changing facts", async () => {
  const target = session(); await target.adapter.load(); const a = item(); await target.adapter.mutate({ put: [a] });
  await target.adapter.mutate({ put: [{ ...a, label: "并发改名" }] }); const before = await target.adapter.load();
  await expect(target.adapter.setForgotten(a.id, true, 1)).rejects.toMatchObject({ fault: { code: "VERSION_CONFLICT" } });
  await expect(target.adapter.setForgotten(C.concept, true, before.conceptVersions[C.concept])).rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT" } });
  await expect(target.adapter.setForgotten(a.id, false, 2)).rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT" } });
  const guest = session(target.name, "guest"); await expect(guest.adapter.setForgotten(a.id, true, 2)).rejects.toMatchObject({ fault: { code: "FORBIDDEN" } });
  const meta = await target.repository.bootstrap();
  const invalid = await target.dispatch(registry.apply.path, { protocol: "kinship.rpc", version: 1, requestId: newId(), workspaceId: meta.workspaceId, commandId: newId(),
    params: { operations: [{ type: "concept.updateFields", id: a.id, expectedVersion: 2, fields: { forgotten: true } }] } });
  expect(invalid.status).toBe(400); expect(await target.adapter.load()).toEqual(before);
});
it("rolls back lifecycle version, history and idempotency result together when an append fails", async () => {
  const target = session(); await target.adapter.load(); const a = item(); await target.adapter.mutate({ put: [a] });
  const before = await target.adapter.load(), add = IDBObjectStore.prototype.add, commandId = newId();
  vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function(this: IDBObjectStore, ...args: Parameters<typeof add>) {
    if (this.name === S.events) throw new Error("history append failed"); return add.apply(this, args);
  });
  await expect(target.adapter.setForgotten(a.id, true, 1, { commandId })).rejects.toMatchObject({ fault: { code: "INTERNAL_ERROR" } });
  expect(await target.adapter.load()).toEqual(before); vi.restoreAllMocks();
  expect((await target.adapter.setForgotten(a.id, true, 1, { commandId })).replayed).toBe(false);
});
it("exports forgotten records intact, imports lifecycle conflicts explicitly and edits without accidentally restoring", async () => {
  const source = session(); await source.adapter.load(); const a = item(); await source.adapter.mutate({ put: [a] });
  await source.adapter.setForgotten(a.id, true, 1); const saved = await source.adapter.load();
  const hidden = saved.concepts.find(c => c.id === a.id)!; await source.adapter.mutate({ put: [{ ...hidden, description: "遗忘期间仍可明确编辑" }] });
  expect((await source.adapter.load()).concepts.find(c => c.id === a.id)?.forgotten).toBe(true);
  const value = await source.adapter.exportGraph({ entrypoints: [a.id], selected: [a.id], mode: "standalone" });
  expect(value.concepts.find(c => c.concept.id === a.id)?.concept.forgotten).toBe(true);
  const target = session(); await target.adapter.load(); await target.adapter.mutate({ put: [a] });
  const preview = await target.adapter.previewImport(value);
  await target.adapter.importGraph({ package: value, packageSha256: preview.packageSha256, expectedRevision: preview.revision,
    conflicts: [{ id: a.id, resolution: "use-incoming" }], acceptChangedExternals: [] });
  expect((await target.adapter.load()).concepts.find(c => c.id === a.id)).toEqual({ ...hidden, description: "遗忘期间仍可明确编辑" });
  await source.adapter.setForgotten(a.id, false, 3); const activePackage = await source.adapter.exportGraph({ entrypoints: [a.id], selected: [a.id], mode: "standalone" });
  const activePreview = await target.adapter.previewImport(activePackage);
  await target.adapter.importGraph({ package: activePackage, packageSha256: activePreview.packageSha256, expectedRevision: activePreview.revision,
    conflicts: [{ id: a.id, resolution: "use-incoming" }], acceptChangedExternals: [] });
  expect((await target.adapter.load()).concepts.find(c => c.id === a.id)?.forgotten).toBeUndefined();
});
it("treats a wrong lifecycle result as ambiguous and resolves by replaying the original command", async () => {
  const target = session(); await target.adapter.load(); const a = item(); await target.adapter.mutate({ put: [a] });
  const adapter = createHttpAdapter(async (path, body, signal) => { const reply = await target.dispatch(path, body, signal);
    if (path !== registry.apply.path || reply.status !== 200) return reply;
    const envelope = structuredClone(parse(successSchema(registry.apply.result), reply.body)); delete envelope.result.changes.put[0].concept.forgotten;
    return { ...reply, body: envelope }; });
  const commandId = newId(); await expect(adapter.setForgotten(a.id, true, 1, { commandId })).rejects.toMatchObject({ fault: { code: "RESULT_UNKNOWN" } });
  expect(await target.adapter.setForgotten(a.id, true, 1, { commandId })).toMatchObject({ replayed: true, commandId });
  expect((await target.adapter.load()).concepts.find(c => c.id === a.id)?.forgotten).toBe(true);
});
