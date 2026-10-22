/** 真实 internal fetch + 隔离 IDB；验证跨连接/重开后的幂等、冲突和事务失败语义。 */
import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { RpcClient } from "../adapter/rpcClient";
import type { Dispatch } from "../adapter/transport";
import { registry, responseSchema, successSchema } from "../contracts/rpc";
import type { Apply } from "../contracts/commands";
import { parse } from "../contracts/validate";
import { C, newId, type Concept } from "../domain/concepts";
import { splitSettings } from "../domain/presentationState";
import { IndexedDbRepository } from "./indexeddb";
import { buildDataRouter } from "./routes";
import { STORES } from "./workspaceDb";

const repositories: IndexedDbRepository[] = [];
function session(name = "rpc-" + newId(), role: "administrator" | "guest" = "administrator", wrap?: (dispatch: Dispatch) => Dispatch) {
  const repository = new IndexedDbRepository(name, indexedDB, role); repositories.push(repository);
  const dispatch = createInternalDispatch(buildDataRouter(repository));
  return { repository, dispatch, client: new RpcClient(wrap ? wrap(dispatch) : dispatch), name };
}
const concept = (label = "测试概念"): Concept => ({ id: newId(), label, types: [C.concept] });
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(repositories.splice(0).map(repository => repository.close())); });

it("validates the same bootstrap as success and union envelopes, rejects invalid versions/fields without writes", async () => {
  const { dispatch, client } = session();
  const request = { protocol: "kinship.rpc", version: 1, requestId: newId(), params: {} };
  const response = await dispatch(registry.bootstrap.path, request);
  expect(response.status).toBe(200);
  const envelope = parse(successSchema(registry.bootstrap.result), response.body, "INTERNAL_ERROR");
  expect(parse(responseSchema(registry.bootstrap.result), response.body).ok).toBe(true);
  expect(envelope.result.workspaceId).toBe(envelope.context.workspaceId);
  expect(response.headers.get("x-request-id")).toBe(request.requestId);
  for (const [input, code] of [[{ ...request, version: 2 }, "UNSUPPORTED_VERSION"], [{ ...request, actorId: newId() }, "INVALID_REQUEST"],
    [{ ...request, params: { unexpected: true } }, "INVALID_REQUEST"]] as const) {
    const failure = await dispatch(registry.bootstrap.path, input);
    expect(failure.status).toBe(400);
    expect(failure.body).toMatchObject({ ok: false, requestId: request.requestId, error: { code } });
  }
  expect((await client.call("bootstrap", {})).revision).toBe(0);
});

it("persists one logical command across concurrent connections and reopen, rejects ID reuse and exposes status", async () => {
  const first = session(), second = session(first.name);
  const base = await first.client.call("bootstrap", {}); await second.client.call("bootstrap", {});
  const item = concept(), commandId = newId(), params: Apply = { operations: [{ type: "concept.create", concept: item }] };
  const commits = await Promise.all([first.client.call("apply", params, { commandId }), second.client.call("apply", params, { commandId })]);
  expect(commits.filter(commit => !commit.replayed)).toHaveLength(1);
  expect(new Set(commits.map(commit => commit.eventId)).size).toBe(1);
  expect(commits[0]).toMatchObject({ actorId: base.actorId, revision: 1 });
  await first.repository.close(); await second.repository.close();
  const reopened = session(first.name); await reopened.client.call("bootstrap", {});
  expect(await reopened.client.call("apply", params, { commandId })).toMatchObject({ commandId, revision: 1, replayed: true });
  expect(await reopened.client.call("commandStatus", { commandId })).toMatchObject({ state: "committed", commit: { commandId, revision: 1 } });
  expect(await reopened.client.call("commandStatus", { commandId: newId() })).toEqual({ state: "unknown" });
  await expect(reopened.client.call("apply", { operations: [{ type: "concept.create", concept: { ...item, label: "换了内容" } }] }, { commandId }))
    .rejects.toMatchObject({ fault: { code: "IDEMPOTENCY_KEY_REUSED" } });
  const page = await reopened.client.call("events", { after: 0, limit: 1 });
  expect(page).toMatchObject({ revision: 1, nextCursor: 1, hasMore: false });
  expect(page.events).toHaveLength(1);
  expect((await reopened.client.call("bootstrap", {})).concepts.filter(record => record.concept.id === item.id)).toHaveLength(1);
});

it("checks resource versions rather than the whole workspace and rejects stale edits", async () => {
  const first = session(), second = session(first.name); await first.client.call("bootstrap", {}); await second.client.call("bootstrap", {});
  const one = concept("甲"), two = concept("乙");
  await first.client.call("apply", { operations: [one, two].map(item => ({ type: "concept.create", concept: item })) });
  await first.client.call("apply", { operations: [{ type: "concept.updateFields", id: one.id, fields: { label: "甲新" }, expectedVersion: 1 }] });
  await second.client.call("apply", { operations: [{ type: "concept.updateFields", id: two.id, fields: { label: "乙新" }, expectedVersion: 1 }] });
  await expect(second.client.call("apply", { operations: [{ type: "concept.updateFields", id: one.id, fields: { label: "过时覆盖" }, expectedVersion: 1 }] }))
    .rejects.toMatchObject({ fault: { code: "VERSION_CONFLICT", details: { id: one.id, expectedVersion: 1, actualVersion: 2 } } });
  expect((await first.client.call("bootstrap", {})).revision).toBe(3);
});

