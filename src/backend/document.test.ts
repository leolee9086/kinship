/** 正文区段穿过统一RPC和IDB事务：验证身份、单文件CAS、完整CRDT及历史。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { createHttpAdapter } from "../adapter/api";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { C, newId, type Concept } from "../domain/concepts";
import { emptyDocument, newFile } from "../domain/document";
import { registry, type Role } from "../contracts/rpc";
import { YjsFileSession } from "../sections/adapters/yjsSession";
import { newColumns, readLayout } from "../sections/layout";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";
const repositories: IndexedDbRepository[] = [];
function session(name = "document-" + newId(), role: Role = "administrator") {
  const repository = new IndexedDbRepository(name, indexedDB, role, "blank"); repositories.push(repository);
  const dispatch = createInternalDispatch(buildDataRouter(repository));
  return { name, repository, dispatch, adapter: createHttpAdapter(dispatch) };
}
const concept = (): Concept => ({ id: newId(), label: "正文样本", types: [C.concept], properties: { unit: "N/C" } });
const document = () => {
  const body = emptyDocument(), first = body.blocks[0];
  if (first.kind !== "file" || first.mode !== "whole-file") throw Error("invalid fixture");
  first.text = "牛顿第二定律 F = ma\n\u00a0\n\n"; return body;
};
afterEach(async () => { await Promise.all(repositories.splice(0).map(repository => repository.close())); });
it("saves and reopens one exact Kramdown file, leaving its neighbor intact with immutable history", async () => {
  const current = session(), { adapter } = current; await adapter.load(); const initial = concept();
  const body = document(), second = newFile("text/x-kramdown", "第二段"); body.roots.push(second.id); body.blocks.push(second);
  await adapter.mutate({ put: [{ ...initial, body }] });
  const first = body.roots[0], handle = adapter.textFile(initial.id, first);
  expect(await handle.read()).toBe("牛顿第二定律 F = ma\n\u00a0\n\n");
  await handle.write("F = dp/dt\n\n"); const after = await adapter.readConcept(initial.id), saved = await adapter.historyList({ limit: 20 });
  expect(after.concept.body?.blocks.find(block => block.id === second.id)).toEqual(second);
  const detail = await adapter.historyConcept(saved.events[0].eventId, initial.id);
  expect(detail.before?.concept.body).toEqual(body); expect(detail.after?.concept).toEqual(after.concept);
  await current.repository.close(); const reopened = session(current.name), persisted = reopened.adapter.textFile(initial.id, first);
  expect(await persisted.read()).toBe("F = dp/dt\n\n");
  expect((await reopened.adapter.readConcept(initial.id)).concept.body?.blocks.find(block => block.id === second.id)).toEqual(second);
});
it("permits independent section writes but refuses stale versions and invalid boundary markers atomically", async () => {
  const { adapter } = session(); await adapter.load(); const initial = concept(), body = document(), second = newFile();
  body.roots.push(second.id); body.blocks.push(second); await adapter.mutate({ put: [{ ...initial, body }] });
  const a = adapter.textFile(initial.id, body.roots[0]), stale = adapter.textFile(initial.id, body.roots[0]), b = adapter.textFile(initial.id, second.id);
  await a.read(); await stale.read(); await b.read(); await b.write("第二节的变更"); await a.write("只改第一节");
  await expect(stale.write("覆盖第一节")).rejects.toMatchObject({ fault: { code: "VERSION_CONFLICT" } });
  await expect(a.write("---\n{: #split}")).rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT" } });
  expect(await a.read()).toBe("只改第一节"); expect(await b.read()).toBe("第二节的变更");
});
it("keeps the exact command on unknown outcomes and rejects forged file acknowledgments", async () => {
  const current = session(); await current.adapter.load(); const initial = { ...concept(), body: document() };
  await current.adapter.mutate({ put: [initial] }); let lose = true, spoof = false;
  const adapter = createHttpAdapter(async (path, body, signal) => {
    const result = await current.dispatch(path, body, signal);
    if (path === registry.apply.path && lose) { lose = false; throw new Error("response lost"); }
    if (path === registry.apply.path && spoof && result.body && typeof result.body === "object") {
      const reply = structuredClone(result.body) as { result: { changes: { put: { concept: Concept }[] } } };
      const block = reply.result.changes.put[0].concept.body?.blocks[0];
      if (block?.kind === "file" && block.mode === "whole-file") block.text = "伪造确认";
      return { ...result, body: reply };
    }
    return result;
  });
  await adapter.load(); const handle = adapter.textFile(initial.id, initial.body.roots[0]); await handle.read();
  await expect(handle.write("丢响应草稿")).rejects.toMatchObject({ fault: { code: "RESULT_UNKNOWN" } });
  await handle.write("丢响应草稿"); expect(await handle.read()).toBe("丢响应草稿");
  spoof = true; await expect(handle.write("下一条草稿")).rejects.toMatchObject({ fault: { code: "RESULT_UNKNOWN" } });
  spoof = false; await handle.write("下一条草稿"); expect(await handle.read()).toBe("下一条草稿");
});
it("restricts structure CAS to layout and identities; import and guest role remain enforced", async () => {
  const source = session(), initial = { ...concept(), body: document() }; await source.adapter.load(); await source.adapter.mutate({ put: [initial] });
  const original = initial.body.blocks[0]; if (original.kind !== "file" || original.mode !== "whole-file") throw Error("invalid fixture");
  const modified = structuredClone(initial.body), changed = modified.blocks[0];
  if (changed.kind !== "file" || changed.mode !== "whole-file") throw Error("invalid fixture"); changed.text = "绕过文件接口";
  await expect(source.adapter.saveBody(initial, modified, 1)).rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT" } });
  const second = concept(); await source.adapter.mutate({ put: [second] });
  await expect(source.adapter.saveBody(second, initial.body, 1)).rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT" } });
  const value = await source.adapter.exportGraph({ selected: [initial.id], entrypoints: [initial.id], mode: "standalone" });
  const target = session(); await target.adapter.load(); const preview = await target.adapter.previewImport(value);
  await target.adapter.importGraph({ package: value, packageSha256: preview.packageSha256, expectedRevision: preview.revision, conflicts: [], acceptChangedExternals: [] });
  expect((await target.adapter.readConcept(initial.id)).concept).toEqual(initial);
  const guest = session(target.name, "guest"); await guest.adapter.load(); const text = guest.adapter.textFile(initial.id, original.id);
  await text.read(); await expect(text.write("没有权限")).rejects.toMatchObject({ fault: { code: "FORBIDDEN" } });
});
it("synchronizes two Yjs clients through production RPC and retains causal state after reopening", async () => {
  const project = session(), other = session(project.name); await project.adapter.load(); await other.adapter.load();
  const first = newFile("text/plain", "初始", "crdt"), body = { format: "kinship.document" as const, version: 2 as const, roots: [first.id], blocks: [first] };
  const initial = { ...concept(), body }; await project.adapter.mutate({ put: [initial] });
  const a = await YjsFileSession.open(project.adapter.crdtFile(initial.id, first.id), () => {});
  const b = await YjsFileSession.open(other.adapter.crdtFile(initial.id, first.id), () => {});
  const origin = Symbol("client-A"); a.undo.addTrackedOrigin(origin);
  try {
    a.doc.transact(() => a.text.insert(0, "甲"), origin); a.undo.stopCapturing(); await a.flush();
    await vi.waitFor(() => expect(b.text.toString()).toBe("甲初始"), { timeout: 3500 });
    b.text.insert(b.text.length, "乙"); await b.flush();
    await vi.waitFor(() => expect(a.text.toString()).toBe("甲初始乙"), { timeout: 3500 });
    a.undo.undo(); await a.flush();
    await vi.waitFor(() => expect(b.text.toString()).toBe("初始乙"), { timeout: 3500 });
    await project.repository.close(); const reopened = session(project.name);
    const again = await YjsFileSession.open(reopened.adapter.crdtFile(initial.id, first.id), () => {});
    expect(again.text.toString()).toBe("初始乙"); expect(Y.encodeStateVector(again.doc)).toEqual(Y.encodeStateVector(a.doc)); again.destroy();
  } finally { a.destroy(); b.destroy(); }
});
it("validates CRDT boundaries after merge without accepting forbidden text", async () => {
  const { adapter } = session(); await adapter.load(); const file = newFile("text/plain", "原文", "crdt");
  const initial = { ...concept(), body: { format: "kinship.document" as const, version: 2 as const, roots: [file.id], blocks: [file] } };
  await adapter.mutate({ put: [initial] }); const source = adapter.crdtFile(initial.id, file.id), local = new Y.Doc();
  Y.applyUpdate(local, await source.load()); local.getText("text").insert(2, "\n---\n{: #bad}");
  await expect(source.publish(Y.encodeStateAsUpdate(local))).rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT" } });
  expect((await adapter.readConcept(initial.id)).concept.body).toEqual(initial.body);
  const safe = new Y.Doc(); Y.applyUpdate(safe, await source.load()); safe.getText("text").insert(0, "已修正");
  await source.publish(Y.encodeStateAsUpdate(safe)); expect((await adapter.readConcept(initial.id)).version).toBe(2);
  local.destroy(); safe.destroy();
});
it("keeps layout references solely in their file text and preserves content files when ungrouped", async () => {
  const { adapter } = session(); await adapter.load();
  const left = newFile("text/x-kramdown", "左侧原文\n\n"), right = newFile("text/plain", "右侧原文", "crdt");
  const layout = newColumns([left.id, right.id]);
  const initial = { ...concept(), body: { format: "kinship.document" as const, version: 2 as const, roots: [layout.id], blocks: [left, right, layout] } };
  await adapter.mutate({ put: [initial] });
  const file = adapter.textFile(initial.id, layout.id); expect(readLayout(await file.read()).members).toEqual([left.id, right.id]);
  // 缺失引用和重复位置必须整次拒绝，不得写入一半布局或复制文件。
  await expect(file.write(JSON.stringify({ layout: "columns", members: [newId()] }))).rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT" } });
  await expect(file.write(JSON.stringify({ layout: "columns", members: [left.id, left.id] }))).rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT" } });
  expect((await adapter.readConcept(initial.id)).concept).toEqual(initial);
  await file.write(JSON.stringify({ layout: "columns", members: [right.id, left.id] }));
  const grouped = await adapter.readConcept(initial.id), current = grouped.concept.body!;
  expect(current.blocks.filter(block => block.kind === "file")).toEqual([left, right]);
  const changed = structuredClone(current); changed.blocks[2] = { ...layout, version: 2, text: layout.text };
  await expect(adapter.saveBody(grouped.concept, changed, grouped.version)).rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT" } });
  const ungrouped = { ...current, roots: [right.id, left.id], blocks: current.blocks.filter(block => block.id !== layout.id) };
  await adapter.saveBody(grouped.concept, ungrouped, grouped.version);
  expect((await adapter.readConcept(initial.id)).concept.body).toEqual(ungrouped);
  expect(await adapter.textFile(initial.id, left.id).read()).toBe("左侧原文\n\n");
  await expect(file.read()).rejects.toMatchObject({ fault: { code: "NOT_FOUND" } });
  const latest = await adapter.readConcept(initial.id);
  await adapter.saveBody(latest.concept, { ...ungrouped, roots: [], blocks: [] }, latest.version);
  await expect(adapter.textFile(initial.id, left.id).read()).rejects.toMatchObject({ fault: { code: "NOT_FOUND" } });
});
