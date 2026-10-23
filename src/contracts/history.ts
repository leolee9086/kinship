/** 历史审阅只读共享事实；游标冻结上界，详情按事件和 UUID 读取，不泄漏个人导航或媒体字节。 */
import { Type, type Static } from "@sinclair/typebox";
import { ConceptRecordSchema } from "./commands";
import { ImportProvenanceSchema } from "./importPreview";
import { LabelSchema, strictObject, UUIDSchema, VersionSchema } from "./primitives";
const PositiveVersion = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
export const HISTORY_MAX_BYTES = 1024 * 1024;
export const HistoryCursorSchema = strictObject({ workspaceId: UUIDSchema, atRevision: VersionSchema,
  beforeRevision: Type.Union([PositiveVersion, Type.Null()]) });
export const HistoryListParamsSchema = strictObject({ limit: Type.Integer({ minimum: 1, maximum: 50 }), cursor: Type.Optional(HistoryCursorSchema) });
export const HistoryConceptParamsSchema = strictObject({ eventId: UUIDSchema, conceptId: UUIDSchema });
const meta = { eventId: UUIDSchema, revision: PositiveVersion, commandId: UUIDSchema, actorId: UUIDSchema,
  occurredAt: Type.String({ format: "date-time" }), importSource: Type.Optional(ImportProvenanceSchema) };
export const HistoryResourceSchema = strictObject({ id: UUIDSchema, label: LabelSchema,
  change: Type.Union([Type.Literal("created"), Type.Literal("updated"), Type.Literal("deleted")]),
  beforeVersion: Type.Union([PositiveVersion, Type.Null()]), afterVersion: PositiveVersion });
export const HistorySummarySchema = strictObject({ ...meta, concepts: Type.Array(HistoryResourceSchema, { maxItems: 256 }),
  presentationChanged: Type.Boolean(), mediaPublished: Type.Integer({ minimum: 0, maximum: 128 }), mediaRemoved: Type.Integer({ minimum: 0, maximum: 128 }) });
export const HistoryPageSchema = strictObject({ atRevision: VersionSchema, events: Type.Array(HistorySummarySchema, { maxItems: 50 }),
  nextCursor: Type.Union([HistoryCursorSchema, Type.Null()]) });
export const HistoryConceptSchema = strictObject({ ...meta, resource: HistoryResourceSchema,
  before: Type.Union([ConceptRecordSchema, Type.Null()]), after: Type.Union([ConceptRecordSchema, Type.Null()]) });
export type HistoryCursor = Static<typeof HistoryCursorSchema>;
export type HistoryResource = Static<typeof HistoryResourceSchema>;
export type HistorySummary = Static<typeof HistorySummarySchema>;
export type HistoryPage = Static<typeof HistoryPageSchema>;
export type HistoryConcept = Static<typeof HistoryConceptSchema>;
