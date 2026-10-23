/** 删除响应也要关联到目标UUID及看到的版本；可解析的错误目标仍是协议失败。 */
import type { Request } from "../contracts/rpc";
import type { DeletePreview } from "../contracts/deletion";
import type { Commit } from "../contracts/commands";
export function verifyDeletePreview(result: DeletePreview, id: string, context: { workspaceId: string; revision: number }): void {
  if (result.workspaceId !== context.workspaceId || result.revision !== context.revision || result.target.concept.id !== id
    || result.canDelete !== (result.blockers.length === 0)) throw new Error("delete preview context mismatch");
}
export function verifyDeletion(commit: Commit, params: Request<"deleteConcept">["params"]): void {
  if (commit.revision !== params.expectedRevision + 1 || commit.changes.removed.length !== 1
    || commit.changes.removed[0].id !== params.id || commit.changes.removed[0].version !== params.expectedVersion + 1
    || commit.changes.put.length || commit.changes.presentation || commit.changes.media?.length || commit.changes.removedMedia?.length
    || (commit.changes.viewState && commit.changes.viewState.version !== params.expectedViewStateVersion + 1))
    throw new Error("delete commit target mismatch");
}
