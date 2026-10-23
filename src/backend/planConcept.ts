/** 概念和稳定参与槽的纯计划：只生成新对象与版本，最终图完整性统一校验。 */
import type { ConceptRecord, Operation } from "../contracts/commands";
import { fail } from "../contracts/errors";
import type { Concept, Participation } from "../domain/concepts";
import type { IdentityRecord } from "./workspaceDb";
import { checkVersion } from "./versions";
import { coreVocabulary } from "../domain/coreVocabulary";
import { guardStructureChange } from "./planDocument";

type Removal = { id: string; version: number };
export interface ConceptChange { before?: ConceptRecord; put?: ConceptRecord; removed?: Removal }
/** 非概念操作返回 null，避免按字符串前缀做不安全的类型收窄。 */
export function planConcept(op: Operation, records: ReadonlyMap<string, ConceptRecord>,
  identities: ReadonlyMap<string, IdentityRecord>): ConceptChange | null {
  if (op.type === "concept.create") {
    if (identities.has(op.concept.id)) fail("VERSION_CONFLICT", "该 UUID 已被使用；创建不会覆盖原有身份", { id: op.concept.id });
    return { put: { concept: op.concept, version: 1 } };
  }
  if (op.type !== "concept.updateFields" && op.type !== "concept.unsetFields" && op.type !== "concept.deleteUnreferenced"
    && op.type !== "concept.forget" && op.type !== "concept.restore"
    && op.type !== "relation.addParticipation" && op.type !== "relation.updateParticipation"
    && op.type !== "relation.removeParticipation" && op.type !== "relation.moveParticipation") return null;
  const old = records.get(op.id);
  checkVersion(op.id, op.expectedVersion, old?.version ?? null);
  if (!old) fail("NOT_FOUND", "概念不存在", { id: op.id });
  if (op.type === "concept.deleteUnreferenced") return { before: old, removed: { id: op.id, version: old.version + 1 } };
  let next: Concept;
  if (op.type === "concept.forget" || op.type === "concept.restore") {
    if (coreVocabulary.has(op.id)) fail("DOMAIN_CONSTRAINT", "通用语义根不能遗忘", { id: op.id });
    const forgotten = op.type === "concept.forget";
    if ((old.concept.forgotten === true) === forgotten) fail("DOMAIN_CONSTRAINT", forgotten ? "概念已经遗忘" : "概念未被遗忘", { id: op.id });
    next = { ...old.concept };
    if (forgotten) next.forgotten = true; else delete next.forgotten;
  } else if (op.type === "concept.updateFields") {
    if (op.fields.body !== undefined) guardStructureChange(old.concept.body, op.fields.body);
    next = { ...old.concept, ...op.fields };
  }
  else if (op.type === "concept.unsetFields") {
    next = { ...old.concept };
    for (const key of op.fields) delete next[key];
  } else {
    const slots = old.concept.participants;
    if (!slots) fail("DOMAIN_CONSTRAINT", "只有关系概念可以修改参与槽", { id: op.id });
    const at = (slotId: string): number => {
      const position = slots.findIndex(item => item.id === slotId);
      if (position < 0) fail("NOT_FOUND", "参与槽不存在", { id: slotId });
      return position;
    };
    const place = (items: Participation[], value: Participation, afterId: string | null) => {
      const position = afterId === null ? -1 : items.findIndex(item => item.id === afterId);
      if (afterId !== null && position < 0) fail("REFERENCE_CONFLICT", "目标参与槽不存在", { id: afterId });
      items.splice(position + 1, 0, value);
      return items;
    };
    let participants: Participation[];
    if (op.type === "relation.addParticipation") {
      if (slots.some(item => item.id === op.participation.id)) fail("VERSION_CONFLICT", "参与槽 UUID 已存在", { id: op.participation.id });
      participants = place([...slots], op.participation, op.afterId);
    } else if (op.type === "relation.updateParticipation") {
      const position = at(op.slotId);
      participants = [...slots]; participants[position] = { ...participants[position], ...op.fields };
    } else if (op.type === "relation.removeParticipation") {
      // 槽位替换允许事务内短暂少于两个；最终结构在整份计划完成后统一校验。
      participants = [...slots]; participants.splice(at(op.slotId), 1);
    } else {
      const removed = slots[at(op.slotId)];
      if (op.afterId === op.slotId) fail("DOMAIN_CONSTRAINT", "不能把参与槽移到自己之后", { id: op.slotId });
      participants = place(slots.filter(item => item.id !== op.slotId), removed, op.afterId);
    }
    next = { ...old.concept, participants };
  }
  return { before: old, put: { concept: next, version: old.version + 1 } };
}
