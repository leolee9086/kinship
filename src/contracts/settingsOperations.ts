/** 定义按 UUID 修改；个人状态只发送本次改动的字段，版本仍在后端检查。 */
import { Type } from "@sinclair/typebox";
import { GraphViewSchema, PerspectiveSchema, ViewStateSchema } from "./presentation";
import { LabelSchema, strictObject, UUIDSchema, VersionSchema } from "./primitives";
const expected = { expectedVersion: VersionSchema };
export const settingsOperations = [
  strictObject({ type: Type.Literal("view.create"), ...expected, view: GraphViewSchema }),
  strictObject({ type: Type.Literal("view.updateFields"), ...expected, id: LabelSchema,
    fields: Type.Partial(Type.Omit(GraphViewSchema, ["id"]), { minProperties: 1, additionalProperties: false }) }),
  strictObject({ type: Type.Literal("view.delete"), ...expected, id: LabelSchema }),
  strictObject({ type: Type.Literal("perspective.create"), ...expected, perspective: PerspectiveSchema }),
  strictObject({ type: Type.Literal("perspective.updateFields"), ...expected, id: UUIDSchema,
    fields: Type.Partial(Type.Omit(PerspectiveSchema, ["id"]), { minProperties: 1, additionalProperties: false }) }),
  strictObject({ type: Type.Literal("perspective.delete"), ...expected, id: UUIDSchema }),
  strictObject({ type: Type.Literal("viewState.updateFields"), ...expected,
    fields: Type.Partial(ViewStateSchema, { minProperties: 1, additionalProperties: false }) }),
] as const;
