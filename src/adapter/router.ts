/**
 * 用 sac-path-router 建立数据路由，用 internalFetch 在进程内派发。
 *
 * 后端切换点只有一处：createInternalDispatch 里的 call()。
 */

import { createApp } from "@leolee9086/sac-path-router/koa";
import { buildInternalFetch } from "@leolee9086/sac-path-router";
import * as db from "./indexeddb";

export function buildDataRouter() {
  const app = createApp();

  const ok = (ctx: any, body: unknown, status = 200) => {
    ctx.status = status;
    ctx.body = body;
  };

  app.get("/api/snapshot", async (ctx: any) => {
    ok(ctx, await db.snapshot());
  });

  app.post("/api/seed", async (ctx: any) => {
    await db.seed(await ctx.request.json());
    ok(ctx, null, 204);
  });

  app.post("/api/persons", async (ctx: any) => {
    ok(ctx, await db.createPerson(await ctx.request.json()), 201);
  });
  app.patch("/api/persons/:id", async (ctx: any) => {
    ok(ctx, await db.updatePerson(ctx.params.id, await ctx.request.json()));
  });
  app.delete("/api/persons/:id", async (ctx: any) => {
    await db.deletePerson(ctx.params.id);
    ok(ctx, null, 204);
  });

  app.post("/api/families", async (ctx: any) => {
    ok(ctx, await db.createFamily(await ctx.request.json()), 201);
  });
  app.patch("/api/families/:id", async (ctx: any) => {
    ok(ctx, await db.updateFamily(ctx.params.id, await ctx.request.json()));
  });
  app.delete("/api/families/:id", async (ctx: any) => {
    await db.deleteFamily(ctx.params.id);
    ok(ctx, null, 204);
  });

  app.post("/api/families/ensure-child", async (ctx: any) => {
    const { focusId, childId } = await ctx.request.json();
    ok(ctx, await db.ensureFamilyForChild(focusId, childId));
  });
  app.post("/api/families/ensure-parent", async (ctx: any) => {
    const { focusId, parentId } = await ctx.request.json();
    ok(ctx, await db.ensureFamilyForParent(focusId, parentId));
  });
  app.post("/api/families/ensure-spouse", async (ctx: any) => {
    const { focusId, spouseId } = await ctx.request.json();
    ok(ctx, await db.ensureFamilyForSpouse(focusId, spouseId));
  });

  app.post("/api/events", async (ctx: any) => {
    ok(ctx, await db.createEvent(await ctx.request.json()), 201);
  });
  app.patch("/api/events/:id", async (ctx: any) => {
    ok(ctx, await db.updateEvent(ctx.params.id, await ctx.request.json()));
  });
  app.delete("/api/events/:id", async (ctx: any) => {
    await db.deleteEvent(ctx.params.id);
    ok(ctx, null, 204);
  });

  app.post("/api/places", async (ctx: any) => {
    ok(ctx, await db.createPlace(await ctx.request.json()), 201);
  });
  app.patch("/api/places/:id", async (ctx: any) => {
    ok(ctx, await db.updatePlace(ctx.params.id, await ctx.request.json()));
  });
  app.delete("/api/places/:id", async (ctx: any) => {
    await db.deletePlace(ctx.params.id);
    ok(ctx, null, 204);
  });

  return app;
}

/**
 * 把 internalFetch 包成 Dispatch。
 *
 * 这是整个项目唯一的后端切换点：
 * - 现在：internalFetch 同进程派发
 * - 将来：换成 fetch("http://localhost:8787" + path, ...) 打 Rust 服务
 */
export function createInternalDispatch(app: ReturnType<typeof buildDataRouter>) {
  const call = buildInternalFetch(app);

  return async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const ctx: any = await call(path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (ctx.status === 204) return undefined;
    if (ctx.status >= 400) throw new Error(`${ctx.status} ${JSON.stringify(ctx.body)}`);
    return ctx.body;
  };
}
