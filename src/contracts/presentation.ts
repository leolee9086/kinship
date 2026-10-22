/** 展示定义和个人视图状态分别校验，存储与接口可以独立并发控制。 */
import { Type } from "@sinclair/typebox";
import { LabelSchema, ModeSchema, RegionSchema, strictObject, UUIDSchema } from "./primitives";

const classification = Type.Record(UUIDSchema, ModeSchema);
export const PerspectiveSchema = strictObject({ id: UUIDSchema, label: LabelSchema, description: Type.String({ maxLength: 4096 }),
  relations: classification, concepts: classification,
});
export const RegionRuleSchema = strictObject({ id: LabelSchema, relationType: UUIDSchema,
  focusRole: Type.Optional(UUIDSchema), otherRole: Type.Optional(UUIDSchema), region: RegionSchema,
  priority: Type.Number({ minimum: -100000, maximum: 100000 }),
});
export const GraphViewSchema = strictObject({ id: LabelSchema, label: LabelSchema, description: Type.String({ maxLength: 4096 }),
  primaryTypes: Type.Array(UUIDSchema, { maxItems: 128, uniqueItems: true }),
  rules: Type.Array(RegionRuleSchema, { minItems: 1, maxItems: 1024 }),
  regionLabels: strictObject({ up: LabelSchema, down: LabelSchema, left: LabelSchema, right: LabelSchema }),
});
export const PresentationSchema = strictObject({
  views: Type.Array(GraphViewSchema, { minItems: 1, maxItems: 128 }),
  presets: Type.Array(PerspectiveSchema, { minItems: 1, maxItems: 128 }),
});
const spacing = Type.Number({ minimum: 16, maximum: 1000 });
export const ViewStateSchema = strictObject({
  viewId: LabelSchema, presetId: UUIDSchema, focusId: Type.Union([UUIDSchema, Type.Null()]),
  depth: Type.Integer({ minimum: 1, maximum: 12 }),
  overrides: Type.Record(UUIDSchema, strictObject({ relations: classification, concepts: classification })),
  regionGaps: strictObject({ up: spacing, down: spacing, left: spacing, right: spacing }),
  regionOverrides: Type.Record(Type.String({ maxLength: 512 }), RegionSchema),
  colorAxis: Type.Union([Type.Literal("relation"), Type.Literal("parent-role"), Type.Literal("child-role"), Type.Literal("role-pair")]),
  colorDepth: Type.Integer({ minimum: 0, maximum: 12 }),
  palette: Type.Record(Type.String({ maxLength: 2048 }), Type.String({ pattern: "^#[0-9a-fA-F]{6}$" })),
  dimOpacity: Type.Number({ minimum: 0, maximum: 1 }), showRelationLabels: Type.Boolean(),
  curve: strictObject({ type: Type.Union([Type.Literal("bezier"), Type.Literal("straight")]), curvature: Type.Number({ minimum: 0, maximum: 3 }) }),
  expandedRelations: Type.Array(UUIDSchema, { maxItems: 10000, uniqueItems: true }),
  background: strictObject({ mediaId: Type.Union([UUIDSchema, Type.Null()]), opacity: Type.Number({ minimum: 0, maximum: 1 }),
    blur: Type.Number({ minimum: 0, maximum: 24 }), paused: Type.Boolean() }),
});
