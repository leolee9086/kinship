/** 一致快照、命令结果和事件游标读取，均不产生业务写入。 */
import type { Bootstrap, Result, Role } from "../contracts/rpc";
import type { ConceptRecord } from "../contracts/commands";
import { fail } from "../contracts/errors";
import { STORES as S, type ActorViewState, type HistoryEntry, type SavedCommand,
  type SharedPresentation, type WorkspaceState } from "./workspaceDb";
import type { StoredMedia } from "../domain/concepts";

export function bootstrap(db: IDBDatabase, role: Role): Promise<Bootstrap> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([S.state, S.concepts, S.presentation, S.viewState], "readonly");
    const state = tx.objectStore(S.state).get("workspace"), concepts = tx.objectStore(S.concepts).getAll();
    const shared = tx.objectStore(S.presentation).get("shared");
    let personal: IDBRequest;
    state.onsuccess = () => { personal = tx.objectStore(S.viewState).get((state.result as WorkspaceState).actorId); };
    tx.oncomplete = () => {
      const meta = state.result as WorkspaceState, p = shared.result as SharedPresentation, v = personal.result as ActorViewState;
      resolve({ workspaceId: meta.workspaceId, actorId: meta.actorId, role, revision: meta.revision,
        concepts: concepts.result as ConceptRecord[], presentation: { data: p.data, version: p.version }, viewState: { data: v.data, version: v.version } });
    };
    tx.onabort = () => reject(tx.error); tx.onerror = () => reject(tx.error);
  });
}

export interface QueryValue<T> { value: T; context: { workspaceId: string; revision: number } }
export function scopedQuery<T>(db: IDBDatabase, workspaceId: string, stores: string[],
  read: (tx: IDBTransaction, state: WorkspaceState, done: (value: T) => void, abort: (error: unknown) => void) => void): Promise<QueryValue<T>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([...new Set([S.state, ...stores])], "readonly");
    const state = tx.objectStore(S.state).get("workspace");
    let result: T, cause: unknown, context: QueryValue<T>["context"];
    state.onsuccess = () => {
      try {
        const meta = state.result as WorkspaceState;
        if (!meta || meta.workspaceId !== workspaceId) fail("NOT_FOUND", "工作区不存在");
        context = { workspaceId: meta.workspaceId, revision: meta.revision };
        read(tx, meta, value => { result = value; }, error => { cause = error; tx.abort(); });
      } catch (error) { cause = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve({ value: result, context });
    tx.onabort = () => reject(cause ?? tx.error); tx.onerror = () => { cause ??= tx.error; };
  });
}
export function readConcept(db: IDBDatabase, workspaceId: string, id: string): Promise<QueryValue<ConceptRecord>> {
  return scopedQuery(db, workspaceId, [S.concepts], (tx, _state, done, abort) => {
    const request = tx.objectStore(S.concepts).get(id);
    request.onsuccess = () => {
      try { if (!request.result) fail("NOT_FOUND", "概念不存在", { id }); done(request.result as ConceptRecord); }
      catch (cause) { abort(cause); }
    };
  });
}
export function commandStatus(db: IDBDatabase, workspaceId: string, commandId: string): Promise<QueryValue<Result<"commandStatus">>> {
  return scopedQuery(db, workspaceId, [S.commands], (tx, state, done) => {
    const request = tx.objectStore(S.commands).get([state.actorId, commandId]);
    request.onsuccess = () => { const saved = request.result as SavedCommand | undefined;
      done(saved ? { state: "committed", commit: { ...saved.commit, replayed: true } } : { state: "unknown" }); };
  });
}
export function events(db: IDBDatabase, workspaceId: string, after: number, limit: number): Promise<QueryValue<Result<"events">>> {
  return scopedQuery(db, workspaceId, [S.events], (tx, state, done) => {
    if (after > state.revision) fail("CURSOR_EXPIRED", "事件游标不属于当前快照", { revision: state.revision });
    const request = tx.objectStore(S.events).getAll(IDBKeyRange.lowerBound(after, true), limit + 1);
    request.onsuccess = () => {
      const page = request.result as HistoryEntry[], visible = page.slice(0, limit).map(item => {
        const { viewState: _, ...changes } = item.commit.changes;
        return { ...item.commit, changes };
      });
      done({ events: visible, revision: state.revision, nextCursor: visible.at(-1)?.revision ?? after, hasMore: page.length > limit });
    };
  });
}
export function media(db: IDBDatabase, workspaceId: string, id: string): Promise<QueryValue<StoredMedia | null>> {
  return scopedQuery(db, workspaceId, [S.media], (tx, _state, done) => {
    const request = tx.objectStore(S.media).get(id); request.onsuccess = () => done(request.result as StoredMedia | undefined ?? null);
  });
}
