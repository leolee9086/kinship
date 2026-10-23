/** 正文跨越真实RPC、IDB事务、不可变历史与显式图谱包；验证身份和失败边界。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { createHttpAdapter } from "../adapter/api";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { C, newId, type Concept } from "../domain/concepts";
import { emptyDocument } from "../domain/document";
import { registry, type Role } from "../contracts/rpc";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";
const repositories: IndexedDbRepository[] = [];
function session(name = "document-" + newId(), role: Role = "administrator") {
  const repository = new IndexedDbRepository(name, indexedDB, role, "blank"); repositories.push(repository);
  const dispatch = createInternalDispatch(buildDataRouter(repository));
  return { name, repository, dispatch, adapter: createHttpAdapter(dispatch) };
}
const concept = (): Concept => ({ id: newId(), label: "正文样本", types: [C.concept], properties: { unit: "N/C" } });
const document = () => { const body = emptyDocument(); body.blocks[0].content = [{ kind: "text", text: "牛顿第二定律 F = ma", marks: [{ kind: "bold" }] }]; return body; };
afterEach(async () => { await Promise.all(repositories.splice(0).map(repository => repository.close())); });
it("saves only the body, retains immutable prior values and reopens the same block UUIDs", async () => {
  const current = session(), { adapter } = current; await adapter.load(); const initial = concept(); await adapter.mutate({ put: [initial] });
  const first = document(), saved = await adapter.saveBody(initial, first, 1, { commandId: newId() });
  expect(saved.changes.put).toEqual([{ concept: { ...initial, body: first }, version: 2 }]);
  const second = structuredClone(first); second.blocks[0].content[0] = { kind: "text", text: "F = dp/dt", marks: [] };
  await adapter.saveBody({ ...initial, body: first }, second, 2);
  const detail = await adapter.historyConcept(saved.eventId, initial.id);
  expect(detail.before?.concept).toEqual(initial); expect(detail.after?.concept.body).toEqual(first);
  await current.repository.close(); const reopened = session(current.name); const loaded = await reopened.adapter.load();
  expect(loaded.concepts.find(c => c.id === initial.id)).toEqual({ ...initial, body: second });
  expect(loaded.conceptVersions[initial.id]).toBe(3);
  await expect(reopened.adapter.saveBody(initial, first, 1)).rejects.toMatchObject({ fault: { code: "VERSION_CONFLICT" } });
  expect((await reopened.adapter.load()).revision).toBe(loaded.revision);
});
it("retries the exact committed command after a lost response and rejects a forged successful body", async () => {
  const current = session(); await current.adapter.load(); const initial = concept(); await current.adapter.mutate({ put: [initial] });
  let lose = true, spoof = false;
  const adapter = createHttpAdapter(async (path, body, signal) => {
    const result = await current.dispatch(path, body, signal);
    if (path === registry.apply.path && lose) { lose = false; throw new Error("response lost"); }
    if (path === registry.apply.path && spoof && result.body && typeof result.body === "object") {
      const response = structuredClone(result.body) as { ok: boolean; result: { changes: { put: { concept: Concept }[] } } };
      response.result.changes.put[0].concept.label = "伪造正文成功"; return { ...result, body: response };
    }
    return result;
  });
  await adapter.load(); const body = document(), commandId = newId();
  await expect(adapter.saveBody(initial, body, 1, { commandId })).rejects.toMatchObject({ fault: { code: "RESULT_UNKNOWN" } });
  const replay = await adapter.saveBody(initial, body, 1, { commandId }); expect(replay.replayed).toBe(true);
  const next = { ...initial, body }, secondBody = emptyDocument(); const command2 = newId(); spoof = true;
  await expect(adapter.saveBody(next, secondBody, 2, { commandId: command2 })).rejects.toMatchObject({ fault: { code: "RESULT_UNKNOWN" } });
  spoof = false; expect((await adapter.saveBody(next, secondBody, 2, { commandId: command2 })).commandId).toBe(command2);
});
it("rejects malformed trees and UUID reuse atomically, including deleted block tombstones", async () => {
  const { adapter } = session(); await adapter.load(); const a = concept(), b = concept(), body = document();
  await adapter.mutate({ put: [{ ...a, body }, b] }); const before = await adapter.load();
  const bad = structuredClone(body); bad.blocks[0].children = [bad.roots[0]];
  await expect(adapter.saveBody({ ...a, body }, bad, 1)).rejects.toBeDefined();
  await expect(adapter.saveBody(b, body, 1)).rejects.toBeDefined();
  expect(await adapter.load()).toEqual(before);
  const empty = emptyDocument(); await adapter.saveBody({ ...a, body }, empty, 1);
  await expect(adapter.saveBody(b, body, 1)).rejects.toMatchObject({ fault: { code: "VERSION_CONFLICT" } });
  await adapter.saveBody({ ...a, body: empty }, body, 2); // 原正文撤销可恢复自己的块UUID。
  expect((await adapter.load()).concepts.find(c => c.id === a.id)?.body).toEqual(body);
});
it("exports and imports complete editor-neutral bodies with UUIDs and denies guest writes", async () => {
  const source = session(); await source.adapter.load(); const initial = { ...concept(), body: document() }; await source.adapter.mutate({ put: [initial] });
  const value = await source.adapter.exportGraph({ selected: [initial.id], entrypoints: [initial.id], mode: "standalone" });
  expect(value.spec).toBe(2); expect(value.coverage.documents).toBe("concept-bodies");
  const target = session(); await target.adapter.load(); const preview = await target.adapter.previewImport(value);
  await target.adapter.importGraph({ package: value, packageSha256: preview.packageSha256, expectedRevision: preview.revision, conflicts: [], acceptChangedExternals: [] });
  expect((await target.adapter.load()).concepts.find(c => c.id === initial.id)).toEqual(initial);
  const guest = session(target.name, "guest"); await guest.adapter.load();
  await expect(guest.adapter.saveBody(initial, emptyDocument(), 1)).rejects.toMatchObject({ fault: { code: "FORBIDDEN" } });
});
