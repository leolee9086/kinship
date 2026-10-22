/** 一次提交包含有界的领域操作；创建、更新、删除使用不同的身份/版本前置条件。 */
import { Type, type Static } from "@sinclair/typebox";
import { ConceptSchema } from "./concept";
import { PresentationSchema, ViewStateSchema } from "./presentation";
import { MediaInfoSchema } from "./media";
import { strictObject, UUIDSchema, VersionSchema } from "./primitives";

const operation = <T extends string>(name: T) => Type.Literal(name);
export const OperationSchema = Type.Union([
  strictObject({ type: operation("concept.create"), concept: ConceptSchema }),
  strictObject({ type: operation("concept.replace"), concept: ConceptSchema, expectedVersion: VersionSchema }),
  strictObject({ type: operation("concept.deleteUnreferenced"), id: UUIDSchema, expectedVersion: VersionSchema }),
  strictObject({ type: operation("presentation.replace"), data: PresentationSchema, expectedVersion: VersionSchema }),
  strictObject({ type: operation("viewState.replace"), data: ViewStateSchema, expectedVersion: VersionSchema }),
  strictObject({ type: operation("media.publish"), data: MediaInfoSchema }),
  strictObject({ type: operation("media.remove"), id: UUIDSchema, expectedVersion: VersionSchema }),
]);
export const ApplySchema = strictObject({ operations: Type.Array(OperationSchema, { minItems: 1, maxItems: 128 }) });
export type Operation = Static<typeof OperationSchema>;
export type Apply = Static<typeof ApplySchema>;
export const ConceptRecordSchema = strictObject({ concept: ConceptSchema, version: VersionSchema });
export const PresentationRecordSchema = strictObject({ data: PresentationSchema, version: VersionSchema });
export const ViewStateRecordSchema = strictObject({ data: ViewStateSchema, version: VersionSchema });
export const DeltaSchema = strictObject({
  put: Type.Array(ConceptRecordSchema, { maxItems: 128 }),
  removed: Type.Array(strictObject({ id: UUIDSchema, version: VersionSchema }), { maxItems: 128 }),
  presentation: Type.Optional(PresentationRecordSchema), viewState: Type.Optional(ViewStateRecordSchema),
  media: Type.Optional(Type.Array(MediaInfoSchema, { maxItems: 128 })),
  removedMedia: Type.Optional(Type.Array(strictObject({ id: UUIDSchema, version: VersionSchema }), { maxItems: 128 })),
});
export const CommitSchema = strictObject({
  commandId: UUIDSchema, actorId: UUIDSchema, revision: VersionSchema, eventId: UUIDSchema,
  occurredAt: Type.String({ format: "date-time" }), replayed: Type.Boolean(), changes: DeltaSchema,
});
export type Commit = Static<typeof CommitSchema>;
export type Delta = Static<typeof DeltaSchema>;
export type ConceptRecord = Static<typeof ConceptRecordSchema>;
export type PresentationRecord = Static<typeof PresentationRecordSchema>;
export type ViewStateRecord = Static<typeof ViewStateRecordSchema>;
