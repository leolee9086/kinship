/** Kramdown 区段文本只读预览/导出；应用预览仍使用原有正文结构 CAS。 */
import { Type, type Static } from "@sinclair/typebox";
import { strictObject, UUIDSchema } from "./primitives";
import { ConceptRecordSchema } from "./commands";
import { DocumentBodySchema } from "./document";
export const DocumentTextParamsSchema = strictObject({ id: UUIDSchema });
export const PreviewDocumentTextParamsSchema = strictObject({ id: UUIDSchema, text: Type.String({ maxLength: 1048576 }),
  identity: Type.Union([Type.Literal("preserve"), Type.Literal("copy")]) });
export const ExportDocumentTextSchema = strictObject({ id: UUIDSchema, version: Type.Integer({ minimum: 1 }), text: Type.String({ maxLength: 1048576 }),
  collaborative: Type.Integer({ minimum: 0, maximum: 10000 }) });
export const PreviewDocumentTextSchema = strictObject({ target: ConceptRecordSchema, candidate: Type.Union([DocumentBodySchema, Type.Null()]),
  collisions: Type.Array(UUIDSchema, { maxItems: 10000, uniqueItems: true }), added: Type.Integer({ minimum: 0, maximum: 10000 }),
  layouts: Type.Integer({ minimum: 0, maximum: 10000 }), fallback: Type.Integer({ minimum: 0, maximum: 10000 }),
  collaborative: Type.Integer({ minimum: 0, maximum: 10000 }) });
export type DocumentTextPreview = Static<typeof PreviewDocumentTextSchema>;
