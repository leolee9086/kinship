/** 概念与参与槽的结构契约，领域继承/引用/角色约束另由领域校验负责。 */
import { Type } from "@sinclair/typebox";
import { AttributesSchema, LabelSchema, strictObject, UUIDSchema } from "./primitives";

export const ParticipationSchema = strictObject({ id: UUIDSchema, role: UUIDSchema, concept: UUIDSchema });
export const RoleConstraintSchema = strictObject({ role: UUIDSchema,
  min: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000 })),
  max: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000 })),
});
export const ConceptSchema = strictObject({
  id: UUIDSchema, label: LabelSchema,
  aliases: Type.Optional(Type.Array(LabelSchema, { maxItems: 256, uniqueItems: true })),
  description: Type.Optional(Type.String({ maxLength: 65536 })),
  types: Type.Array(UUIDSchema, { minItems: 1, maxItems: 128, uniqueItems: true }),
  broader: Type.Optional(Type.Array(UUIDSchema, { maxItems: 128, uniqueItems: true })),
  participants: Type.Optional(Type.Array(ParticipationSchema, { minItems: 2, maxItems: 10000 })),
  schema: Type.Optional(strictObject({
    roles: Type.Optional(Type.Array(RoleConstraintSchema, { maxItems: 256 })),
    symmetric: Type.Optional(Type.Boolean()), color: Type.Optional(Type.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
  })),
  properties: Type.Optional(AttributesSchema),
});
