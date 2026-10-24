/** 文本转换跨真实 POST/RPC/IDB 验收，复用正文结构 CAS，不引入第二提交入口。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { createHttpAdapter } from "../adapter/api";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { C, newId, type Concept } from "../domain/concepts";
import { fileText, newFile } from "../domain/document";
import { newColumns, readLayout } from "../sections/layout";
import { registry, type Role } from "../contracts/rpc";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";
const repositories: IndexedDbRepository[] = [];
function session(name = "document-text-" + newId(), role: Role = "administrator") {
  const repository = new IndexedDbRepository(name, indexedDB, role, "blank"); repositories.push(repository);
  const dispatch = createInternalDispatch(buildDataRouter(repository));
  return { name, repository, dispatch, adapter: createHttpAdapter(dispatch) };
}
const concept = (): Concept => ({ id: newId(), label: "物理笔记", types: [C.concept], properties: {} });
afterEach(async () => { await Promise.all(repositories.splice(0).map(repository => repository.close())); });
it("previews without writes, appends exact text and foreign metadata atomically, then reopens and archives it", async () => {
  const current = session(), { adapter } = current; await adapter.load(); const initial = concept(); await adapter.mutate({ put: [initial] });
  const text = "---\n{: #anchor .unregistered title='外来属性'}\n牛顿第二定律 F=ma\n\u00a0\n\n";
  const before = await adapter.load(), preview = await adapter.previewDocumentText({ id: initial.id, text, identity: "preserve" });
  expect((await adapter.load()).revision).toBe(before.revision);
  expect((await adapter.readConcept(initial.id)).concept.body).toBeUndefined();
  expect(preview).toMatchObject({ added: 1, fallback: 1, collisions: [] }); expect(preview.candidate).not.toBeNull();
  const candidate = preview.candidate!, file = candidate.blocks[0];
  const result = await adapter.saveBody(preview.target.concept, candidate, preview.target.version, { commandId: newId() });
  expect(result.changes.put[0].concept.body).toEqual(candidate);
  const history = await adapter.historyList({ limit: 10 }), detail = await adapter.historyConcept(history.events[0].eventId, initial.id);
  expect(detail.before?.concept.body).toBeUndefined(); expect(detail.after?.concept.body).toEqual(candidate);
  await current.repository.close(); const reopened = session(current.name); await reopened.adapter.load();
  expect(await reopened.adapter.textFile(initial.id, file.id).read()).toBe("牛顿第二定律 F=ma\n\u00a0\n\n");
  const saved = await reopened.adapter.readConcept(initial.id);
  expect(saved.concept.body?.blocks[0].sourceIal).toBe("{: #anchor .unregistered title='外来属性'}");
  const exported = await reopened.adapter.exportDocumentText(initial.id);
  expect(exported.text).toContain(`file-id="${file.id}"`); expect(exported.text.endsWith("\u00a0\n\n")).toBe(true);
  // JSON 图谱包依然保留文本封套元数据，文本并不是其唯一往返途径。
  const graphPackage = await reopened.adapter.exportGraph({ selected: [initial.id], entrypoints: [initial.id], mode: "standalone" });
  const target = session(); await target.adapter.load(); const checked = await target.adapter.previewImport(graphPackage);
  await target.adapter.importGraph({ package: graphPackage, packageSha256: checked.packageSha256, expectedRevision: checked.revision, conflicts: [], acceptChangedExternals: [] });
  expect((await target.adapter.readConcept(initial.id)).concept.body).toEqual(candidate);
});
it("blocks occupied identities and tombstones; an explicit copy rekeys nested layouts and keeps source files", async () => {
  const { adapter } = session(); await adapter.load();
  const a = newFile("text/x-kramdown", "左侧\n\n"), b = newFile("text/plain", "右侧", "crdt"), layout = newColumns([a.id, b.id]);
  const initial = { ...concept(), body: { format: "kinship.document" as const, version: 2 as const, roots: [layout.id], blocks: [a, b, layout] } };
  await adapter.mutate({ put: [initial] }); const exported = await adapter.exportDocumentText(initial.id);
  expect(exported.collaborative).toBe(1);
  const blocked = await adapter.previewDocumentText({ id: initial.id, text: exported.text, identity: "preserve" });
  expect(blocked.candidate).toBeNull(); expect(new Set(blocked.collisions)).toEqual(new Set([a.id, b.id, layout.id]));
  const copy = await adapter.previewDocumentText({ id: initial.id, text: exported.text, identity: "copy" });
  expect(copy.collisions).toEqual([]); expect(copy.candidate?.blocks).toHaveLength(6);
  const copied = copy.candidate!.blocks.filter(block => !initial.body.blocks.some(old => old.id === block.id)), copiedLayout = copied.find(block => block.kind === "layout")!;
  expect(readLayout(fileText(copiedLayout)).members).toEqual(copied.filter(block => block.kind === "file").map(block => block.id));
  await adapter.saveBody(copy.target.concept, copy.candidate!, copy.target.version);
  expect((await adapter.readConcept(initial.id)).concept.body?.blocks.slice(0, 3)).toEqual(initial.body.blocks);
  const fresh = await adapter.readConcept(initial.id);
  await adapter.saveBody(fresh.concept, { format: "kinship.document", version: 2, roots: [], blocks: [] }, fresh.version);
  const tombstones = await adapter.previewDocumentText({ id: initial.id, text: exported.text, identity: "preserve" });
  expect(tombstones.collisions).toHaveLength(3); expect(tombstones.candidate).toBeNull();
});
it("rejects malformed input with source lines, stale previews, and guest writes without changing saved text", async () => {
  const current = session(), { adapter } = current; await adapter.load(); const initial = concept(); await adapter.mutate({ put: [initial] });
  await expect(adapter.previewDocumentText({ id: initial.id, text: '---\n{: file-id="bad"}', identity: "copy" })).rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT", message: expect.stringContaining("第 2 行") } });
  const preview = await adapter.previewDocumentText({ id: initial.id, text: "第一份文本\n", identity: "preserve" });
  await adapter.mutate({ put: [{ ...initial, label: "预览后更名" }] });
  await expect(adapter.saveBody(preview.target.concept, preview.candidate!, preview.target.version)).rejects.toMatchObject({ fault: { code: "VERSION_CONFLICT" } });
  const guest = session(current.name, "guest"); await guest.adapter.load();
  const read = await guest.adapter.previewDocumentText({ id: initial.id, text: "游客的预览", identity: "preserve" });
  await expect(guest.adapter.saveBody(read.target.concept, read.candidate!, read.target.version)).rejects.toMatchObject({ fault: { code: "FORBIDDEN" } });
  expect((await adapter.readConcept(initial.id)).concept.body).toBeUndefined();
});
it("keeps the exact imported identities when a committed response is lost and retried", async () => {
  const current = session(); await current.adapter.load(); const initial = concept(); await current.adapter.mutate({ put: [initial] }); let lose = true;
  const adapter = createHttpAdapter(async (path, body, signal) => {
    const result = await current.dispatch(path, body, signal);
    if (path === registry.apply.path && lose) { lose = false; throw Error("lost response"); } return result;
  });
  await adapter.load(); const preview = await adapter.previewDocumentText({ id: initial.id, text: "一次导入", identity: "copy" }), commandId = newId();
  await expect(adapter.saveBody(preview.target.concept, preview.candidate!, preview.target.version, { commandId })).rejects.toMatchObject({ fault: { code: "RESULT_UNKNOWN" } });
  const retry = await adapter.saveBody(preview.target.concept, preview.candidate!, preview.target.version, { commandId });
  expect(retry.replayed).toBe(true); expect(retry.changes.put[0].concept.body).toEqual(preview.candidate);
  expect((await adapter.readConcept(initial.id)).concept.body?.blocks).toHaveLength(1);
});
it("rejects forged preview targets and a candidate that silently drops existing files", async () => {
  const current = session(); await current.adapter.load(); const original = newFile(), initial = { ...concept(), body: { format: "kinship.document" as const, version: 2 as const, roots: [original.id], blocks: [original] } };
  await current.adapter.mutate({ put: [initial] }); let mode: "target" | "drop" = "target";
  const adapter: ReturnType<typeof createHttpAdapter> = createHttpAdapter(async (path, body, signal) => {
    const result = await current.dispatch(path, body, signal);
    if (path !== registry.previewDocumentText.path) return result;
    const spoof = structuredClone(result.body) as { result: Awaited<ReturnType<typeof adapter.previewDocumentText>> };
    if (mode === "target") spoof.result.target.concept.id = newId();
    else { spoof.result.candidate!.roots = []; spoof.result.candidate!.blocks = []; }
    return { ...result, body: spoof };
  });
  await adapter.load(); const params = { id: initial.id, text: "追加文本", identity: "copy" as const };
  await expect(adapter.previewDocumentText(params)).rejects.toMatchObject({ fault: { code: "INTERNAL_ERROR" } });
  mode = "drop"; await expect(adapter.previewDocumentText(params)).rejects.toMatchObject({ fault: { code: "INTERNAL_ERROR" } });
  expect((await current.adapter.readConcept(initial.id)).concept).toEqual(initial);
});
