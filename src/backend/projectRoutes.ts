/** 项目目录走同一POST/internal fetch边界，但使用独立catalogId上下文。 */
import { createApp } from "@leolee9086/sac-path-router/koa";
import type { RouterContext } from "@leolee9086/sac-path-router";
import { projectRegistry, ProjectListReplySchema, ProjectCommandReplySchema } from "../contracts/projects";
import { parse } from "../contracts/validate";
import { readEnvelope, requestIdentity, failure } from "./rpcBoundary";
import { readJSON } from "./requestBody";
import type { ProjectRepository } from "./projectRepository";
export function buildProjectRouter(repository: ProjectRepository) {
  const app = createApp();
  for (const method of ["list", "apply"] as const) app.post(projectRegistry[method].path, async (ctx: RouterContext) => {
    let source: unknown;
    try {
      source = await readJSON(ctx.request);
      const command = method === "apply" ? readEnvelope(projectRegistry.apply.request, source) : undefined;
      const input = command ?? readEnvelope(projectRegistry.list.request, source);
      const result = command ? await repository.apply(command) : await repository.list();
      const snapshot = "snapshot" in result ? result.snapshot : result;
      ctx.body = parse(command ? ProjectCommandReplySchema : ProjectListReplySchema, { protocol: "kinship.rpc", version: 1, ok: true,
        requestId: input.requestId, result, context: { catalogId: snapshot.catalogId, revision: snapshot.revision } }, "INTERNAL_ERROR");
      ctx.status = 200; ctx.responseHeaders.set("content-type", "application/json; charset=utf-8");
      ctx.responseHeaders.set("x-request-id", input.requestId);
    } catch (error) { failure(ctx, error, requestIdentity(source)); }
  });
  return app;
}
