/** 显式删除只移除一个已核对的概念；引用不级联，个人导航清理与墓碑/历史一并提交。 */
import type { Operation, Commit } from "../contracts/commands";
import type { Request, Role } from "../contracts/rpc";
import { fail } from "../contracts/errors";
import { readDeletionState, deletionPreview } from "./deletionQuery";
import { executeCommand } from "./commandTransaction";
import { findCommittedCommand } from "./commandReplay";
export async function executeDeletion(db: IDBDatabase, input: Request<"deleteConcept">, role: Role, fingerprint: string): Promise<Commit> {
  if (role === "guest") fail("FORBIDDEN", "当前空间角色不能删除共享内容");
  const replay = () => findCommittedCommand(db, input.workspaceId, input.commandId, fingerprint);
  const previous = await replay();
  if (previous) return previous;
  try {
    const { id, expectedVersion, expectedRevision, expectedViewStateVersion } = input.params;
    const snapshot = await readDeletionState(db, input.workspaceId), preview = deletionPreview(id, snapshot.value, snapshot.context);
    if (preview.revision !== expectedRevision || preview.target.version !== expectedVersion || preview.viewStateVersion !== expectedViewStateVersion)
      fail("VERSION_CONFLICT", "删除预览已过期，请重新检查引用");
    if (!preview.canDelete) fail("REFERENCE_CONFLICT", "概念仍被引用，不能删除", { id, count: preview.blockers.length });
    const personal = snapshot.value.navigation.find(nav => nav.id === snapshot.value.actorId)!;
    const operations: Operation[] = [{ type: "concept.deleteUnreferenced", id, expectedVersion }];
    if (preview.clearFocus || preview.removeExpanded) operations.push({ type: "viewState.updateFields", expectedVersion: expectedViewStateVersion,
      fields: { ...(preview.clearFocus ? { focusId: null } : {}),
        ...(preview.removeExpanded ? { expandedRelations: personal.data.expandedRelations.filter(value => value !== id) } : {}) } });
    return await executeCommand(db, { workspaceId: input.workspaceId, commandId: input.commandId, fingerprint, role,
      params: { operations }, expectedRevision, expectedViewStateVersion });
  } catch (error) {
    const concurrent = await replay();
    if (concurrent) return concurrent;
    throw error;
  }
}
