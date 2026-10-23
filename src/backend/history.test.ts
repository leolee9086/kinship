/** 历史通过真实适配器/RPC读取；验证冻结游标、不可变前值、来源、边界和伪造响应。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { createHttpAdapter } from "../adapter/api";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { registry } from "../contracts/rpc";
import type { HistoryConcept } from "../contracts/history";
import { C, newId, type Concept } from "../domain/concepts";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";
const repositories: IndexedDbRepository[] = [];
function session(name = "history-" + newId(), role: "administrator" | "guest" = "administrator") {
  const repository = new IndexedDbRepository(name, indexedDB, role, "blank"); repositories.push(repository);
  const dispatch = createInternalDispatch(buildDataRouter(repository));
  return { repository, dispatch, adapter: createHttpAdapter(dispatch), name };
}
afterEach(async () => { await Promise.all(repositories.splice(0).map(r => r.close())); });
const item = (label = "原始名称"): Concept => ({ id: newId(), label, types: [C.concept], description: "历史内容", properties: { proof: ["原始记录", true] } });
it("freezes descending pages across writes, returns to the same first page and scopes cursors to a workspace", async () => {
  const target = session(); await target.adapter.load(); const a = item();
  await target.adapter.mutate({ put: [a] });
  await target.adapter.setForgotten(a.id, true, 1); await target.adapter.setForgotten(a.id, false, 2);
  const first = await target.adapter.historyList({ limit: 2 });
  expect(first).toMatchObject({ atRevision: 3, events: [{ revision: 3 }, { revision: 2 }], nextCursor: { atRevision: 3, beforeRevision: 2 } });
  await target.adapter.mutate({ put: [{ ...a, label: "分页期间的新编辑" }] });
  const second = await target.adapter.historyList({ limit: 2, cursor: first.nextCursor! });
  expect(second).toMatchObject({ atRevision: 3, events: [{ revision: 1 }], nextCursor: null });
  const initialCursor = { ...first.nextCursor!, beforeRevision: null };
  expect(await target.adapter.historyList({ limit: 2, cursor: initialCursor })).toEqual(first);
  expect((await target.adapter.historyList({ limit: 2 })).events[0].revision).toBe(4);
  const other = session(); await other.adapter.load();
  await expect(other.adapter.historyList({ limit: 2, cursor: first.nextCursor! })).rejects.toMatchObject({ fault: { code: "CURSOR_EXPIRED" } });
  await expect(target.adapter.historyList({ limit: 2, cursor: { ...initialCursor, atRevision: 100 } })).rejects.toMatchObject({ fault: { code: "CURSOR_EXPIRED" } });
});
it("reads immutable create/update/delete values after later writes, deletion and reopening without private navigation", async () => {
  const target = session(); const initial = await target.adapter.load(), a = item();
  const created = await target.adapter.execute({ operations: [{ type: "concept.create", concept: a }] });
  const update = await target.adapter.execute({ operations: [{ type: "concept.updateFields", id: a.id, expectedVersion: 1, fields: { label: "新名称" } }] });
  const snapshot = await target.adapter.load(); await target.adapter.saveSettings({ ...snapshot.settings, focusId: a.id });
  const preview = await target.adapter.previewDelete(a.id);
  const removed = await target.adapter.deleteConcept({ id: a.id, expectedVersion: 2, expectedRevision: preview.revision, expectedViewStateVersion: preview.viewStateVersion });
  expect((await target.adapter.historyConcept(created.eventId, a.id))).toMatchObject({ before: null, after: { concept: a, version: 1 }, resource: { change: "created" } });
  expect((await target.adapter.historyConcept(update.eventId, a.id))).toMatchObject({ before: { concept: a, version: 1 }, after: { concept: { ...a, label: "新名称" }, version: 2 } });
  const deleted = await target.adapter.historyConcept(removed.eventId, a.id);
  expect(deleted).toMatchObject({ before: { concept: { ...a, label: "新名称" }, version: 2 }, after: null, resource: { change: "deleted", afterVersion: 3 } });
  await target.repository.close(); const reopened = session(target.name, "guest");
  const beforeReads = await reopened.adapter.load(), page = await reopened.adapter.historyList({ limit: 50 });
  expect(page.events.map(e => e.revision)).toEqual([3, 2, 1]); expect(page.events.every(e => e.actorId === created.actorId)).toBe(true);
  expect(await reopened.adapter.historyConcept(removed.eventId, a.id)).toEqual(deleted);
  expect(JSON.stringify(page)).not.toMatch(/viewState|focusId|expandedRelations|"blob"/);
  expect(await reopened.adapter.load()).toEqual(beforeReads); expect(beforeReads.concepts).toEqual(initial.concepts);
});
it("retains complete multiparty slots and import provenance while returning only metadata in the list", async () => {
  const source = session(); await source.adapter.load(); const a = item(), b = item("另一概念");
  const relation: Concept = { id: newId(), label: "三方事实", types: [C.relation], participants: [
    { id: newId(), role: C.participant, concept: a.id }, { id: newId(), role: C.participant, concept: b.id }, { id: newId(), role: C.participant, concept: a.id }] };
  await source.adapter.mutate({ put: [a, b, relation] });
  const value = await source.adapter.exportGraph({ entrypoints: [relation.id], selected: [relation.id], mode: "standalone" });
  const target = session(); await target.adapter.load(); const preview = await target.adapter.previewImport(value);
  const commit = await target.adapter.importGraph({ package: value, packageSha256: preview.packageSha256, expectedRevision: preview.revision, conflicts: [], acceptChangedExternals: [] });
  const page = await target.adapter.historyList({ limit: 5 }), detail = await target.adapter.historyConcept(commit.eventId, relation.id);
  expect(page.events[0].importSource).toEqual(commit.importSource); expect(detail.importSource).toEqual(commit.importSource);
  expect(detail.after?.concept).toEqual(relation); expect(page.events[0].concepts.find(c => c.id === relation.id)).toMatchObject({ label: "三方事实", change: "created" });
  expect(JSON.stringify(page)).not.toContain("participants");
});
it("rejects invalid identifiers, unknown events, unrelated resources and oversize pages without writes", async () => {
  const target = session(), before = await target.adapter.load();
  expect(await target.adapter.historyList({ limit: 10 })).toEqual({ atRevision: 0, events: [], nextCursor: null });
  const a = item("長".repeat(512));
  await target.adapter.mutate({ put: Array.from({ length: 32 }, () => ({ ...a, id: newId() })) });
  for (let i = 0; i < 24; i++) await target.adapter.mutate({ put: Array.from({ length: 32 }, () => ({ ...a, id: newId() })) });
  const current = await target.adapter.load();
  await expect(target.adapter.historyList({ limit: 25 })).rejects.toMatchObject({ fault: { code: "PAYLOAD_TOO_LARGE" } });
  const smaller = await target.adapter.historyList({ limit: 5 }); expect(smaller.events).toHaveLength(5);
  await expect(target.adapter.historyConcept(newId(), C.concept)).rejects.toMatchObject({ fault: { code: "NOT_FOUND" } });
  await expect(target.adapter.historyConcept(smaller.events[0].eventId, C.concept)).rejects.toMatchObject({ fault: { code: "NOT_FOUND" } });
  await expect(target.adapter.historyList({ limit: 51 })).rejects.toMatchObject({ fault: { code: "INVALID_REQUEST" } });
  expect(await target.adapter.load()).toEqual(current); expect(current.revision).toBe(before.revision + 25);
});
it("rejects forged history target, versions, cursors and omissions even when the response schema is valid", async () => {
  const target = session(); await target.adapter.load(); const a = item(); await target.adapter.mutate({ put: [a] });
  await target.adapter.setForgotten(a.id, true, 1); const page = await target.adapter.historyList({ limit: 1 });
  for (const tamper of ["target", "version", "cursor", "omission"]) {
    const adapter = createHttpAdapter(async (path, body, signal) => {
      const reply = await target.dispatch(path, body, signal), value = reply.body as { ok: boolean; result: Record<string, unknown> };
      if (value.ok && path === registry.historyConcept.path) {
        const detail = value.result as unknown as HistoryConcept;
        if (tamper === "target") detail.after!.concept.id = newId();
        if (tamper === "version") detail.after!.version = 99;
      }
      if (value.ok && path === registry.historyList.path) {
        if (tamper === "cursor") (value.result.nextCursor as { beforeRevision: number }).beforeRevision = 1;
        if (tamper === "omission") value.result.events = [];
      }
      return reply;
    });
    await adapter.load();
    if (tamper === "target" || tamper === "version") await expect(adapter.historyConcept(page.events[0].eventId, a.id)).rejects.toMatchObject({ fault: { code: "INTERNAL_ERROR" } });
    else await expect(adapter.historyList({ limit: 1 })).rejects.toMatchObject({ fault: { code: "INTERNAL_ERROR" } });
  }
});
