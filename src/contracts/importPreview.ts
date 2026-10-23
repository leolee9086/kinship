/** 导入预览只报告UUID匹配，不生成替代身份，不把范围外遗漏转成删除。 */
import { Type, type Static } from "@sinclair/typebox";
import { ConceptSchema } from "./concept";
import { GraphPackageSchema, MAX_PACKAGE_RECORDS } from "./graphPackage";
import { LabelSchema, strictObject, UUIDSchema, VersionSchema } from "./primitives";
const hash = Type.String({ pattern: "^[0-9a-f]{64}$" });
const resourceVersion = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
export const ImportPreviewParamsSchema = strictObject({ package: GraphPackageSchema });
export const ImportPreviewSchema = strictObject({
  packageId: UUIDSchema, packageSha256: hash, workspaceId: UUIDSchema, revision: VersionSchema,
  concepts: Type.Array(strictObject({ id: UUIDSchema, label: LabelSchema, incomingSha256: hash,
    action: Type.Union([Type.Literal("create"), Type.Literal("identical"), Type.Literal("conflict"), Type.Literal("blocked")]),
    targetVersion: Type.Optional(resourceVersion), targetSha256: Type.Optional(hash), reason: Type.Optional(Type.String()),
    targetConcept: Type.Optional(ConceptSchema),
  }), { maxItems: MAX_PACKAGE_RECORDS }),
  externals: Type.Array(strictObject({ id: UUIDSchema, label: LabelSchema,
    status: Type.Union([Type.Literal("matched"), Type.Literal("changed"), Type.Literal("missing"), Type.Literal("blocked")]),
    targetVersion: Type.Optional(resourceVersion), reason: Type.Optional(Type.String()),
  }), { maxItems: MAX_PACKAGE_RECORDS }),
});
export const ImportGraphParamsSchema = strictObject({
  package: GraphPackageSchema, packageSha256: hash, expectedRevision: VersionSchema,
  conflicts: Type.Array(strictObject({ id: UUIDSchema,
    resolution: Type.Union([Type.Literal("keep-target"), Type.Literal("use-incoming")]),
  }), { maxItems: MAX_PACKAGE_RECORDS }),
  acceptChangedExternals: Type.Array(UUIDSchema, { maxItems: MAX_PACKAGE_RECORDS, uniqueItems: true }),
});
export const ImportProvenanceSchema = strictObject({ packageId: UUIDSchema, packageSha256: hash,
  source: GraphPackageSchema.properties.source });
export const MAX_IMPORT_FILE_BYTES = 1024 * 1024;
export const ImportFileParamsSchema = strictObject({ name: Type.String({ minLength: 1, maxLength: 512 }),
  size: Type.Integer({ minimum: 1, maximum: MAX_IMPORT_FILE_BYTES }), sha256: hash });
export const ImportFileResultSchema = strictObject({ package: GraphPackageSchema, preview: ImportPreviewSchema });
export type ImportPreview = Static<typeof ImportPreviewSchema>;
