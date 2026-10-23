import { afterEach, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { ProjectRepository } from "./projectRepository";
import { buildProjectRouter } from "./projectRoutes";
import { createInternalDispatch } from "../adapter/internalDispatch";
import { createProjectAdapter } from "../adapter/projects";
import { newId } from "../domain/concepts";
import { projectRegistry } from "../contracts/projects";
const repositories: ProjectRepository[] = [];
afterEach(async () => { await Promise.all(repositories.splice(0).map(repository => repository.close())); });
function fixture() {
  const repository = new ProjectRepository({ factory: new IDBFactory(), catalogName: newId() }); repositories.push(repository);
  const dispatch = createInternalDispatch(buildProjectRouter(repository));
  const adapter = createProjectAdapter(dispatch, async () => { throw new Error("unused"); });
  return { repository, dispatch, adapter };
}
it("rejects malformed project RPC and missing project identities without changing catalog", async () => {
  const { adapter, dispatch } = fixture(), before = await adapter.load();
  for (const damage of [{ version: 2 }, { extra: true }]) {
    const response = await dispatch(projectRegistry.apply.path, { protocol: "kinship.rpc", version: 1, requestId: newId(),
      catalogId: before.catalogId, commandId: newId(), params: { type: "project.select", id: newId() }, ...damage });
    expect(response.status).toBe(400);
  }
  await expect(adapter.execute({ type: "project.select", id: newId() }, newId())).rejects.toMatchObject({ fault: { code: "NOT_FOUND" } });
  await expect(adapter.execute({ type: "project.create", id: newId(), name: "   " }, newId())).rejects.toMatchObject({ fault: { code: "INVALID_REQUEST" } });
  expect(await adapter.load()).toEqual(before);
});
it("treats a committed but corrupted project response as unknown and safely replays the original command", async () => {
  const { adapter: honest, dispatch } = fixture();
  const corrupt = createProjectAdapter(async (path, body, signal) => {
    const reply = await dispatch(path, body, signal);
    if (path !== projectRegistry.apply.path || reply.status !== 200) return reply;
    const changed = structuredClone(reply.body) as { result: { commandId: string } }; changed.result.commandId = newId();
    return { ...reply, body: changed };
  }, async () => { throw new Error("unused"); });
  await corrupt.load(); const operation = { type: "project.create" as const, id: newId(), name: "结果不明" }, commandId = newId();
  await expect(corrupt.execute(operation, commandId)).rejects.toMatchObject({ fault: { code: "RESULT_UNKNOWN" } });
  expect((await honest.execute(operation, commandId)).replayed).toBe(true);
  expect((await honest.load()).projects.filter(project => project.id === operation.id)).toHaveLength(1);
});
