/** 正文文件通过真实 multipart POST 严格检查原始 UTF-8 和摘要，预览保持只读。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { createHttpAdapter } from "../adapter/api";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { RpcClient } from "../adapter/rpcClient";
import { C, newId, type Concept } from "../domain/concepts";
import { newFile } from "../domain/document";
import { sha256 } from "../format/digest";
import { newColumns, readLayout } from "../sections/layout";
import { registry, type Result } from "../contracts/rpc";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";
const repositories: IndexedDbRepository[] = [];
function session(name = "document-text-file-" + newId()) {
  const repository = new IndexedDbRepository(name, indexedDB, "administrator", "blank"); repositories.push(repository);
  const dispatch = createInternalDispatch(buildDataRouter(repository));
  return { name, repository, dispatch, adapter: createHttpAdapter(dispatch), client: new RpcClient(dispatch) };
}
const concept = (): Concept => ({ id: newId(), label: "文件导入", types: [C.concept], properties: {} });
afterEach(async () => { await Promise.all(repositories.splice(0).map(repository => repository.close())); });
it("previews actual multipart Kramdown files, checks byte metadata, and persists only after explicit apply", async () => {
  const current = session(), { adapter } = current; await adapter.load(); const initial = concept(); await adapter.mutate({ put: [initial] });
  const before = await adapter.load(), bytes = new TextEncoder().encode('---\r\n{: .file title="文件IAL"}\r\n公式 F=ma\r\n\u00a0\r\n\r\n');
  const file = new File([bytes], "高中物理.md", { type: "text/markdown" });
  const result = await adapter.previewDocumentTextFile(initial.id, file, "preserve");
  expect(result.source).toEqual({ name: file.name, size: file.size, sha256: await sha256(file) });
  expect(result.preview).toMatchObject({ added: 1, fallback: 1 });
  expect((await adapter.load()).revision).toBe(before.revision); expect((await adapter.readConcept(initial.id)).concept.body).toBeUndefined();
  await adapter.saveBody(result.preview.target.concept, result.preview.candidate!, result.preview.target.version);
  await current.repository.close(); const reopened = session(current.name); await reopened.adapter.load();
  const saved = await reopened.adapter.readConcept(initial.id);
  expect(saved.concept.body?.blocks[0].sourceIal).toBe('{: .file title="文件IAL"}');
  expect(await reopened.adapter.textFile(initial.id, saved.concept.body!.blocks[0].id).read()).toBe("公式 F=ma\n\u00a0\n\n");
});
it("rejects malformed UTF-8 instead of inserting replacement characters or writing a preview", async () => {
  const { adapter } = session(); await adapter.load(); const initial = concept(); await adapter.mutate({ put: [initial] });
  const before = await adapter.load();
  for (const bytes of [[0xff], [0xc3, 0x28], [0xed, 0xa0, 0x80], [0xf0, 0x9f]]) {
    await expect(adapter.previewDocumentTextFile(initial.id, new File([new Uint8Array(bytes)], "坏编码.md"), "copy"))
      .rejects.toMatchObject({ fault: { code: "INVALID_REQUEST", message: expect.stringContaining("UTF-8") } });
  }
  expect(await adapter.load()).toEqual(before);
  const valid = await adapter.previewDocumentTextFile(initial.id, new File(["\uFEFF有效\uFFFD😀\n"], "Unicode.txt"), "copy");
  expect(valid.preview.candidate?.blocks[0]).toMatchObject({ text: "\uFEFF有效\uFFFD😀\n" });
});
it("checks multipart names, sizes, raw hashes, and actual stream limits independently from UI validation", async () => {
  const { adapter, client } = session(); await adapter.load(); await client.call("bootstrap", {});
  const initial = concept(); await adapter.mutate({ put: [initial] }); const before = await adapter.load();
  const file = new File(["F=ma\n"], "物理.md"), params = { id: initial.id, identity: "copy" as const, name: file.name, size: file.size, sha256: await sha256(file) };
  for (const mismatch of [{ name: "different.md" }, { size: file.size - 1 }, { sha256: "0".repeat(64) }]) {
    await expect(client.call("previewDocumentTextFile", { ...params, ...mismatch }, { file }))
      .rejects.toMatchObject({ fault: { code: "INVALID_REQUEST" } });
  }
  const large = new File(["x".repeat(1048577)], "large.md");
  await expect(adapter.previewDocumentTextFile(initial.id, large, "copy")).rejects.toMatchObject({ fault: { code: "PAYLOAD_TOO_LARGE" } });
  // 绕过客户端的大小检查：服务仍对真实 multipart 的文件字节计数，不相信声明。
  await expect(client.call("previewDocumentTextFile", { ...params, name: large.name, size: 1 }, { file: large }))
    .rejects.toMatchObject({ fault: { code: "PAYLOAD_TOO_LARGE" } });
  await expect(client.call("previewDocumentTextFile", params)).rejects.toMatchObject({ fault: { code: "INVALID_REQUEST" } });
  expect(await adapter.load()).toEqual(before);
});
it("accepts zero-byte files as zero sections and distinguishes an explicitly empty file envelope", async () => {
  const { adapter } = session(); await adapter.load(); const initial = concept(); await adapter.mutate({ put: [initial] });
  const empty = await adapter.previewDocumentTextFile(initial.id, new File([], "empty.md"), "preserve");
  expect(empty.source.size).toBe(0); expect(empty.preview.added).toBe(0); expect(empty.preview.candidate?.blocks).toEqual([]);
  const explicit = await adapter.previewDocumentTextFile(initial.id, new File(["---\n{:}\n"], "empty-section.md"), "preserve");
  expect(explicit.preview.added).toBe(1); expect(explicit.preview.candidate?.blocks[0]).toMatchObject({ mode: "whole-file", text: "" });
  expect((await adapter.readConcept(initial.id)).concept.body).toBeUndefined();
});
it("reimports downloaded bytes with explicit identity decisions and rewrites copied layout references", async () => {
  const { adapter } = session(); await adapter.load(); const a = newFile("text/x-kramdown", "保留尾空行\n\n"), b = newFile("text/plain", "协作文本", "crdt"), layout = newColumns([a.id, b.id]);
  const initial = { ...concept(), body: { format: "kinship.document" as const, version: 2 as const, roots: [layout.id], blocks: [a, b, layout] } };
  await adapter.mutate({ put: [initial] }); const exported = await adapter.exportDocumentText(initial.id), file = new File([exported.text], "downloaded.md");
  const blocked = await adapter.previewDocumentTextFile(initial.id, file, "preserve");
  expect(blocked.preview.collisions).toHaveLength(3); expect(blocked.preview.candidate).toBeNull();
  const copied = await adapter.previewDocumentTextFile(initial.id, file, "copy");
  expect(copied.source).toEqual(blocked.source); expect(copied.preview.collaborative).toBe(1);
  await adapter.saveBody(copied.preview.target.concept, copied.preview.candidate!, copied.preview.target.version);
  const result = (await adapter.readConcept(initial.id)).concept.body!, newLayout = result.blocks.find(block => block.kind === "layout" && block.id !== layout.id)!;
  expect(result.roots).toEqual([layout.id, newLayout.id]);
  expect(readLayout(newLayout.mode === "whole-file" ? newLayout.text : "").members.every(id => !initial.body.blocks.some(old => old.id === id))).toBe(true);
  const copiedFile = result.blocks.find(block => block.kind === "file" && block.mode === "whole-file" && block.id !== a.id)!;
  expect(await adapter.textFile(initial.id, copiedFile.id).read()).toBe("保留尾空行\n\n");
  expect(result.blocks.slice(0, 3)).toEqual(initial.body.blocks);
});
it("rejects forged source acknowledgments and preview targets before exposing an import candidate", async () => {
  const current = session(); await current.adapter.load(); const initial = concept(); await current.adapter.mutate({ put: [initial] });
  let mismatch: "name" | "size" | "hash" | "target" = "name";
  const adapter = createHttpAdapter(async (path, body, signal) => {
    const reply = await current.dispatch(path, body, signal);
    if (path !== registry.previewDocumentTextFile.path) return reply;
    const spoof = structuredClone(reply.body) as { result: Result<"previewDocumentTextFile"> };
    if (mismatch === "name") spoof.result.source.name = "another.md";
    if (mismatch === "size") spoof.result.source.size++;
    if (mismatch === "hash") spoof.result.source.sha256 = "0".repeat(64);
    if (mismatch === "target") spoof.result.preview.target.concept.id = newId();
    return { ...reply, body: spoof };
  });
  await adapter.load(); const file = new File(["原文件"], "source.md");
  for (const value of ["name", "size", "hash", "target"] as const) {
    mismatch = value;
    await expect(adapter.previewDocumentTextFile(initial.id, file, "copy")).rejects.toMatchObject({ fault: { code: "INTERNAL_ERROR" } });
  }
  expect((await current.adapter.readConcept(initial.id)).concept.body).toBeUndefined();
});
