/** 分页只保留游标和当前页；更换页/目标后废弃旧请求，避免慢响应串到另一事件。 */
import { useEffect, useState } from "react";
import type { DataAdapter } from "../adapter/api";
import { sameHistoryEvent } from "../adapter/historyResponse";
import type { HistoryConcept, HistoryCursor, HistoryPage, HistorySummary } from "../contracts/history";
export function useHistoryReview(adapter: DataAdapter) {
  const [limit, setLimit] = useState(10), [trail, setTrail] = useState<(HistoryCursor | undefined)[]>([undefined]);
  const [generation, setGeneration] = useState(0), [page, setPage] = useState<HistoryPage | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState("");
  const [event, setEvent] = useState<HistorySummary | null>(null), [conceptId, setConceptId] = useState("");
  const [detail, setDetail] = useState<HistoryConcept | null>(null), [reading, setReading] = useState(false), [detailError, setDetailError] = useState("");
  const [detailGeneration, setDetailGeneration] = useState(0);
  const cursor = trail.at(-1);
  useEffect(() => {
    const request = new AbortController(); let active = true;
    setBusy(true); setError(""); setPage(null); setEvent(null); setConceptId(""); setDetail(null);
    void adapter.historyList({ limit, ...(cursor ? { cursor } : {}) }, { signal: request.signal }).then(result => { if (active) setPage(result); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; request.abort(); };
  }, [adapter, limit, cursor, generation]);
  useEffect(() => {
    const request = new AbortController(); let active = true;
    setDetail(null); setDetailError(""); setReading(Boolean(event && conceptId));
    if (event && conceptId) void adapter.historyConcept(event.eventId, conceptId, { signal: request.signal }).then(result => {
      if (!sameHistoryEvent(event, result)) throw new Error("详情与选中的历史记录不一致，请重新读取");
      if (active) setDetail(result);
    }).catch(cause => { if (active) setDetailError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setReading(false); });
    return () => { active = false; request.abort(); };
  }, [adapter, event, conceptId, generation, detailGeneration]);
  return { page, busy, error, limit, pageNumber: trail.length, event, conceptId, detail, reading, detailError,
    select: (next: HistorySummary) => { setEvent(next); setConceptId(next.concepts[0]?.id ?? ""); }, setConceptId,
    next: () => { if (!busy && page?.nextCursor) setTrail(old => [
      ...old.map((value, i) => i === 0 && !value ? { workspaceId: page.nextCursor!.workspaceId, atRevision: page.atRevision, beforeRevision: null } : value), page.nextCursor!]); },
    previous: () => { if (!busy && trail.length > 1) setTrail(old => old.slice(0, -1)); },
    refresh: () => { setTrail([undefined]); setGeneration(n => n + 1); },
    resize: (size: number) => { setLimit(size); setTrail([undefined]); },
    retry: () => setGeneration(n => n + 1), retryDetail: () => setDetailGeneration(n => n + 1) };
}
