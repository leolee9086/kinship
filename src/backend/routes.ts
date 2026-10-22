/** 资源边界：所有概念、配置与二进制媒体都经过同一套请求路由。 */
import { createApp } from "@leolee9086/sac-path-router/koa";
import type { RouterContext } from "@leolee9086/sac-path-router";
import { InputError } from "../domain/validation";
import type { ConceptMutation, GraphSettings } from "../domain/concepts";
import type { GraphRepository } from "./repository";

async function reply(ctx: RouterContext, work: () => Promise<unknown>, status = 200) {
  try { ctx.body = await work(); ctx.status = status; }
  catch (error) {
    ctx.status = error instanceof InputError ? error.status : 500;
    ctx.body = { error: error instanceof Error ? error.message : "存储请求失败" };
  }
}

export function buildDataRouter(repository: GraphRepository) {
  const app = createApp();
  app.get("/api/graph", ctx => reply(ctx, () => repository.load()));
  app.post("/api/concepts/mutations", ctx => reply(ctx, async () =>
    repository.mutate(await ctx.request.json() as ConceptMutation)));
  app.put("/api/settings", ctx => reply(ctx, async () =>
    repository.saveSettings(await ctx.request.json() as GraphSettings)));
  app.post("/api/media", ctx => reply(ctx, async () => {
    const form = await ctx.request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new InputError("需要 multipart/form-data 的 file 上传字段");
    return repository.upload(file, file.name);
  }, 201));
  app.get("/api/media/:id/content", ctx => reply(ctx, async () => {
    const media = await repository.media(ctx.params.id);
    ctx.responseHeaders.set("content-type", media.type);
    ctx.responseHeaders.set("content-length", String(media.size));
    return media.blob;
  }));
  app.get("/api/media/:id", ctx => reply(ctx, async () => {
    const { blob: _, ...info } = await repository.media(ctx.params.id);
    return info;
  }));
  app.delete("/api/media/:id", ctx => reply(ctx, () => repository.removeMedia(ctx.params.id)));
  return app;
}
