/** 业务对象、幂等结果、历史与事件在同一 IDB 事务中提交；只在 oncomplete 成功返回。 */
import { CommitSchema, type Apply, type Commit } from "../contracts/commands";
import { parse } from "../contracts/validate";
import type { Role } from "../contracts/rpc";
import { fail, RpcError } from "../contracts/errors";
import { newId, type StoredMedia } from "../domain/concepts";
import { planCommand, type PlanInput } from "./commandPlan";
import { checkVersion } from "./versions";
import { readPlanInput } from "./planInput";
import { STORES as S, WRITE_STORES, type HistoryEntry, type IdentityRecord,
  type SavedCommand, type WorkspaceState } from "./workspaceDb";

export interface CommandExecution { workspaceId: string; commandId: string; fingerprint: string; params: Apply; role: Role;
  attachment?: StoredMedia }
export function executeCommand(db: IDBDatabase, input: CommandExecution): Promise<Commit> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WRITE_STORES, "readwrite", { durability: "strict" });
    let result: Commit, cause: unknown;
    const abort = (error: unknown) => { cause = error; tx.abort(); };
    const stateRequest = tx.objectStore(S.state).get("workspace");
    stateRequest.onsuccess = () => {
      try {
        const state = stateRequest.result as WorkspaceState;
        if (!state || state.workspaceId !== input.workspaceId) fail("NOT_FOUND", "工作区不存在");
        if (input.role === "guest" && input.params.operations.some(op => op.type !== "viewState.updateFields")) fail("FORBIDDEN", "当前空间角色不能编辑共享内容");
        const replay = tx.objectStore(S.commands).get([state.actorId, input.commandId]);
        replay.onsuccess = () => {
          try {
            const saved = replay.result as SavedCommand | undefined;
            if (saved) {
              if (saved.fingerprint !== input.fingerprint) fail("IDEMPOTENCY_KEY_REUSED", "同一命令 ID 不能用于另一份内容", { commandId: input.commandId });
              result = { ...saved.commit, replayed: true }; return;
            }
            prepare(tx, state, input, commit => { result = commit; }, abort);
          } catch (error) { abort(error); }
        };
      } catch (error) { abort(error); }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => { cause ??= tx.error; };
    tx.onabort = () => reject(cause ?? new RpcError({ code: "TEMPORARILY_UNAVAILABLE", message: "提交事务中止", retryable: true }));
  });
}

function prepare(tx: IDBTransaction, state: WorkspaceState, input: CommandExecution, done: (commit: Commit) => void,
  abort: (error: unknown) => void): void {
  readPlanInput(tx, state, input.params, data => {
    try { prepareChanges(tx, state, input, data, done, abort); } catch (error) { abort(error); }
  }, abort);
}

function prepareChanges(tx: IDBTransaction, state: WorkspaceState, input: CommandExecution, data: PlanInput,
  done: (commit: Commit) => void, abort: (error: unknown) => void): void {
  const plan = planCommand(data, input.params);
  const before: HistoryEntry["before"] = { ...plan.before, media: [] };
  const uploads = input.params.operations.filter(op => op.type === "media.publish");
  for (const op of uploads) {
    if (!input.attachment || input.attachment.id !== op.data.id) fail("INVALID_REQUEST", "媒体发布需要通过上传接口提交原始字节");
    if (data.identities.some(id => id.id === op.data.id)) fail("VERSION_CONFLICT", "媒体 UUID 已存在");
    plan.changes.media = [op.data]; tx.objectStore(S.media).put(input.attachment);
    tx.objectStore(S.identities).put({ id: op.data.id, kind: "media", version: 1, deleted: false } satisfies IdentityRecord);
  }
  const removals = input.params.operations.filter(op => op.type === "media.remove");
  if (!removals.length) { checkBackground(tx, state, input, data, plan.changes, before, done, abort); return; }
  let remaining = removals.length;
  for (const op of removals) {
    const request = tx.objectStore(S.media).get(op.id);
    request.onsuccess = () => {
      try {
        const old = request.result as StoredMedia | undefined;
        checkVersion(op.id, op.expectedVersion, old?.version ?? null);
        if (!old) fail("NOT_FOUND", "媒体不存在", { id: op.id });
        before.media.push(old); tx.objectStore(S.media).delete(op.id);
        (plan.changes.removedMedia ??= []).push({ id: op.id, version: old.version + 1 });
        tx.objectStore(S.identities).put({ id: op.id, kind: "media", version: old.version + 1, deleted: true } satisfies IdentityRecord);
        if (--remaining === 0) checkBackground(tx, state, input, data, plan.changes, before, done, abort);
      } catch (error) { abort(error); }
    };
  }
}

function checkBackground(tx: IDBTransaction, state: WorkspaceState, input: CommandExecution, data: PlanInput,
  changes: Commit["changes"], before: HistoryEntry["before"], done: (commit: Commit) => void, abort: (error: unknown) => void): void {
  const mediaId = (changes.viewState ?? data.viewState).data.background.mediaId;
  const publish = () => { try { done(publishPlan(tx, state, input, changes, before)); } catch (error) { abort(error); } };
  if (!mediaId) { publish(); return; }
  const check = tx.objectStore(S.media).get(mediaId);
  check.onsuccess = () => { if (!check.result) abort(new RpcError({ code: "REFERENCE_CONFLICT", message: "背景引用的媒体不存在", retryable: false })); else publish(); };
}

function publishPlan(tx: IDBTransaction, state: WorkspaceState, input: CommandExecution, changes: Commit["changes"],
  before: HistoryEntry["before"]): Commit {
  for (const record of changes.put) {
    tx.objectStore(S.concepts).put(record);
    tx.objectStore(S.identities).put({ id: record.concept.id, kind: "concept", version: record.version, deleted: false } satisfies IdentityRecord);
  }
  for (const record of changes.removed) {
    tx.objectStore(S.concepts).delete(record.id);
    tx.objectStore(S.identities).put({ id: record.id, kind: "concept", version: record.version, deleted: true } satisfies IdentityRecord);
  }
  if (changes.presentation) tx.objectStore(S.presentation).put({ ...changes.presentation, id: "shared" });
  if (changes.viewState) tx.objectStore(S.viewState).put({ ...changes.viewState, id: state.actorId });
  const shared = input.params.operations.some(op => op.type !== "viewState.updateFields");
  const revision = state.revision + (shared ? 1 : 0);
  const commit = parse(CommitSchema, { commandId: input.commandId, actorId: state.actorId, revision,
    eventId: newId(), occurredAt: new Date().toISOString(), replayed: false, changes }, "INTERNAL_ERROR");
  tx.objectStore(S.state).put({ ...state, revision });
  tx.objectStore(S.commands).add({ actorId: state.actorId, commandId: input.commandId, fingerprint: input.fingerprint, commit } satisfies SavedCommand);
  // 导航只持久化个人状态与命令结果，不递增业务版本，也不广播私人焦点。
  if (shared) tx.objectStore(S.events).add({ revision, commit, before } satisfies HistoryEntry);
  return commit;
}
