/** 文件与远端后端共享的局部图谱包；未包含的资源明确标记，绝不暗示删除。 */
import { Type, type Static } from "@sinclair/typebox";
import { ConceptSchema } from "./concept";
import { AttributesSchema, LabelSchema, strictObject, UUIDSchema, VersionSchema } from "./primitives";

export const MAX_PACKAGE_RECORDS = 10_000;
export const MAX_PACKAGE_BYTES = 16 * 1024 * 1024;
const ids = (minItems = 0) => Type.Array(UUIDSchema, { minItems, maxItems: MAX_PACKAGE_RECORDS, uniqueItems: true });
const digest = Type.String({ pattern: "^[0-9a-f]{64}$" });
const resourceVersion = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
export const PackageRecordSchema = strictObject({ concept: ConceptSchema, version: resourceVersion, sha256: digest });
export const ExternalReferenceSchema = strictObject({
  id: UUIDSchema, label: LabelSchema, version: resourceVersion, sha256: digest,
  kind: Type.Union([Type.Literal("concept"), Type.Literal("type"), Type.Literal("role"), Type.Literal("relation")]),
});
export const GraphPackageSchema = strictObject({
  format: Type.Literal("kinship.graph-package"), spec: Type.Literal(2), id: UUIDSchema,
  source: strictObject({ workspaceId: UUIDSchema, revision: VersionSchema }),
  mode: Type.Union([Type.Literal("standalone"), Type.Literal("boundary")]),
  entrypoints: ids(1), selected: ids(1), dependencies: ids(),
  concepts: Type.Array(PackageRecordSchema, { minItems: 1, maxItems: MAX_PACKAGE_RECORDS }),
  externals: Type.Array(ExternalReferenceSchema, { maxItems: MAX_PACKAGE_RECORDS }),
  coverage: strictObject({
    concepts: Type.Literal("complete-records"), documents: Type.Literal("concept-bodies"),
    media: Type.Literal("omitted"), presentation: Type.Literal("omitted"), history: Type.Literal("omitted"),
  }),
  extensions: Type.Optional(AttributesSchema),
});
export const ExportGraphParamsSchema = strictObject({
  selected: ids(1), entrypoints: ids(1), mode: GraphPackageSchema.properties.mode,
  maxRecords: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_PACKAGE_RECORDS })),
  maxBytes: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_PACKAGE_BYTES })),
});
export type GraphPackage = Static<typeof GraphPackageSchema>;
