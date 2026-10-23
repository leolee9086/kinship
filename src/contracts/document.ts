/** 正文交换树：UUID 块、顺序明确的子块和有类型行内内容；不保存 DOM 或特定编辑器 JSON。 */
import { Type, type Static } from "@sinclair/typebox";
import { strictObject, UUIDSchema } from "./primitives";
export const InlineMarkSchema = Type.Union([
  ...(["bold", "italic", "strike", "code"] as const).map(kind => strictObject({ kind: Type.Literal(kind) })),
  strictObject({ kind: Type.Literal("link"), href: Type.String({ maxLength: 4096, pattern: "^(https?://|mailto:)" }),
    title: Type.Optional(Type.String({ maxLength: 512 })) }),
]);
export const InlineSchema = Type.Union([
  strictObject({ kind: Type.Literal("text"), text: Type.String({ minLength: 1, maxLength: 65536 }),
    marks: Type.Array(InlineMarkSchema, { maxItems: 5 }) }),
  strictObject({ kind: Type.Literal("break") }),
]);
export const DocumentBlockSchema = strictObject({
  id: UUIDSchema,
  kind: Type.Union(( ["paragraph", "heading", "quote", "code", "divider"] as const).map(kind => Type.Literal(kind))),
  children: Type.Array(UUIDSchema, { maxItems: 10000, uniqueItems: true }),
  content: Type.Array(InlineSchema, { maxItems: 10000 }),
  level: Type.Optional(Type.Integer({ minimum: 1, maximum: 6 })),
  language: Type.Optional(Type.String({ maxLength: 64 })),
});
export const DocumentBodySchema = strictObject({ format: Type.Literal("kinship.document"), version: Type.Literal(1),
  roots: Type.Array(UUIDSchema, { minItems: 1, maxItems: 10000, uniqueItems: true }),
  blocks: Type.Array(DocumentBlockSchema, { minItems: 1, maxItems: 10000 }),
});
export type DocumentBody = Static<typeof DocumentBodySchema>;
export type DocumentBlock = Static<typeof DocumentBlockSchema>;
export type Inline = Static<typeof InlineSchema>;
