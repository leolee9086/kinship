/** 文件通过multipart到后端解析；坏编码/字节/内容摘要都不能变成可提交的预览。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { createHttpAdapter } from "../adapter/api";
import { RpcClient } from "../adapter/rpcClient";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { newId } from "../domain/concepts";
import { writeGraphPackage } from "../format/graphPackage";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";
const repositories: IndexedDbRepository[] = [];
function session() {
  const repository = new IndexedDbRepository("import-file-" + newId()); repositories.push(repository);
  const transport = createInternalDispatch(buildDataRouter(repository));
  return { adapter: createHttpAdapter(transport), client: new RpcClient(transport) };
}
afterEach(async () => { await Promise.all(repositories.splice(0).map(repository => repository.close())); });
it("previews an actual UTF-8 file without writing workspace data", async () => {
  const { adapter } = session(), before = await adapter.load(), id = before.settings.focusId!;
  const value = await adapter.exportGraph({ selected: [id], entrypoints: [id], mode: "standalone" });
  const result = await adapter.previewImportFile(new File([await writeGraphPackage(value)], "中文图谱.json", { type: "application/json" }));
  expect(result.package).toEqual(value); expect(result.preview.concepts.every(item => item.action === "identical")).toBe(true);
  expect(await adapter.load()).toEqual(before);
});
it("rejects invalid UTF-8 and changed content hashes without changing the database", async () => {
  const { adapter } = session(), before = await adapter.load(), id = before.settings.focusId!;
  await expect(adapter.previewImportFile(new File([new Uint8Array([0xff])], "坏编码.json"))).rejects.toMatchObject({ fault: { code: "INVALID_REQUEST" } });
  const value = await adapter.exportGraph({ selected: [id], entrypoints: [id], mode: "standalone" });
  value.concepts[0].concept.label += "篡改";
  await expect(adapter.previewImportFile(new File([JSON.stringify(value)], "篡改.json"))).rejects.toMatchObject({ fault: { code: "INVALID_REQUEST" } });
  expect(await adapter.load()).toEqual(before);
});
it("checks raw file bytes against multipart metadata, not just filename", async () => {
  const { client } = session(); await client.call("bootstrap", {});
  const file = new File(["{}"], "错误字节摘要.json");
  await expect(client.call("previewImportFile", { name: file.name, size: file.size, sha256: "0".repeat(64) }, { file })).rejects.toMatchObject({ fault: { code: "INVALID_REQUEST" } });
});
