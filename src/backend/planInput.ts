/** 读取事务计划所需资源；导航/配置只读有界引用闭包，业务图编辑另走全图约束验证。 */
import type { Apply, ConceptRecord } from "../contracts/commands";
import { combineSettings } from "../domain/presentationState";
import type { PlanInput } from "./commandPlan";
import { planSettingsBatch } from "./planSettings";
import { presentationIds, readConceptClosure } from "./references";
import { STORES as S, type ActorViewState, type SharedPresentation, type WorkspaceState, type IdentityRecord } from "./workspaceDb";

export function readPlanInput(tx: IDBTransaction, state: WorkspaceState, input: Apply, done: (data: PlanInput) => void,
  abort: (error: unknown) => void): void {
  const shared = tx.objectStore(S.presentation).get("shared"), personal = tx.objectStore(S.viewState).get(state.actorId);
  let pending = 2;
  const ready = () => {
    if (--pending) return;
    try {
      const presentation = shared.result as SharedPresentation, viewState = personal.result as ActorViewState;
      const result: PlanInput = { concepts: [], identities: [], presentation, viewState };
      let remaining = 2;
      const complete = () => { if (--remaining === 0) done(result); };
      if (input.operations.some(op => op.type.startsWith("concept.") || op.type.startsWith("relation.") || op.type.startsWith("document."))) {
        const concepts = tx.objectStore(S.concepts).getAll(), identities = tx.objectStore(S.identities).getAll();
        concepts.onsuccess = () => { result.concepts = concepts.result as ConceptRecord[]; complete(); };
        identities.onsuccess = () => { result.identities = identities.result as IdentityRecord[]; complete(); };
      } else {
        const definitions = planSettingsBatch(input.operations, presentation, viewState);
        const nextPresentation = definitions.presentation?.data ?? presentation.data;
        const nextView = definitions.viewState?.data ?? viewState.data;
        const settings = combineSettings(nextPresentation, nextView), roots = presentationIds(settings);
        if (settings.focusId) roots.add(settings.focusId);
        settings.expandedRelations.forEach(id => roots.add(id));
        readConceptClosure(tx.objectStore(S.concepts), roots, index => {
          result.concepts = index.concepts.map(concept => ({ concept, version: 1 })); complete();
        }, abort);
        const publications = input.operations.filter(op => op.type === "media.publish");
        if (!publications.length) complete();
        else {
          let count = publications.length;
          for (const op of publications) {
            const request = tx.objectStore(S.identities).get(op.data.id);
            request.onsuccess = () => { if (request.result) result.identities.push(request.result as IdentityRecord); if (--count === 0) complete(); };
          }
        }
      }
    } catch (error) { abort(error); }
  };
  shared.onsuccess = ready; personal.onsuccess = ready;
}
