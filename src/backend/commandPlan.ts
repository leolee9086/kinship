/** 无副作用的提交计划：先检查资源版本，再验证最终图，不依赖请求到达顺序。 */
import type { Apply, ConceptRecord, Delta, PresentationRecord, ViewStateRecord } from "../contracts/commands";
import { fail } from "../contracts/errors";
import { ConceptIndex } from "../domain/conceptIndex";
import { applyMutation, validateSettings } from "../domain/validation";
import { combineSettings } from "../domain/presentationState";
import { validatePresentationReferences } from "../domain/presentationValidation";
import type { IdentityRecord } from "./workspaceDb";

export interface PlanInput {
  concepts: ConceptRecord[]; identities: IdentityRecord[]; presentation: PresentationRecord; viewState: ViewStateRecord;
}
export interface CommandPlan { changes: Delta; before: { concepts: ConceptRecord[]; presentation?: PresentationRecord; viewState?: ViewStateRecord } }
export function checkVersion(id: string, expected: number, actual: number | null): void {
  if (expected !== actual) fail("VERSION_CONFLICT", "资源已被其他提交修改，请读取最新版本后处理冲突", { id, expectedVersion: expected, actualVersion: actual });
}
export function planCommand(input: PlanInput, command: Apply): CommandPlan {
  const records = new Map(input.concepts.map(record => [record.concept.id, record]));
  const identities = new Map(input.identities.map(record => [record.id, record]));
  const seen = new Set<string>(), changes: Delta = { put: [], removed: [] };
  const before: CommandPlan["before"] = { concepts: [] };
  for (const op of command.operations) {
    const key = "concept" in op ? `concept:${op.concept.id}` : op.type === "concept.deleteUnreferenced" ? `concept:${op.id}`
      : op.type === "media.publish" ? `media:${op.data.id}` : op.type === "media.remove" ? `media:${op.id}` : op.type.split(".")[0];
    if (seen.has(key)) fail("DOMAIN_CONSTRAINT", "一次命令只能修改同一资源一次", { resource: key });
    seen.add(key);
    if (op.type === "concept.create") {
      if (identities.has(op.concept.id)) fail("VERSION_CONFLICT", "该 UUID 已被使用；创建不会覆盖原有身份", { id: op.concept.id });
      changes.put.push({ concept: op.concept, version: 1 });
    } else if (op.type === "concept.replace" || op.type === "concept.deleteUnreferenced") {
      const id = op.type === "concept.replace" ? op.concept.id : op.id, old = records.get(id);
      checkVersion(id, op.expectedVersion, old?.version ?? null);
      if (!old) fail("NOT_FOUND", "概念不存在", { id });
      before.concepts.push(old);
      if (op.type === "concept.replace") changes.put.push({ concept: op.concept, version: old.version + 1 });
      else changes.removed.push({ id, version: old.version + 1 });
    } else if (op.type === "presentation.replace") {
      checkVersion("presentation", op.expectedVersion, input.presentation.version);
      before.presentation = input.presentation;
      changes.presentation = { data: op.data, version: input.presentation.version + 1 };
    } else if (op.type === "viewState.replace") {
      checkVersion("viewState", op.expectedVersion, input.viewState.version);
      before.viewState = input.viewState;
      changes.viewState = { data: op.data, version: input.viewState.version + 1 };
    }
  }
  const concepts = changes.put.length || changes.removed.length ? applyMutation(input.concepts.map(r => r.concept), {
    put: changes.put.map(r => r.concept), remove: changes.removed.map(r => r.id),
  }) : input.concepts.map(r => r.concept);
  const settings = combineSettings(changes.presentation?.data ?? input.presentation.data, changes.viewState?.data ?? input.viewState.data);
  validateSettings(settings); validatePresentationReferences(settings, new ConceptIndex(concepts));
  const ids = new Set(concepts.map(c => c.id));
  if (settings.focusId && !ids.has(settings.focusId)) fail("REFERENCE_CONFLICT", "当前焦点即将被删除，请在同一命令中选择新的焦点", { id: settings.focusId });
  if (settings.expandedRelations.some(id => !ids.has(id))) fail("REFERENCE_CONFLICT", "展开列表引用了不存在的关系");
  return { changes, before };
}
