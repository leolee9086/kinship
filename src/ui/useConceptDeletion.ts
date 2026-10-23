/** 只读预览和提交尝试分开；结果不明时锁定原计划/命令，不能换成新的删除。 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DataAdapter } from "../adapter/api";
import type { CallOptions } from "../adapter/rpcClient";
import type { Commit } from "../contracts/commands";
import type { DeletePreview } from "../contracts/deletion";
import type { Request } from "../contracts/rpc";
import { RpcError } from "../contracts/errors";
import { newId } from "../domain/concepts";
type Params = Request<"deleteConcept">["params"];
export type DeleteAction = (params: Params, options: CallOptions) => Promise<Commit>;
export function useConceptDeletion(adapter: DataAdapter, id: string, apply: DeleteAction) {
  const [preview, setPreview] = useState<DeletePreview | null>(null), [busy, setBusy] = useState(true);
  const [error, setError] = useState(""), [uncertain, setUncertain] = useState(false), [needsRefresh, setNeedsRefresh] = useState(false);
  const [finished, setFinished] = useState<Commit | null>(null), [generation, setGeneration] = useState(0);
  const attempt = useRef<{ params: Params; commandId: string } | null>(null);
  useEffect(() => {
    let active = true; setBusy(true); setPreview(null); setError(""); setNeedsRefresh(false); attempt.current = null;
    void adapter.previewDelete(id).then(result => { if (active) setPreview(result); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [adapter, id, generation]);
  const refresh = useCallback(() => { if (!busy && !uncertain && !finished) setGeneration(value => value + 1); }, [busy, uncertain, finished]);
  const submit = async () => {
    if (busy || finished || (!uncertain && (!preview?.canDelete || needsRefresh))) return;
    if (!attempt.current && preview) attempt.current = { commandId: newId(), params: { id, expectedRevision: preview.revision,
      expectedVersion: preview.target.version, expectedViewStateVersion: preview.viewStateVersion } };
    if (!attempt.current) return;
    setBusy(true); setError("");
    try { const commit = await apply(attempt.current.params, { commandId: attempt.current.commandId }); setUncertain(false); setFinished(commit); }
    catch (cause) {
      const unknown = cause instanceof RpcError && cause.fault.code === "RESULT_UNKNOWN";
      setUncertain(unknown); setNeedsRefresh(!unknown); if (!unknown) attempt.current = null;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  };
  return { preview, busy, error, uncertain, needsRefresh, finished, refresh, submit, commandId: attempt.current?.commandId };
}
