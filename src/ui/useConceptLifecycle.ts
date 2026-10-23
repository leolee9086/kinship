/** 操作锁定调用时的UUID/版本，不随焦点变化重定向；撤销是新的相反命令。 */
import { useRef, useState } from "react";
import type { DataAdapter } from "../adapter/api";
import { RpcError } from "../contracts/errors";
import { newId } from "../domain/concepts";
type LifecycleAction = DataAdapter["setForgotten"];
interface Target { id: string; label: string; version: number; forgotten: boolean }
interface Attempt extends Target { commandId: string }
export function useConceptLifecycle(apply: LifecycleAction) {
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState("");
  const [finished, setFinished] = useState<Target | null>(null), [target, setTarget] = useState<Target | null>(null);
  const attempt = useRef<Attempt | null>(null), running = useRef(false);
  const execute = async (request: Attempt) => {
    if (running.current) return;
    running.current = true; attempt.current = request; setTarget(request); setFinished(null); setError(""); setBusy(true);
    try {
      const commit = await apply(request.id, request.forgotten, request.version, { commandId: request.commandId });
      setFinished({ ...request, version: commit.changes.put[0].version }); setUncertain(false); attempt.current = null;
    } catch (cause) {
      const unknown = cause instanceof RpcError && cause.fault.code === "RESULT_UNKNOWN";
      setUncertain(unknown); if (!unknown) attempt.current = null;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { running.current = false; setBusy(false); }
  };
  const change = (next: Target) => { if (!running.current && !uncertain) void execute({ ...next, commandId: newId() }); };
  return { busy, uncertain, error, finished, target, locked: busy || uncertain,
    change, retry: () => { if (attempt.current && !running.current) void execute(attempt.current); },
    undo: () => { if (finished) change({ ...finished, forgotten: !finished.forgotten }); },
    dismiss: () => { if (!running.current && !uncertain) { setTarget(null); setFinished(null); setError(""); } },
    commandId: attempt.current?.commandId };
}
