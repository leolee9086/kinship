/** 导入沿用统一事务/幂等/历史实现；预览后到提交之间的并发变化在写事务内再检查。 */
import type { Commit } from "../contracts/commands";
import type { Request, Role } from "../contracts/rpc";
import { fail } from "../contracts/errors";
import { previewImport } from "../domain/importPreview";
import { importCommands } from "../domain/importCommands";
import { readGraphPackage } from "../format/graphPackage";
import { executeCommand } from "./commandTransaction";
import { readImportTarget } from "./importQuery";
import { scopedQuery } from "./workspaceQueries";
import { STORES as S, type SavedCommand } from "./workspaceDb";

async function readReplay(db: IDBDatabase, input: Request<"importGraph">, fingerprint: string): Promise<Commit | undefined> {
  const reply = await scopedQuery<SavedCommand | undefined>(db, input.workspaceId, [S.commands], (tx, state, done) => {
    const request = tx.objectStore(S.commands).get([state.actorId, input.commandId]);
    request.onsuccess = () => done(request.result as SavedCommand | undefined);
  });
  if (!reply.value) return undefined;
  if (reply.value.fingerprint !== fingerprint) fail("IDEMPOTENCY_KEY_REUSED", "同一命令 ID 不能用于另一份导入内容");
  return { ...reply.value.commit, replayed: true };
}

export async function executeImport(db: IDBDatabase, input: Request<"importGraph">, role: Role, fingerprint: string): Promise<Commit> {
  if (role === "guest") fail("FORBIDDEN", "当前空间角色不能导入共享内容");
  // 已提交的重放不能先被新的目标修订/墓碑阻止；不同内容复用commandId仍明确失败。
  const previous = await readReplay(db, input, fingerprint);
  if (previous) return previous;
  try {
    const value = await readGraphPackage(input.params.package), snapshot = await readImportTarget(db, input.workspaceId);
    const preview = await previewImport(value, snapshot.value, snapshot.context);
    const operations = importCommands(input.params, preview, snapshot.value);
    return await executeCommand(db, { workspaceId: input.workspaceId, commandId: input.commandId, fingerprint, role,
      params: { operations }, expectedRevision: input.params.expectedRevision,
      importSource: { packageId: value.id, packageSha256: preview.packageSha256, source: value.source },
    });
  } catch (cause) {
    // 另一个连接可能在首次查重之后已提交同一命令；预览过期不能遮住其成功结果。
    const concurrent = await readReplay(db, input, fingerprint);
    if (concurrent) return concurrent;
    throw cause;
  }
}
