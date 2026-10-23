/** 导出走真实DataAdapter→POST RPC→一致数据库快照；校验失败不产生业务提交。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it } from "vitest";
import { createHttpAdapter } from "../adapter/api";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { registry, successSchema } from "../contracts/rpc";
import { parse } from "../contracts/validate";
import { newId } from "../domain/concepts";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";

const repositories: IndexedDbRepository[] = [];
function session() {
  const repository = new IndexedDbRepository("package-" + newId()); repositories.push(repository);
  const dispatch = createInternalDispatch(buildDataRouter(repository));
  return { dispatch, adapter: createHttpAdapter(dispatch) };
}
afterEach(async () => { await Promise.all(repositories.splice(0).map(repository => repository.close())); });
it("exports from the saved source revision without mutations, and enforces workspace identity and budgets", async () => {
  const { adapter, dispatch } = session(), before = await adapter.load();
  const id = before.concepts.find(concept => concept.label === "三人共同整理史料")!.id;
  const params = { selected: [id], entrypoints: [id], mode: "standalone" as const };
  const value = await adapter.exportGraph(params);
  expect(value.source.revision).toBe(before.revision);
  expect(value.concepts.find(record => record.concept.id === id)!.concept.participants).toHaveLength(3);
  expect(await adapter.load()).toEqual(before);
  await expect(adapter.exportGraph({ ...params, maxRecords: 1 })).rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT" } });
  const reply = await dispatch(registry.exportGraph.path, { protocol: "kinship.rpc", version: 1, requestId: newId(), workspaceId: newId(), params });
  expect(reply.status).toBe(404); expect(await adapter.load()).toEqual(before);
});
for (const damage of ["context", "digest"] as const) it(`rejects a structurally valid exported response with invalid ${damage}`, async () => {
  const { dispatch } = session();
  const adapter = createHttpAdapter(async (path, body, signal) => {
    const response = await dispatch(path, body, signal);
    if (path !== registry.exportGraph.path || response.status !== 200) return response;
    const envelope = structuredClone(parse(successSchema(registry.exportGraph.result), response.body));
    if (damage === "context") envelope.result.source.revision++;
    else envelope.result.concepts[0].concept.label = "传输后被改动";
    return { ...response, body: envelope };
  });
  const before = await adapter.load(), id = before.settings.focusId!;
  await expect(adapter.exportGraph({ selected: [id], entrypoints: [id], mode: "standalone" })).rejects.toMatchObject({ fault: { code: "INTERNAL_ERROR" } });
});
