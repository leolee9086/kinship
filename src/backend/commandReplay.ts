/** 预检之前及预检失败之后都查持久结果：并发完成的原命令不能被旧预览遮住。 */
import type { Commit } from "../contracts/commands";
import { fail } from "../contracts/errors";
import { scopedQuery } from "./workspaceQueries";
import { STORES as S, type SavedCommand } from "./workspaceDb";
export async function findCommittedCommand(db: IDBDatabase, workspaceId: string, commandId: string, fingerprint: string): Promise<Commit | undefined> {
  const reply = await scopedQuery<SavedCommand | undefined>(db, workspaceId, [S.commands], (tx, state, done) => {
    const request = tx.objectStore(S.commands).get([state.actorId, commandId]);
    request.onsuccess = () => done(request.result as SavedCommand | undefined);
  });
  if (!reply.value) return undefined;
  if (reply.value.fingerprint !== fingerprint) fail("IDEMPOTENCY_KEY_REUSED", "同一命令 ID 不能用于另一份内容");
  return { ...reply.value.commit, replayed: true };
}