it("aborts business writes, versions, command result and event when a late store write fails", async () => {
  const { client } = session(); const base = await client.call("bootstrap", {}), item = concept(), commandId = newId();
  const params: Apply = { operations: [{ type: "concept.create", concept: item }] };
  const nativeAdd = IDBObjectStore.prototype.add;
  const injected = vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof nativeAdd>) {
    if (this.name === STORES.events) throw new DOMException("Injected event storage failure", "QuotaExceededError");
    return nativeAdd.apply(this, args);
  });
  await expect(client.call("apply", params, { commandId })).rejects.toMatchObject({ fault: { code: "INTERNAL_ERROR" } });
  injected.mockRestore();
  const after = await client.call("bootstrap", {});
  expect(after.revision).toBe(base.revision); expect(after.concepts.some(record => record.concept.id === item.id)).toBe(false);
  expect(await client.call("commandStatus", { commandId })).toEqual({ state: "unknown" });
  expect((await client.call("events", { after: 0, limit: 10 })).events).toEqual([]);
  expect(await client.call("apply", params, { commandId })).toMatchObject({ revision: 1, replayed: false });
});

it("rolls back the entire multi-operation plan on a dangling relation", async () => {
  const { client } = session(); await client.call("bootstrap", {});
  const item = concept(), relation: Concept = { id: newId(), label: "不完整关系", types: [C.association], participants: [
    { id: newId(), role: C.subject, concept: item.id }, { id: newId(), role: C.object, concept: newId() },
  ] };
  await expect(client.call("apply", { operations: [item, relation].map(value => ({ type: "concept.create", concept: value })) }))
    .rejects.toMatchObject({ fault: { code: "DOMAIN_CONSTRAINT" } });
  const after = await client.call("bootstrap", {}); expect(after.revision).toBe(0);
  expect(after.concepts.some(record => record.concept.id === item.id || record.concept.id === relation.id)).toBe(false);
});

it("stores guest navigation separately, denies shared edits and omits private focus from shared events", async () => {
  const owner = session(), guest = session(owner.name, "guest");
  const base = await owner.client.call("bootstrap", {}); await guest.client.call("bootstrap", {});
  const navigation = await guest.client.call("apply", { operations: [{ type: "viewState.updateFields", fields: { focusId: null }, expectedVersion: base.viewState.version }] });
  expect(navigation.revision).toBe(0);
  expect((await owner.client.call("events", { after: 0, limit: 10 })).events).toHaveLength(0);
  await expect(guest.client.call("apply", { operations: [{ type: "concept.create", concept: concept() }] })).rejects.toMatchObject({ fault: { code: "FORBIDDEN" } });
  const item = concept();
  await owner.client.call("apply", { operations: [{ type: "concept.create", concept: item },
    { type: "viewState.updateFields", fields: { focusId: item.id }, expectedVersion: navigation.changes.viewState!.version }] });
  const page = await owner.client.call("events", { after: 0, limit: 10 }); expect(page.events).toHaveLength(1);
  expect(page.events[0].changes.viewState).toBeUndefined();
  expect(splitSettings((await import("../templates/starter")).starterSettings()).viewState.focusId).toBe(null);
});

it("reports unknown results after a committed response is lost, then safely replays the original ID", async () => {
  let loseNext = true;
  const { client } = session(undefined, "administrator", dispatch => async (path, body, signal) => {
    const response = await dispatch(path, body, signal);
    if (path === registry.apply.path && loseNext) { loseNext = false; throw new Error("connection lost after commit"); }
    return response;
  });
  await client.call("bootstrap", {});
  const commandId = newId(), params: Apply = { operations: [{ type: "concept.create", concept: concept() }] };
  await expect(client.call("apply", params, { commandId })).rejects.toMatchObject({ fault: { code: "RESULT_UNKNOWN", retryable: true, details: { commandId } } });
  expect(await client.call("commandStatus", { commandId })).toMatchObject({ state: "committed" });
  expect(await client.call("apply", params, { commandId })).toMatchObject({ replayed: true, revision: 1 });
  expect((await client.call("events", { after: 0, limit: 10 })).events).toHaveLength(1);
});

it("rejects malformed server responses and preserves command identity for uncertain writes", async () => {
  let corrupt = false;
  const { client } = session(undefined, "administrator", dispatch => async (path, body, signal) => {
    const result = await dispatch(path, body, signal);
    if (corrupt) return { ...result, body: { ok: true } }; return result;
  });
  await client.call("bootstrap", {}); corrupt = true;
  const commandId = newId();
  await expect(client.call("apply", { operations: [{ type: "concept.create", concept: concept() }] }, { commandId }))
    .rejects.toMatchObject({ fault: { code: "RESULT_UNKNOWN", details: { commandId } } });
});
