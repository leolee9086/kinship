/** 切换先准备目标适配器，再替换当前会话；失败保留原项目与原命令供重试。 */
import { useEffect, useState } from "react";
import type { ProjectAdapter } from "../adapter/projects";
import type { DataAdapter } from "../adapter/api";
import type { ProjectOperation, ProjectSnapshot } from "../contracts/projects";
import { RpcError } from "../contracts/errors";
import { newId } from "../domain/concepts";
export function useProjects(adapter: ProjectAdapter) {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot>();
  const [session, setSession] = useState<{ id: string; adapter: DataAdapter }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [attempt, setAttempt] = useState<{ operation: ProjectOperation; commandId: string }>();
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true; setBusy(true); setError("");
    void adapter.load().then(async value => { const graph = await adapter.open(value.activeProjectId);
      if (alive) { setSnapshot(value); setSession({ id: value.activeProjectId, adapter: graph }); }
    }).catch(cause => { if (alive) setError(String(cause)); }).finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [adapter, reload]);
  const execute = async (operation?: ProjectOperation) => {
    if (busy || (!attempt && !operation)) return false;
    const next = attempt ?? { operation: operation!, commandId: newId() };
    setAttempt(next); setBusy(true); setError(""); let committed = false;
    try {
      await adapter.execute(next.operation, next.commandId); committed = true;
      const value = await adapter.load();
      const id = next.operation.type === "project.rename" ? session!.id : next.operation.id;
      const graph = id === session?.id ? session.adapter : await adapter.open(id);
      setSnapshot(value); setSession({ id, adapter: graph }); setAttempt(undefined); return true;
    } catch (cause) {
      const unknown = cause instanceof RpcError && cause.fault.code === "RESULT_UNKNOWN";
      if (!unknown && !committed) setAttempt(undefined);
      if (cause instanceof RpcError && cause.fault.code === "VERSION_CONFLICT") {
        // 另一个标签页已改名：更新目录版本，保留当前项目与表单输入供重新决定。
        try { setSnapshot(await adapter.load()); } catch { /* 仍显示原始冲突，下一次操作继续明确核对版本。 */ }
      }
      setError(`${committed ? "项目操作已保存，重新读取失败；可重试原操作。" : ""}${String(cause)}`); return false;
    } finally { setBusy(false); }
  };
  return { snapshot, session, busy, error, uncertain: Boolean(attempt), execute, retryLoad: () => setReload(value => value + 1) };
}
