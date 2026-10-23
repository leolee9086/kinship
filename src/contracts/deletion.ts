/** 删除预览是当前事实的只读计划；确认必须带回看到的空间/资源/个人状态版本。 */
import { Type, type Static } from "@sinclair/typebox";
import { ConceptRecordSchema } from "./commands";
import { strictObject, UUIDSchema, VersionSchema, LabelSchema } from "./primitives";
export const DeleteParamsSchema = strictObject({ id: UUIDSchema, expectedVersion: VersionSchema,
  expectedRevision: VersionSchema, expectedViewStateVersion: VersionSchema });
export const DeleteReferenceSchema = strictObject({ kind: Type.Union([Type.Literal("concept"), Type.Literal("view"),
  Type.Literal("perspective"), Type.Literal("navigation"), Type.Literal("core")]),
  ownerId: LabelSchema, label: LabelSchema, path: Type.String({ minLength: 1, maxLength: 1024 }) });
export const DeletePreviewSchema = strictObject({ workspaceId: UUIDSchema, revision: VersionSchema,
  target: ConceptRecordSchema, viewStateVersion: VersionSchema, blockers: Type.Array(DeleteReferenceSchema, { maxItems: 2000 }),
  clearFocus: Type.Boolean(), removeExpanded: Type.Boolean(), canDelete: Type.Boolean(), historyRetained: Type.Literal(true) });
export type DeletePreview = Static<typeof DeletePreviewSchema>;
export type DeleteReference = Static<typeof DeleteReferenceSchema>;
