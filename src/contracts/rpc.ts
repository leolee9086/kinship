/** 可枚举、可导出的 RPC 注册表。请求与结果的静态类型均从同一 JSON Schema 推导。 */
import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { ApplySchema, CommitSchema, ConceptRecordSchema, PresentationRecordSchema, ViewStateRecordSchema } from "./commands";
import { FailureSchema } from "./errors";
import { MediaIdentitySchema, MediaInfoSchema, UploadSchema } from "./media";
import { strictObject, UUIDSchema, VersionSchema } from "./primitives";
import { ExportGraphParamsSchema, GraphPackageSchema } from "./graphPackage";

const base = { protocol: Type.Literal("kinship.rpc"), version: Type.Literal(1), requestId: UUIDSchema };
const scoped = { ...base, workspaceId: UUIDSchema };
const write = { ...scoped, commandId: UUIDSchema };
export const RoleSchema = Type.Union([Type.Literal("guest"), Type.Literal("collaborator"), Type.Literal("administrator")]);
export const BootstrapSchema = strictObject({
  workspaceId: UUIDSchema, actorId: UUIDSchema, role: RoleSchema, revision: VersionSchema,
  concepts: Type.Array(ConceptRecordSchema), presentation: PresentationRecordSchema, viewState: ViewStateRecordSchema,
});
export const EventPageSchema = strictObject({ events: Type.Array(CommitSchema, { maxItems: 100 }), revision: VersionSchema,
  nextCursor: VersionSchema, hasMore: Type.Boolean(),
});
export const registry = {
  bootstrap: { path: "/rpc/v1/workspace/bootstrap", kind: "query", role: "guest",
    request: strictObject({ ...base, params: strictObject({}) }), result: BootstrapSchema },
  exportGraph: { path: "/rpc/v1/graph/export", kind: "query", role: "guest",
    request: strictObject({ ...scoped, params: ExportGraphParamsSchema }), result: GraphPackageSchema },
  apply: { path: "/rpc/v1/commands/apply", kind: "command", role: "guest",
    request: strictObject({ ...write, params: ApplySchema }), result: CommitSchema },
  commandStatus: { path: "/rpc/v1/commands/status", kind: "query", role: "guest",
    request: strictObject({ ...scoped, params: strictObject({ commandId: UUIDSchema }) }),
    result: Type.Union([strictObject({ state: Type.Literal("unknown") }),
      strictObject({ state: Type.Literal("committed"), commit: CommitSchema })]) },
  events: { path: "/rpc/v1/events/list", kind: "query", role: "guest",
    request: strictObject({ ...scoped, params: strictObject({ after: VersionSchema, limit: Type.Integer({ minimum: 1, maximum: 100 }) }) }),
    result: EventPageSchema },
  upload: { path: "/rpc/v1/media/upload", kind: "command", role: "collaborator",
    request: strictObject({ ...write, params: UploadSchema }), result: CommitSchema },
  mediaInfo: { path: "/rpc/v1/media/info", kind: "query", role: "guest",
    request: strictObject({ ...scoped, params: MediaIdentitySchema }), result: MediaInfoSchema },
  mediaContent: { path: "/rpc/v1/media/content", kind: "binary", role: "guest",
    request: strictObject({ ...scoped, params: MediaIdentitySchema }), result: MediaInfoSchema },
} as const;
export type Method = keyof typeof registry;
export type Request<M extends Method> = Static<(typeof registry)[M]["request"]>;
export type Result<M extends Method> = Static<(typeof registry)[M]["result"]>;
export type Bootstrap = Static<typeof BootstrapSchema>;
export type Role = Static<typeof RoleSchema>;
function createSuccessSchema<T extends TSchema>(result: T) {
  return strictObject({ ...base, ok: Type.Literal(true), result,
    context: strictObject({ workspaceId: UUIDSchema, revision: VersionSchema }) });
}
const successes = new WeakMap<TSchema, TSchema>();
export function successSchema<T extends TSchema>(result: T): ReturnType<typeof createSuccessSchema<T>> {
  let schema = successes.get(result);
  if (!schema) { schema = createSuccessSchema(result); successes.set(result, schema); }
  return schema as ReturnType<typeof createSuccessSchema<T>>;
}
export function responseSchema<T extends TSchema>(result: T) {
  return Type.Union([successSchema(result), FailureSchema]);
}
