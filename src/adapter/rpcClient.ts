/** 严格 RPC 客户端。调用方可保留 commandId 重试；传输失败不能解释成业务未提交。 */
import type { TSchema } from "@sinclair/typebox";
import { registry, responseSchema, type Method, type Request, type Result } from "../contracts/rpc";
import { RpcError, ERROR_STATUS, fail } from "../contracts/errors";
import { parse } from "../contracts/validate";
import { newId } from "../domain/concepts";
import { sha256 } from "../format/digest";
import type { Dispatch, TransportResponse } from "./transport";
import { verifyPackageResponse } from "./packageResponse";
import { verifyImportFile, verifyImportPreview } from "./importResponse";
import { verifyCommit } from "./commitResponse";
import { verifyDeletePreview, verifyDeletion } from "./deletionResponse";
import { verifyHistoryConcept, verifyHistoryPage } from "./historyResponse";
import { verifyDocumentTextFile, verifyDocumentTextPreview } from "./documentTextResponse";

export interface CallOptions { commandId?: string; file?: File; signal?: AbortSignal }
export type CallResult<M extends Method> = M extends "mediaContent" ? Blob : Result<M>;
interface Reply<M extends Method> { ok: true; requestId: string; result: Result<M>; context: { workspaceId: string; revision: number } }
const responses = new Map<Method, TSchema>();
export class RpcClient {
  private workspaceId: string | null = null;
  constructor(private readonly dispatch: Dispatch) {}
  async call<M extends Method>(name: M, params: Request<M>["params"], options: CallOptions = {}): Promise<CallResult<M>> {
    const contract = registry[name], commandId = contract.kind === "command" ? options.commandId ?? newId() : undefined;
    if (name !== "bootstrap" && !this.workspaceId) fail("INVALID_REQUEST", "请先打开工作区");
    const input = { protocol: "kinship.rpc", version: 1, requestId: newId(), params,
      ...(name === "bootstrap" ? {} : { workspaceId: this.workspaceId }), ...(commandId ? { commandId } : {}) };
    parse(contract.request, input);
    let body: unknown = input;
    if (name === "upload" || name === "previewImportFile" || name === "previewDocumentTextFile") {
      if (!options.file) fail("INVALID_REQUEST", "上传请求缺少文件");
      const form = new FormData(); form.set("request", JSON.stringify(input)); form.set("file", options.file, options.file.name); body = form;
    }
    let response: TransportResponse;
    try { response = await this.dispatch(contract.path, body, options.signal); }
    catch { fail(commandId ? "RESULT_UNKNOWN" : "TEMPORARILY_UNAVAILABLE", commandId ? "未能确认提交结果，请使用原命令 ID 查询或重试" : "读取请求未能完成",
      { requestId: input.requestId, ...(commandId ? { commandId } : {}) }, true); }
    if (contract.kind === "binary" && response.status === 200) return this.binary(input.requestId, params, response) as Promise<CallResult<M>>;
    let envelope: Reply<M> | { ok: false; requestId: string | null; error: RpcError["fault"] };
    try {
      let schema = responses.get(name);
      if (!schema) { schema = responseSchema(contract.result); responses.set(name, schema); }
      envelope = parse(schema, response.body, "INTERNAL_ERROR") as typeof envelope;
      if (envelope.requestId !== input.requestId && (envelope.ok || envelope.requestId !== null)) throw new Error("request ID mismatch");
      if (envelope.ok && (response.status !== 200 || (name !== "bootstrap" && envelope.context.workspaceId !== this.workspaceId))) throw new Error("invalid response context");
      if (!envelope.ok && response.status !== ERROR_STATUS[envelope.error.code]) throw new Error("invalid error status");
      if (envelope.ok && commandId) verifyCommit(envelope.result, envelope.context.revision, commandId,
        name === "importGraph" ? parse(registry.importGraph.request, input).params : undefined);
      if (envelope.ok && name === "previewDelete") verifyDeletePreview(parse(registry.previewDelete.result, envelope.result, "INTERNAL_ERROR"),
        parse(registry.previewDelete.request, input).params.id, envelope.context);
      if (envelope.ok && name === "deleteConcept") verifyDeletion(parse(registry.deleteConcept.result, envelope.result, "INTERNAL_ERROR"),
        parse(registry.deleteConcept.request, input).params);
      if (envelope.ok && name === "exportDocumentText") {
        if (parse(registry.exportDocumentText.result, envelope.result, "INTERNAL_ERROR").id !== parse(registry.exportDocumentText.request, input).params.id)
          throw new Error("document export target mismatch");
      }
      if (envelope.ok && name === "previewDocumentText") verifyDocumentTextPreview(parse(registry.previewDocumentText.request, input).params.id,
        parse(registry.previewDocumentText.result, envelope.result, "INTERNAL_ERROR"));
      if (envelope.ok && name === "previewDocumentTextFile") verifyDocumentTextFile(parse(registry.previewDocumentTextFile.request, input).params,
        parse(registry.previewDocumentTextFile.result, envelope.result, "INTERNAL_ERROR"));
      if (envelope.ok && name === "historyList") verifyHistoryPage(parse(registry.historyList.result, envelope.result, "INTERNAL_ERROR"),
        parse(registry.historyList.request, input).params, envelope.context);
      if (envelope.ok && name === "historyConcept") verifyHistoryConcept(parse(registry.historyConcept.result, envelope.result, "INTERNAL_ERROR"),
        parse(registry.historyConcept.request, input).params, envelope.context);
    } catch { fail(commandId ? "RESULT_UNKNOWN" : "INTERNAL_ERROR", "服务响应未通过协议校验", { requestId: input.requestId, ...(commandId ? { commandId } : {}) }, Boolean(commandId)); }
    if (!envelope.ok) throw new RpcError(envelope.error);
    if (name === "bootstrap") {
      const result = parse(registry.bootstrap.result, envelope.result, "INTERNAL_ERROR");
      if (result.workspaceId !== envelope.context.workspaceId || result.revision !== envelope.context.revision) fail("INTERNAL_ERROR", "工作区快照上下文不一致");
      this.workspaceId = result.workspaceId;
    }
    if (name === "exportGraph") await verifyPackageResponse(parse(registry.exportGraph.result, envelope.result, "INTERNAL_ERROR"), envelope.context);
    if (name === "previewImportFile") await verifyImportFile(parse(registry.previewImportFile.result, envelope.result, "INTERNAL_ERROR"), envelope.context);
    if (name === "previewImport") {
      await verifyImportPreview(parse(registry.previewImport.request, input).params.package,
        parse(registry.previewImport.result, envelope.result, "INTERNAL_ERROR"), envelope.context);
    }
    return envelope.result as CallResult<M>;
  }
  private async binary(requestId: string, params: unknown, response: TransportResponse): Promise<Blob> {
    const headers = response.headers, body = response.body;
    const requested = params as { id: string }, id = headers.get("x-resource-id"), version = headers.get("x-resource-version");
    const digest = headers.get("x-content-sha256"), length = headers.get("content-length"), revision = headers.get("x-workspace-revision");
    if (!(body instanceof Blob) || headers.get("x-request-id") !== requestId || headers.get("x-kinship-protocol") !== "kinship.rpc/1"
      || headers.get("x-workspace-id") !== this.workspaceId || id !== requested.id || !/^[1-9][0-9]*$/.test(version ?? "")
      || !/^[0-9]+$/.test(revision ?? "") || !Number.isSafeInteger(Number(revision)) || !/^[1-9][0-9]*$/.test(length ?? "")
      || Number(length) !== body.size || headers.get("content-type") !== body.type || !/^[0-9a-f]{64}$/.test(digest ?? "")
      || await sha256(body) !== digest) fail("INTERNAL_ERROR", "媒体响应元数据或内容摘要不符");
    // Blob 是二进制操作的返回值；JSON 注册表的 result 描述其响应头元数据。
    return body;
  }
}
