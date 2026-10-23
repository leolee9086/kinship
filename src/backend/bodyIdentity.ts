/** 块身份归属于一个概念：删除保留墓碑，撤销可在原正文恢复，不能转作另一对象的UUID。 */
import type { CommandPlan } from "./commandPlan";
import type { IdentityRecord, HistoryEntry } from "./workspaceDb";
import { STORES } from "./workspaceDb";
import { fail } from "../contracts/errors";
export function guardBodyIdentities(plan: CommandPlan, identities: ReadonlyMap<string, IdentityRecord>, media: ReadonlySet<string>) {
  for (const record of plan.changes.put) for (const slot of record.concept.participants ?? [])
    if (identities.has(slot.id) || media.has(slot.id)) fail("VERSION_CONFLICT", "参与槽 UUID 已属于另一资源", { id: slot.id });
  for (const record of plan.changes.put) for (const block of record.concept.body?.blocks ?? []) {
    const identity = identities.get(block.id);
    if (media.has(block.id) || (identity && (identity.kind !== "block" || identity.ownerId !== record.concept.id)))
      fail("VERSION_CONFLICT", "正文块 UUID 已属于另一资源", { id: block.id });
  }
}
export function publishBodyIdentities(tx: IDBTransaction, changes: CommandPlan["changes"], before: HistoryEntry["before"]) {
  const originals = new Map(before.concepts.map(record => [record.concept.id, record.concept.body]));
  const store = tx.objectStore(STORES.identities);
  for (const record of changes.put) {
    const current = new Set(record.concept.body?.blocks.map(block => block.id) ?? []);
    for (const block of originals.get(record.concept.id)?.blocks ?? []) if (!current.has(block.id))
      store.put({ id: block.id, kind: "block", ownerId: record.concept.id, version: record.version, deleted: true } satisfies IdentityRecord);
    for (const id of current) store.put({ id, kind: "block", ownerId: record.concept.id, version: record.version, deleted: false } satisfies IdentityRecord);
  }
  for (const removed of changes.removed) for (const block of originals.get(removed.id)?.blocks ?? [])
    store.put({ id: block.id, kind: "block", ownerId: removed.id, version: removed.version, deleted: true } satisfies IdentityRecord);
}
