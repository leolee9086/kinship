/** 项目目录与图谱均通过适配器；打开得到固定项目的DataAdapter，不依赖全局当前库。 */
import { projectRegistry, type ProjectOperation, type ProjectSnapshot, type ProjectCommandResult } from "../contracts/projects";
import { parse } from "../contracts/validate";
import { ERROR_STATUS, RpcError, fail } from "../contracts/errors";
import { newId } from "../domain/concepts";
import type { Dispatch, TransportResponse } from "./transport";
import type { DataAdapter } from "./api";
export interface ProjectAdapter {
  load(): Promise<ProjectSnapshot>;
  execute(operation: ProjectOperation, commandId: string): Promise<ProjectCommandResult>;
  open(id: string): Promise<DataAdapter>;
}
export function createProjectAdapter(dispatch: Dispatch, openWorkspace: (id: string) => Promise<DataAdapter>): ProjectAdapter {
  let catalogId: string | undefined;
  const call = async (operation?: ProjectOperation, commandId?: string) => {
    const method = operation ? "apply" : "list", contract = projectRegistry[method], requestId = newId();
    const input = operation ? { protocol: "kinship.rpc", version: 1, requestId, catalogId, commandId, params: operation }
      : { protocol: "kinship.rpc", version: 1, requestId, params: {} };
    parse(contract.request, input);
    let response: TransportResponse;
    try { response = await dispatch(contract.path, input); }
    catch { fail(operation ? "RESULT_UNKNOWN" : "TEMPORARILY_UNAVAILABLE", operation ? "项目操作结果尚未确认，请原样重试" : "无法读取项目目录", undefined, true); }
    try {
      const envelope = parse(contract.reply, response.body, "INTERNAL_ERROR");
      if (envelope.requestId !== requestId && (envelope.ok || envelope.requestId !== null)) throw new Error("request mismatch");
      if (!envelope.ok) { if (response.status !== ERROR_STATUS[envelope.error.code]) throw new Error("status mismatch"); throw new RpcError(envelope.error); }
      if (response.status !== 200) throw new Error("status mismatch");
      const snapshot = "snapshot" in envelope.result ? envelope.result.snapshot : envelope.result;
      if (envelope.context.catalogId !== snapshot.catalogId || envelope.context.revision !== snapshot.revision
        || (catalogId && catalogId !== snapshot.catalogId) || new Set(snapshot.projects.map(p => p.id)).size !== snapshot.projects.length
        || !snapshot.projects.some(p => p.id === snapshot.activeProjectId)) throw new Error("catalog context mismatch");
      if (operation && (!("commandId" in envelope.result) || envelope.result.commandId !== commandId)) throw new Error("command mismatch");
      catalogId = snapshot.catalogId; return envelope.result;
    } catch (error) {
      if (error instanceof RpcError && error.fault.code !== "INTERNAL_ERROR") throw error;
      fail(operation ? "RESULT_UNKNOWN" : "INTERNAL_ERROR", operation ? "项目操作结果无法核对，请保留原命令重试" : "项目目录响应无法核对", undefined, Boolean(operation));
    }
  };
  return {
    load: async () => await call() as ProjectSnapshot,
    execute: async (operation, commandId) => { if (!catalogId) await call(); return await call(operation, commandId) as ProjectCommandResult; },
    open: async id => { const adapter = await openWorkspace(id); await adapter.load(); return adapter; },
  };
}
