/** Kramdown 区段文本只读预览/导出；应用预览仍使用原有正文结构 CAS。 */
import { Type, type Static } from "@sinclair/typebox";
import { strictObject, UUIDSchema } from "./primitives";
import { ConceptRecordSchema } from "./commands";
import { DocumentBodySchema } from "./document";
export const DocumentTextParamsSchema = strictObject({ id: UUIDSchema });
export const MAX_DOCUMENT_TEXT_BYTES = 1048576;
const identity = Type.Union([Type.Literal("preserve"), Type.Literal("copy")]);
const source = { name: Type.String({ minLength: 1, maxLength: 512 }), size: Type.Integer({ minimum: 0, maximum: MAX_DOCUMENT_TEXT_BYTES }),
  sha256: Type.String({ pattern: "^[0-9a-f]{64}$" }) };
export const PreviewDocumentTextParamsSchema = strictObject({ id: UUIDSchema, text: Type.String({ maxLength: MAX_DOCUMENT_TEXT_BYTES }), identity });
export const PreviewDocumentFileParamsSchema = strictObject({ id: UUIDSchema, identity, ...source });
export const ExportDocumentTextSchema = strictObject({ id: UUIDSchema, version: Type.Integer({ minimum: 1 }), text: Type.String({ maxLength: 1048576 }),
  collaborative: Type.Integer({ minimum: 0, maximum: 10000 }) });
export const PreviewDocumentTextSchema = strictObject({ target: ConceptRecordSchema, candidate: Type.Union([DocumentBodySchema, Type.Null()]),
  collisions: Type.Array(UUIDSchema, { maxItems: 10000, uniqueItems: true }), added: Type.Integer({ minimum: 0, maximum: 10000 }),
  layouts: Type.Integer({ minimum: 0, maximum: 10000 }), fallback: Type.Integer({ minimum: 0, maximum: 10000 }),
  collaborative: Type.Integer({ minimum: 0, maximum: 10000 }) });
export const PreviewDocumentFileSchema = strictObject({ source: strictObject(source), preview: PreviewDocumentTextSchema });
export type DocumentTextPreview = Static<typeof PreviewDocumentTextSchema>;
