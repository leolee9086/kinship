/** 版本化概念集合文件。依赖由调用方显式提供，不按名称猜测或生成缺失概念。 */
import { Type, type Static } from "@sinclair/typebox";
import { ConceptSchema } from "../contracts/concept";
import { AttributesSchema, strictObject, UUIDSchema } from "../contracts/primitives";
import { parse } from "../contracts/validate";
import type { Concept } from "../domain/concepts";
import { assert } from "../domain/inputValidation";
import { validateConcepts } from "../domain/validation";
import { canonicalJSON } from "./json";

export const ConceptFileSchema = strictObject({
  format: Type.Literal("kinship.concepts"), spec: Type.Literal(1), id: UUIDSchema,
  concepts: Type.Array(ConceptSchema, { minItems: 1, maxItems: 1000000 }),
  focusId: Type.Optional(UUIDSchema), extensions: Type.Optional(AttributesSchema),
});
export type ConceptFile = Static<typeof ConceptFileSchema>;
export function readConceptFile(source: unknown, dependencies: readonly Concept[] = []): ConceptFile {
  const value = parse(ConceptFileSchema, typeof source === "string" ? JSON.parse(source) : source, "DOMAIN_CONSTRAINT");
  canonicalJSON(value);
  const concepts = validateConcepts([...dependencies, ...value.concepts]);
  assert(value.focusId === undefined || concepts.some(concept => concept.id === value.focusId), "文件焦点没有对应概念");
  return structuredClone(value);
}
export function writeConceptFile(value: ConceptFile, dependencies: readonly Concept[] = []): string {
  return canonicalJSON(readConceptFile(value, dependencies));
}
