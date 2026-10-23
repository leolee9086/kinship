/** 正文保存扁平区段文件；普通内容没有通用树，布局也只保存自己的文本。 */
import { Type, type Static } from "@sinclair/typebox";
import { strictObject, UUIDSchema } from "./primitives";
const identity = { id: UUIDSchema, version: Type.Integer({ minimum: 1 }) };
const file = { ...identity, kind: Type.Literal("file"), contentType: Type.String({ minLength: 1, maxLength: 128 }) };
export const WholeFileBlockSchema = strictObject({ ...file, mode: Type.Literal("whole-file"), text: Type.String({ maxLength: 1048576 }) });
export const CrdtBlockSchema = strictObject({ ...file, mode: Type.Literal("crdt"),
  // JSON/RPC 中使用 base64；状态的语义和合并由适配器注册的 codec 负责。
  state: Type.String({ minLength: 4, maxLength: 4194304, pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$" }) });
export const LayoutBlockSchema = strictObject({ ...identity, kind: Type.Literal("layout"), mode: Type.Literal("whole-file"),
  contentType: Type.Literal("application/vnd.kinship.layout+json"), text: Type.String({ maxLength: 8192 }) });
export const DocumentBlockSchema = Type.Union([WholeFileBlockSchema, CrdtBlockSchema, LayoutBlockSchema]);
export const DocumentBodySchema = strictObject({ format: Type.Literal("kinship.document"), version: Type.Literal(2),
  roots: Type.Array(UUIDSchema, { maxItems: 10000, uniqueItems: true }),
  blocks: Type.Array(DocumentBlockSchema, { maxItems: 10000 }),
});
export type DocumentBody = Static<typeof DocumentBodySchema>;
export type DocumentBlock = Static<typeof DocumentBlockSchema>;
export type LayoutBlock = Static<typeof LayoutBlockSchema>;
export type FileBlock = Static<typeof WholeFileBlockSchema> | Static<typeof CrdtBlockSchema>;
