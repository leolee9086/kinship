/** 注册表绑定到 POST 路由；结构契约、授权与二进制响应遵守同一个版本化协议。 */
import { createApp } from "@leolee9086/sac-path-router/koa";
import type { RouterContext } from "@leolee9086/sac-path-router";
import { fail } from "../contracts/errors";
import { registry, type Method, type Request, type Role } from "../contracts/rpc";
import { parse } from "../contracts/validate";
import { readEnvelope, requestIdentity, success, failure } from "./rpcBoundary";
import { readJSON, readUpload } from "./requestBody";
import type { GraphRepository } from "./repository";
import { queryGraphPackage } from "./packageQuery";
import { previewImportFile } from "./importFile";
import { MAX_IMPORT_FILE_BYTES } from "../contracts/importPreview";

interface Reply { result: unknown; workspaceId: string; revision: number; binary?: Blob }
const rank: Record<Role, number> = { guest: 0, collaborator: 1, administrator: 2 };
export function buildDataRouter(repository: GraphRepository) {
  const app = createApp();
  const bind = <M extends Method>(name: M, work: (input: Request<M>, file?: File) => Promise<Reply>) => {
    const contract = registry[name];
    app.post(contract.path, async (ctx: RouterContext) => {
      let source: unknown;
      try {
        const uploaded = name === "upload" ? await readUpload(ctx.request)
          : name === "previewImportFile" ? await readUpload(ctx.request, MAX_IMPORT_FILE_BYTES, 65536) : undefined;
        source = uploaded ? uploaded.source : await readJSON(ctx.request);
        // 注册表的 schema 与工作函数由同一个名字关联，动态分发处集中做这一次类型桥接。
        const input = readEnvelope(contract.request, source) as Request<M>;
        if (rank[repository.role] < rank[contract.role]) fail("FORBIDDEN", "当前空间角色不允许该操作");
        const reply = await work(input, uploaded?.file);
        if (reply.binary) {
          const info = parse(registry.mediaContent.result, reply.result, "INTERNAL_ERROR");
          ctx.body = reply.binary; ctx.status = 200;
          const headers = { "content-type": info.type, "content-length": String(info.size), "cache-control": "no-store",
            "x-request-id": input.requestId, "x-kinship-protocol": "kinship.rpc/1", "x-workspace-id": reply.workspaceId,
            "x-workspace-revision": String(reply.revision), "x-resource-id": info.id, "x-resource-version": String(info.version),
            "x-content-sha256": info.sha256 };
          for (const [key, value] of Object.entries(headers)) ctx.responseHeaders.set(key, value);
        } else success(ctx, contract.result, input.requestId, reply.result, reply.workspaceId, reply.revision);
      } catch (error) { failure(ctx, error, requestIdentity(source)); }
    });
  };
  bind("bootstrap", async () => { const result = await repository.bootstrap();
    return { result, workspaceId: result.workspaceId, revision: result.revision }; });
  bind("readConcept", async input => { const reply = await repository.readConcept(input); return { result: reply.value, ...reply.context }; });
  bind("exportGraph", input => queryGraphPackage(repository, input));
  bind("previewImportFile", (input, file) => previewImportFile(repository, input, file));
  bind("previewImport", async input => { const reply = await repository.previewImport(input); return { result: reply.value, ...reply.context }; });
  bind("importGraph", async input => { const result = await repository.importGraph(input);
    return { result, workspaceId: input.workspaceId, revision: result.revision }; });
  bind("previewDelete", async input => { const reply = await repository.previewDelete(input); return { result: reply.value, ...reply.context }; });
  bind("deleteConcept", async input => { const result = await repository.deleteConcept(input);
    return { result, workspaceId: input.workspaceId, revision: result.revision }; });
  bind("apply", async input => { const result = await repository.apply(input);
    return { result, workspaceId: input.workspaceId, revision: result.revision }; });
  bind("commandStatus", async input => { const reply = await repository.commandStatus(input); return { result: reply.value, ...reply.context }; });
  bind("events", async input => { const reply = await repository.events(input); return { result: reply.value, ...reply.context }; });
  bind("historyList", async input => { const reply = await repository.historyList(input); return { result: reply.value, ...reply.context }; });
  bind("historyConcept", async input => { const reply = await repository.historyConcept(input); return { result: reply.value, ...reply.context }; });
  bind("upload", async (input, file) => {
    if (!file || file.name !== input.params.name) fail("INVALID_REQUEST", "上传文件名与元数据不符");
    const result = await repository.upload(input, file); return { result, workspaceId: input.workspaceId, revision: result.revision };
  });
  bind("mediaInfo", async input => { const reply = await repository.media(input.workspaceId, input.params.id);
    const { blob: _, ...result } = reply.value; return { result, ...reply.context }; });
  bind("mediaContent", async input => { const reply = await repository.media(input.workspaceId, input.params.id);
    const { blob, ...result } = reply.value; return { result, binary: blob, ...reply.context }; });
  return app;
}
