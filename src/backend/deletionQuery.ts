/** 引用与个人状态在一致快照读取；预览不写任何资源或历史。 */
import type { DeletePreview } from "../contracts/deletion";
import type { ConceptRecord } from "../contracts/commands";
import { DeletePreviewSchema } from "../contracts/deletion";
import { parse } from "../contracts/validate";
import { fail } from "../contracts/errors";
import { deletionReferences, type DeletionState } from "../domain/deletionReferences";
import { scopedQuery } from "./workspaceQueries";
import { STORES as S, type SharedPresentation, type ActorViewState } from "./workspaceDb";
export function readDeletionState(db: IDBDatabase, workspaceId: string) {
  return scopedQuery<DeletionState>(db, workspaceId, [S.concepts, S.presentation, S.viewState], (tx, state, done) => {
    const concepts = tx.objectStore(S.concepts).getAll(), presentation = tx.objectStore(S.presentation).get("shared"), navigation = tx.objectStore(S.viewState).getAll();
    let remaining = 3;
    const finish = () => { if (--remaining === 0) done({ concepts: concepts.result as ConceptRecord[], presentation: presentation.result as SharedPresentation,
      navigation: navigation.result as ActorViewState[], actorId: state.actorId }); };
    concepts.onsuccess = finish; presentation.onsuccess = finish; navigation.onsuccess = finish;
  });
}
export function deletionPreview(id: string, state: DeletionState, context: { workspaceId: string; revision: number }): DeletePreview {
  const target = state.concepts.find(record => record.concept.id === id), personal = state.navigation.find(nav => nav.id === state.actorId);
  if (!target) fail("NOT_FOUND", "概念不存在", { id });
  if (!personal) fail("INTERNAL_ERROR", "个人导航不存在");
  const blockers = deletionReferences(id, state);
  const result = parse(DeletePreviewSchema, { ...context, target, viewStateVersion: personal.version, blockers,
    clearFocus: personal.data.focusId === id, removeExpanded: personal.data.expandedRelations.includes(id), canDelete: blockers.length === 0,
    historyRetained: true }, "INTERNAL_ERROR");
  if (new TextEncoder().encode(JSON.stringify(result)).length > 1024 * 1024) fail("PAYLOAD_TOO_LARGE", "删除预览超过1MiB，请先减少引用");
  return result;
}
export async function queryDeletion(db: IDBDatabase, workspaceId: string, id: string) {
  const snapshot = await readDeletionState(db, workspaceId);
  return { value: deletionPreview(id, snapshot.value, snapshot.context), context: snapshot.context };
}
