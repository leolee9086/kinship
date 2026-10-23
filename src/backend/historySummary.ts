/** 从不可变归档提取审阅元信息；不从当前库补历史前值，也不返回个人状态和媒体 Blob。 */
import type { HistorySummary } from "../contracts/history";
import { fail } from "../contracts/errors";
import type { HistoryEntry } from "./workspaceDb";
export function historyMeta(entry: HistoryEntry) {
  const { eventId, revision, actorId, commandId, occurredAt, importSource } = entry.commit;
  return { eventId, revision, actorId, commandId, occurredAt, ...(importSource ? { importSource } : {}) };
}
export function summarizeHistory(entry: HistoryEntry): HistorySummary {
  const before = new Map(entry.before.concepts.map(record => [record.concept.id, record]));
  const concepts: HistorySummary["concepts"] = entry.commit.changes.put.map(record => {
    const old = before.get(record.concept.id);
    return { id: record.concept.id, label: record.concept.label, change: old ? "updated" : "created",
      beforeVersion: old?.version ?? null, afterVersion: record.version };
  });
  for (const removed of entry.commit.changes.removed) {
    const old = before.get(removed.id);
    if (!old) fail("INTERNAL_ERROR", "历史删除事件缺少原概念前值", { eventId: entry.commit.eventId, id: removed.id });
    concepts.push({ id: removed.id, label: old.concept.label, change: "deleted", beforeVersion: old.version, afterVersion: removed.version });
  }
  return { ...historyMeta(entry), concepts, presentationChanged: Boolean(entry.commit.changes.presentation),
    mediaPublished: entry.commit.changes.media?.length ?? 0, mediaRemoved: entry.commit.changes.removedMedia?.length ?? 0 };
}
