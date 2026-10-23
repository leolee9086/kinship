/** 常规编辑按概念字段和稳定参与槽表达；不会通过整份 replace 丢失未编辑字段。 */
import { Type } from "@sinclair/typebox";
import { ConceptSchema, ParticipationSchema } from "./concept";
import { strictObject, UUIDSchema, VersionSchema } from "./primitives";
const target = { id: UUIDSchema, expectedVersion: VersionSchema };
export const ConceptFieldsSchema = Type.Partial(Type.Omit(ConceptSchema, ["id", "participants", "forgotten"]), { minProperties: 1, additionalProperties: false });
const removable = Type.Union((["aliases", "description", "broader", "schema", "properties", "body"] as const).map(value => Type.Literal(value)));
export const conceptOperations = [
  strictObject({ type: Type.Literal("concept.create"), concept: ConceptSchema }),
  strictObject({ type: Type.Literal("concept.updateFields"), ...target, fields: ConceptFieldsSchema }),
  strictObject({ type: Type.Literal("concept.unsetFields"), ...target, fields: Type.Array(removable, { minItems: 1, maxItems: 6, uniqueItems: true }) }),
  strictObject({ type: Type.Literal("concept.deleteUnreferenced"), ...target }),
  strictObject({ type: Type.Literal("concept.forget"), ...target }),
  strictObject({ type: Type.Literal("concept.restore"), ...target }),
  strictObject({ type: Type.Literal("relation.addParticipation"), ...target, participation: ParticipationSchema,
    afterId: Type.Union([UUIDSchema, Type.Null()]) }),
  strictObject({ type: Type.Literal("relation.updateParticipation"), ...target, slotId: UUIDSchema,
    fields: Type.Partial(Type.Omit(ParticipationSchema, ["id"]), { minProperties: 1, additionalProperties: false }) }),
  strictObject({ type: Type.Literal("relation.removeParticipation"), ...target, slotId: UUIDSchema }),
  strictObject({ type: Type.Literal("relation.moveParticipation"), ...target, slotId: UUIDSchema, afterId: Type.Union([UUIDSchema, Type.Null()]) }),
] as const;
