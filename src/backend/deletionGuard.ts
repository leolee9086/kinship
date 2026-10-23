/** 无论从专用确认接口还是原子命令删除，都检查所有已保存状态，避免绕过预览的约束。 */
import type { Delta } from "../contracts/commands";
import type { PlanInput } from "./commandPlan";
import type { WorkspaceState, ActorViewState } from "./workspaceDb";
import { STORES as S } from "./workspaceDb";
import { deletionReferences } from "../domain/deletionReferences";
import { fail } from "../contracts/errors";
export function guardDeletedReferences(tx: IDBTransaction, state: WorkspaceState, input: PlanInput, changes: Delta,
  done: () => void, abort: (error: unknown) => void): void {
  if (!changes.removed.length) { done(); return; }
  const request = tx.objectStore(S.viewState).getAll();
  request.onsuccess = () => { try {
    const removed = new Set(changes.removed.map(item => item.id)), records = new Map(input.concepts.map(record => [record.concept.id, record]));
    for (const record of changes.put) records.set(record.concept.id, record);
    for (const id of removed) records.delete(id);
    const concepts = [...records.values()];
    const navigation = (request.result as ActorViewState[]).map(nav => nav.id === state.actorId && changes.viewState ? { ...changes.viewState, id: state.actorId } : nav);
    for (const id of removed) {
      const refs = deletionReferences(id, { concepts, presentation: changes.presentation ?? input.presentation, navigation, actorId: state.actorId });
      // 当前焦点/展开项也必须由调用方在同一事务清理；不能留下个人悬空引用。
      const own = navigation.find(nav => nav.id === state.actorId);
      if (refs.length || own?.data.focusId === id || own?.data.expandedRelations.includes(id))
        fail("REFERENCE_CONFLICT", "概念仍被引用，请重新预览并处理引用", { id, count: refs.length });
    }
    done();
  } catch (error) { abort(error); } };
}
