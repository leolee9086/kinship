/** JSON Schema 之外的历史语义校验；错误目标、漏页和错误版本不能作为可信审阅依据。 */
import { HISTORY_MAX_BYTES, type HistoryConcept, type HistoryPage, type HistoryResource, type HistorySummary } from "../contracts/history";
import type { Request } from "../contracts/rpc";
import { sameField } from "../format/fieldDiff";
interface Context { workspaceId: string; revision: number }
function requireHistory(condition: unknown): asserts condition { if (!condition) throw new Error("历史响应上下文、资源或版本不一致"); }
function checkBytes(value: unknown) { requireHistory(new TextEncoder().encode(JSON.stringify(value)).byteLength <= HISTORY_MAX_BYTES); }
function checkResource(resource: HistoryResource) {
  requireHistory(resource.change === "created" ? resource.beforeVersion === null
    : resource.beforeVersion !== null && resource.afterVersion === resource.beforeVersion + 1);
}
function checkSummary(event: HistorySummary) {
  requireHistory(event.concepts.length || event.presentationChanged || event.mediaPublished || event.mediaRemoved);
  const ids = new Set<string>();
  for (const resource of event.concepts) { checkResource(resource); requireHistory(!ids.has(resource.id)); ids.add(resource.id); }
}
export function verifyHistoryPage(page: HistoryPage, params: Request<"historyList">["params"], context: Context) {
  checkBytes(page);
  const fence = params.cursor?.atRevision ?? context.revision;
  requireHistory(page.atRevision === fence && fence <= context.revision);
  requireHistory(!params.cursor || params.cursor.workspaceId === context.workspaceId);
  const first = params.cursor?.beforeRevision != null ? params.cursor.beforeRevision - 1 : fence;
  requireHistory(page.events.length === Math.min(params.limit, first));
  const eventIds = new Set<string>();
  page.events.forEach((event, i) => {
    checkSummary(event); requireHistory(event.revision === first - i && !eventIds.has(event.eventId)); eventIds.add(event.eventId);
  });
  const remaining = first - page.events.length, last = page.events.at(-1);
  requireHistory(remaining > 0 ? page.nextCursor && last && page.nextCursor.workspaceId === context.workspaceId
    && page.nextCursor.atRevision === fence && page.nextCursor.beforeRevision === last.revision : page.nextCursor === null);
}
export function verifyHistoryConcept(value: HistoryConcept, params: Request<"historyConcept">["params"], context: Context) {
  checkBytes(value); checkResource(value.resource);
  requireHistory(value.eventId === params.eventId && value.resource.id === params.conceptId && value.revision <= context.revision);
  const { before, after, resource } = value;
  requireHistory(before ? before.concept.id === params.conceptId && before.version === resource.beforeVersion : resource.beforeVersion === null);
  requireHistory(after ? after.concept.id === params.conceptId && after.version === resource.afterVersion : resource.change === "deleted");
  requireHistory(resource.change === "created" ? before === null && after !== null
    : resource.change === "deleted" ? before !== null && after === null : before !== null && after !== null);
  requireHistory(resource.label === (after ?? before)?.concept.label);
}
export function sameHistoryEvent(a: HistorySummary, b: HistoryConcept): boolean {
  // 详情必须仍属于人刚选中的那条不可变事件，包含同一来源和资源描述。
  const resource = a.concepts.find(c => c.id === b.resource.id);
  return a.eventId === b.eventId && a.revision === b.revision && a.commandId === b.commandId && a.actorId === b.actorId
    && a.occurredAt === b.occurredAt && sameField(a.importSource, b.importSource) && sameField(resource, b.resource);
}
