/** 编辑器的草稿与打开时的概念比较，只提交实际改动的字段及 UUID 参与槽。 */
import type { Operation } from "../contracts/commands";
import type { Concept, Participation } from "../domain/concepts";
import { changedFields, sameField } from "./fieldDiff";

export function conceptCommands(concept: Concept, initial: Concept | undefined, expectedVersion: number | null): Operation[] {
  if (!initial) return [{ type: "concept.create", concept }];
  if (expectedVersion === null) throw new Error("已有概念需要打开时的资源版本");
  const result: Operation[] = [], { id: _nextId, participants: _nextSlots, ...after } = concept;
  const { participants: _previousSlots, id: _previousId, ...before } = initial;
  const fields = changedFields(before, after);
  if (Object.keys(fields).length) result.push({ type: "concept.updateFields", id: concept.id, expectedVersion, fields });
  const unset = (["aliases", "description", "broader", "properties", "schema"] as const).filter(key => before[key] !== undefined && after[key] === undefined);
  if (unset.length) result.push({ type: "concept.unsetFields", id: concept.id, expectedVersion, fields: unset });
  const desired = concept.participants, original = initial.participants;
  if (!desired && !original) return result;
  if (!desired || !original) throw new Error("参与槽只能通过关系创建或逐槽编辑");
  const working = [...original], afterIds = new Set(desired.map(slot => slot.id));
  for (const slot of original) if (!afterIds.has(slot.id)) {
    result.push({ type: "relation.removeParticipation", id: concept.id, expectedVersion, slotId: slot.id });
    working.splice(working.findIndex(item => item.id === slot.id), 1);
  }
  for (let i = 0; i < desired.length; i++) {
    const slot = desired[i], afterId = i ? desired[i - 1].id : null;
    const index = working.findIndex(item => item.id === slot.id);
    if (index < 0) {
      result.push({ type: "relation.addParticipation", id: concept.id, expectedVersion, participation: slot, afterId });
      working.splice(i, 0, slot);
    } else {
      if (index !== i) {
        result.push({ type: "relation.moveParticipation", id: concept.id, expectedVersion, slotId: slot.id, afterId });
        working.splice(index, 1); working.splice(i, 0, slot);
      }
      const fields: Partial<Pick<Participation, "role" | "concept">> = {};
      const prior = original.find(item => item.id === slot.id)!;
      if (!sameField(prior.role, slot.role)) fields.role = slot.role;
      if (!sameField(prior.concept, slot.concept)) fields.concept = slot.concept;
      if (Object.keys(fields).length) result.push({ type: "relation.updateParticipation", id: concept.id, expectedVersion, slotId: slot.id, fields });
    }
  }
  return result;
}
