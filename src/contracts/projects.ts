/** 项目目录有独立上下文；项目ID和图谱workspaceId分开。 */
import { Type, type Static } from "@sinclair/typebox";
import { strictObject, UUIDSchema, VersionSchema } from "./primitives";
import { FailureSchema } from "./errors";
export const ProjectSchema = strictObject({ id: UUIDSchema, name: Type.String({ minLength: 1, maxLength: 100 }),
  version: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }), createdAt: Type.String({ format: "date-time" }) });
export const ProjectSnapshotSchema = strictObject({ catalogId: UUIDSchema, revision: VersionSchema, activeProjectId: UUIDSchema,
  projects: Type.Array(ProjectSchema, { minItems: 1, maxItems: 1000 }) });
const base = { protocol: Type.Literal("kinship.rpc"), version: Type.Literal(1), requestId: UUIDSchema };
export const ProjectOperationSchema = Type.Union([
  strictObject({ type: Type.Literal("project.create"), id: UUIDSchema, name: ProjectSchema.properties.name }),
  strictObject({ type: Type.Literal("project.rename"), id: UUIDSchema, name: ProjectSchema.properties.name, expectedVersion: ProjectSchema.properties.version }),
  strictObject({ type: Type.Literal("project.select"), id: UUIDSchema }),
]);
export const ProjectListRequestSchema = strictObject({ ...base, params: strictObject({}) });
export const ProjectCommandRequestSchema = strictObject({ ...base, catalogId: UUIDSchema, commandId: UUIDSchema, params: ProjectOperationSchema });
export const ProjectCommandResultSchema = strictObject({ snapshot: ProjectSnapshotSchema, commandId: UUIDSchema, replayed: Type.Boolean() });
export const ProjectListReplySchema = strictObject({ ...base, ok: Type.Literal(true), result: ProjectSnapshotSchema,
  context: strictObject({ catalogId: UUIDSchema, revision: VersionSchema }) });
export const ProjectCommandReplySchema = strictObject({ ...base, ok: Type.Literal(true), result: ProjectCommandResultSchema,
  context: strictObject({ catalogId: UUIDSchema, revision: VersionSchema }) });
export const projectRegistry = {
  list: { path: "/rpc/v1/projects/list", kind: "query", role: "administrator", result: ProjectSnapshotSchema, request: ProjectListRequestSchema, reply: Type.Union([ProjectListReplySchema, FailureSchema]) },
  apply: { path: "/rpc/v1/projects/apply", kind: "command", role: "administrator", result: ProjectCommandResultSchema, request: ProjectCommandRequestSchema, reply: Type.Union([ProjectCommandReplySchema, FailureSchema]) },
} as const;
export type Project = Static<typeof ProjectSchema>;
export type ProjectSnapshot = Static<typeof ProjectSnapshotSchema>;
export type ProjectOperation = Static<typeof ProjectOperationSchema>;
export type ProjectCommand = Static<typeof ProjectCommandRequestSchema>;
export type ProjectCommandResult = Static<typeof ProjectCommandResultSchema>;
