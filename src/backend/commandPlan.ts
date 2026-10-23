/** 先生成资源增量，再验证最终图；纯计划不触及 IDB，也不把事务内草稿当成新版本。 */
import type { Apply, ConceptRecord, Delta, PresentationRecord, ViewStateRecord } from "../contracts/commands";
import { ConceptSchema } from "../contracts/concept";
import { PresentationSchema, ViewStateSchema } from "../contracts/presentation";
import { parse } from "../contracts/validate";
import { fail } from "../contracts/errors";
import { ConceptIndex } from "../domain/conceptIndex";
import { applyMutation, validateSettings } from "../domain/validation";
import { combineSettings } from "../domain/presentationState";
import { validatePresentationReferences } from "../domain/presentationValidation";
import type { IdentityRecord } from "./workspaceDb";
import { planConcept } from "./planConcept";
import { planSettingsBatch } from "./planSettings";
import { guardBodyIdentities } from "./bodyIdentity";

export interface PlanInput {
  concepts: ConceptRecord[]; identities: IdentityRecord[]; presentation: PresentationRecord; viewState: ViewStateRecord;
}
export interface CommandPlan { changes: Delta; before: { concepts: ConceptRecord[]; presentation?: PresentationRecord; viewState?: ViewStateRecord } }
export function planCommand(input: PlanInput, command: Apply): CommandPlan {
  const originals = new Map(input.concepts.map(record => [record.concept.id, record])), drafts = new Map(originals);
  const identities = new Map(input.identities.map(record => [record.id, record]));
  const put = new Map<string, ConceptRecord>(), removed: Delta["removed"] = [], before: CommandPlan["before"] = { concepts: [] };
  const touched = new Set<string>(), exclusive = new Set<string>(), media = new Set<string>();
  for (const op of command.operations) {
    const change = planConcept(op, drafts, identities);
    if (change) {
      const id = change.put?.concept.id ?? change.removed!.id;
      const unique = op.type === "concept.create" || op.type === "concept.deleteUnreferenced";
      if (exclusive.has(id) || (unique && touched.has(id))) fail("DOMAIN_CONSTRAINT", "创建或删除不能与同一资源的其他操作混用", { id });
      if (!touched.has(id) && change.before) before.concepts.push(originals.get(id)!);
      touched.add(id); if (unique) exclusive.add(id);
      if (change.put) {
        put.set(id, change.put);
        // 后续操作仍检查本次事务读到的原版本；同一资源最后只递增一次。
        drafts.set(id, { concept: change.put.concept, version: originals.get(id)?.version ?? change.put.version });
      }
      if (change.removed) { removed.push(change.removed); drafts.delete(id); }
    }
    if (op.type === "media.publish" || op.type === "media.remove") {
      const id = op.type === "media.publish" ? op.data.id : op.id;
      if (media.has(id)) fail("DOMAIN_CONSTRAINT", "一次命令只能修改同一媒体一次", { id });
      media.add(id);
    }
  }
  const definitions = planSettingsBatch(command.operations, input.presentation, input.viewState);
  if (definitions.presentation) before.presentation = input.presentation;
  if (definitions.viewState) before.viewState = input.viewState;
  const changes: Delta = { put: [...put.values()], removed, ...definitions };
  for (const record of changes.put) parse(ConceptSchema, record.concept, "DOMAIN_CONSTRAINT");
  parse(PresentationSchema, definitions.presentation?.data ?? input.presentation.data, "DOMAIN_CONSTRAINT");
  parse(ViewStateSchema, definitions.viewState?.data ?? input.viewState.data, "DOMAIN_CONSTRAINT");
  const concepts = changes.put.length || removed.length ? applyMutation(input.concepts.map(r => r.concept), {
    put: changes.put.map(r => r.concept), remove: removed.map(r => r.id),
  }) : input.concepts.map(r => r.concept);
  const settings = combineSettings(definitions.presentation?.data ?? input.presentation.data, definitions.viewState?.data ?? input.viewState.data);
  validateSettings(settings); validatePresentationReferences(settings, new ConceptIndex(concepts));
  const ids = new Set(concepts.map(c => c.id));
  if (settings.focusId && !ids.has(settings.focusId)) fail("REFERENCE_CONFLICT", "当前焦点即将被删除，请在同一命令中选择新的焦点", { id: settings.focusId });
  if (settings.expandedRelations.some(id => !ids.has(id))) fail("REFERENCE_CONFLICT", "展开列表引用了不存在的关系");
  const plan = { changes, before }; guardBodyIdentities(plan, identities, media); return plan;
}
