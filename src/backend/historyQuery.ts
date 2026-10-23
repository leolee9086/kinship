/** 有界历史读取：冻结上界的倒序页与单个概念前后值共用一致只读事务。 */
import { fail } from "../contracts/errors";
import { HISTORY_MAX_BYTES, type HistorySummary } from "../contracts/history";
import type { Request, Result } from "../contracts/rpc";
import { STORES as S, type HistoryEntry } from "./workspaceDb";
import { scopedQuery } from "./workspaceQueries";
import { historyMeta, summarizeHistory } from "./historySummary";
function checkBytes<T>(value: T): T {
  const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes > HISTORY_MAX_BYTES) fail("PAYLOAD_TOO_LARGE", "历史读取超出字节预算，请减少每页条数或选择更小的资源", { bytes, maximum: HISTORY_MAX_BYTES });
  return value;
}
export function queryHistoryList(db: IDBDatabase, input: Request<"historyList">) {
  return scopedQuery<Result<"historyList">>(db, input.workspaceId, [S.events], (tx, state, done, abort) => {
    const { cursor, limit } = input.params, atRevision = cursor?.atRevision ?? state.revision;
    if (atRevision > state.revision || (cursor && (cursor.workspaceId !== state.workspaceId
      || (cursor.beforeRevision !== null && cursor.beforeRevision > atRevision))))
      fail("CURSOR_EXPIRED", "历史游标不属于当前工作区或修订范围", { revision: state.revision });
    const events: HistorySummary[] = [];
    const range = cursor?.beforeRevision != null ? IDBKeyRange.upperBound(cursor.beforeRevision, true) : IDBKeyRange.upperBound(atRevision);
    const request = tx.objectStore(S.events).openCursor(range, "prev");
    request.onsuccess = () => {
      try {
        const row = request.result;
        // 多看一条只用于确认 hasMore；响应只含请求的条数，不悄悄按字节截断。
        if (!row || events.length === limit) {
          const last = events.at(-1);
          done(checkBytes({ atRevision, events, nextCursor: row && last
            ? { workspaceId: state.workspaceId, atRevision, beforeRevision: last.revision } : null }));
          return;
        }
        events.push(summarizeHistory(row.value as HistoryEntry)); row.continue();
      } catch (error) { abort(error); }
    };
  });
}
export function queryHistoryConcept(db: IDBDatabase, input: Request<"historyConcept">) {
  return scopedQuery<Result<"historyConcept">>(db, input.workspaceId, [S.events], (tx, _state, done, abort) => {
    const request = tx.objectStore(S.events).index("eventId").get(input.params.eventId);
    request.onsuccess = () => {
      try {
        const entry = request.result as HistoryEntry | undefined;
        if (!entry) fail("NOT_FOUND", "历史事件不存在", { eventId: input.params.eventId });
        const resource = summarizeHistory(entry).concepts.find(c => c.id === input.params.conceptId);
        if (!resource) fail("NOT_FOUND", "此事件没有修改指定概念", { id: input.params.conceptId });
        const before = entry.before.concepts.find(c => c.concept.id === resource.id) ?? null;
        const after = entry.commit.changes.put.find(c => c.concept.id === resource.id) ?? null;
        done(checkBytes({ ...historyMeta(entry), resource, before, after }));
      } catch (error) { abort(error); }
    };
  });
}
