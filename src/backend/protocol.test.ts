/** 协议负例、分页与媒体完整性；不依赖网络或真实个人数据库。 */
import "fake-indexeddb/auto";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { afterEach, expect, it, vi } from "vitest";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { createHttpAdapter } from "../adapter/api";
import { RpcClient } from "../adapter/rpcClient";
import { registry } from "../contracts/rpc";
import { contractCatalog } from "../contracts/catalog";
import { newId, C } from "../domain/concepts";
import { sha256 } from "../format/digest";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";
import { MAX_JSON_BYTES } from "./requestBody";
import { STORES } from "./workspaceDb";

const repositories: IndexedDbRepository[] = [];
function session() {
  const repository = new IndexedDbRepository("protocol-" + newId()); repositories.push(repository);
  const dispatch = createInternalDispatch(buildDataRouter(repository));
  return { repository, dispatch, client: new RpcClient(dispatch), adapter: createHttpAdapter(dispatch) };
}
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(repositories.splice(0).map(repository => repository.close())); });
it("exports self-contained standard schemas that compile without TypeBox", () => {
  const catalog = contractCatalog(), ajv = new Ajv({ strict: true }); addFormats(ajv);
  for (const definition of catalog.definitions) ajv.addSchema(definition);
  ajv.compile(catalog.failure);
  for (const contract of Object.values(catalog.methods)) {
    expect(contract.method).toBe("POST"); expect(contract.path).toMatch(/^\/rpc\/v1\//);
    ajv.compile(contract.request); ajv.compile(contract.result);
  }
});
it("rejects oversized JSON and spoofed identity without incrementing revision", async () => {
  const { client, dispatch } = session(); const base = await client.call("bootstrap", {});
  const input = { protocol: "kinship.rpc", version: 1, requestId: newId(), commandId: newId(), workspaceId: base.workspaceId,
    params: { operations: [{ type: "concept.create", concept: { id: newId(), label: "巨量", types: [C.concept], description: "x".repeat(MAX_JSON_BYTES) } }] } };
  expect((await dispatch(registry.apply.path, input)).body).toMatchObject({ ok: false, error: { code: "PAYLOAD_TOO_LARGE" } });
  expect((await dispatch(registry.apply.path, { ...input, actorId: newId(), params: { operations: [] } })).body)
    .toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
  await expect(client.call("events", { after: 1, limit: 1 })).rejects.toMatchObject({ fault: { code: "CURSOR_EXPIRED" } });
  expect((await client.call("bootstrap", {})).revision).toBe(0);
});
it("paginates shared events in commit order with a resumable cursor", async () => {
  const { client } = session(); await client.call("bootstrap", {});
  for (let n = 0; n < 3; n++) await client.call("apply", { operations: [{ type: "concept.create", concept: { id: newId(), label: String(n), types: [C.concept] } }] });
  const one = await client.call("events", { after: 0, limit: 2 });
  expect(one.events.map(event => event.revision)).toEqual([1, 2]); expect(one.hasMore).toBe(true);
  const two = await client.call("events", { after: one.nextCursor, limit: 2 });
  expect(two.events.map(event => event.revision)).toEqual([3]); expect(two.hasMore).toBe(false);
});
it("reserves deleted UUIDs and prevents an old create from reviving them", async () => {
  const { client } = session(); await client.call("bootstrap", {});
  const item = { id: newId(), label: "稳定身份", types: [C.concept] };
  const commandId = newId(), creation = { operations: [{ type: "concept.create" as const, concept: item }] };
  await client.call("apply", creation, { commandId });
  await client.call("apply", { operations: [{ type: "concept.deleteUnreferenced", id: item.id, expectedVersion: 1 }] });
  await expect(client.call("apply", creation)).rejects.toMatchObject({ fault: { code: "VERSION_CONFLICT" } });
  expect(await client.call("apply", creation, { commandId })).toMatchObject({ revision: 1, replayed: true });
  expect((await client.call("bootstrap", {})).concepts.some(record => record.concept.id === item.id)).toBe(false);
});
it("reads navigation from its reference closure instead of scanning the concept store", async () => {
  const { client } = session(); const base = await client.call("bootstrap", {});
  const calls: string[] = [], original = IDBObjectStore.prototype.getAll;
  vi.spyOn(IDBObjectStore.prototype, "getAll").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
    calls.push(this.name); return original.apply(this, args);
  });
  await client.call("apply", { operations: [{ type: "viewState.updateFields", expectedVersion: base.viewState.version, fields: { focusId: null } }] });
  expect(calls).not.toContain(STORES.concepts); expect(calls).not.toContain(STORES.identities);
});
it("checks multipart bytes, replays media uploads, and rejects binary corruption", async () => {
  const { client, dispatch } = session(); await client.call("bootstrap", {});
  const file = new File(["media bytes"], "image.png", { type: "image/png" }), id = newId(), commandId = newId();
  const params = { id, name: file.name, type: file.type, size: file.size, sha256: await sha256(file) };
  const first = await client.call("upload", params, { file, commandId });
  expect(await client.call("upload", params, { file, commandId })).toMatchObject({ replayed: true, eventId: first.eventId });
  await expect(client.call("upload", { ...params, id: newId(), sha256: "0".repeat(64) }, { file }))
    .rejects.toMatchObject({ fault: { code: "INVALID_REQUEST" } });
  const damaged = new RpcClient(async (path, body, signal) => {
    const response = await dispatch(path, body, signal);
    if (path === registry.mediaContent.path) return { ...response, body: new Blob(["damaged!"], { type: "image/png" }) };
    return response;
  });
  await damaged.call("bootstrap", {});
  await expect(damaged.call("mediaContent", { id })).rejects.toMatchObject({ fault: { code: "INTERNAL_ERROR" } });
});
