/** 布局文件自己的文本协议。引用只有这一个权威表示，主体只读其校验投影。 */
import { Type, type Static } from "@sinclair/typebox";
import type { LayoutBlock } from "../contracts/document";
import { strictObject, UUIDSchema } from "../contracts/primitives";
import { parse } from "../contracts/validate";
import { fail } from "../contracts/errors";
import { newId } from "../domain/concepts";
const schema = strictObject({ layout: Type.Literal("columns"), members: Type.Array(UUIDSchema, { minItems: 1, maxItems: 16, uniqueItems: true }) });
export type LayoutText = Static<typeof schema>;
export function readLayout(text: string): LayoutText {
  let value: unknown;
  try { value = JSON.parse(text); } catch { fail("DOMAIN_CONSTRAINT", "布局文件不是有效的JSON文本"); }
  return parse(schema, value, "DOMAIN_CONSTRAINT");
}
export function newColumns(members: string[]): LayoutBlock {
  const text = JSON.stringify({ layout: "columns", members }); readLayout(text);
  return { id: newId(), kind: "layout", version: 1, mode: "whole-file", contentType: "application/vnd.kinship.layout+json", text };
}
