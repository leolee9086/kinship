/** 导入表单状态与提交尝试分离；模糊结果保留原参数和命令ID供安全重放。 */
import { useRef, useState } from "react";
import type { DataAdapter } from "../adapter/api";
import type { CallOptions } from "../adapter/rpcClient";
import type { Commit } from "../contracts/commands";
import { RpcError } from "../contracts/errors";
import type { Request, Result } from "../contracts/rpc";
import { MAX_IMPORT_FILE_BYTES } from "../contracts/importPreview";
import { newId } from "../domain/concepts";

type Params = Request<"importGraph">["params"];
export type ImportAction = (params: Params, options: CallOptions) => Promise<Commit>;
export function usePackageImport(adapter: DataAdapter, apply: ImportAction) {
  const [data, setData] = useState<Result<"previewImportFile"> | null>(null);
  const [conflicts, setConflicts] = useState<Record<string, "keep-target" | "use-incoming">>({});
  const [accepted, setAccepted] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [uncertain, setUncertain] = useState(false), [finished, setFinished] = useState<Commit | null>(null);
  const attempt = useRef<{ commandId: string; params: Params } | null>(null);
  const resetDecisions = () => { setConflicts({}); setAccepted([]); attempt.current = null; setError(""); setFinished(null); };
  const chooseFile = async (file: File) => {
    if (busy || uncertain) return;
    setData(null); resetDecisions(); setBusy(true);
    try {
      if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error("当前图谱包导入上限为 1 MiB，请缩小导出范围。");
      setData(await adapter.previewImportFile(file));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const refresh = async () => {
    if (!data || busy || uncertain) return;
    resetDecisions(); setBusy(true);
    try { setData({ package: data.package, preview: await adapter.previewImport(data.package) }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const ready = Boolean(data && !data.preview.concepts.some(item => item.action === "blocked" || (item.action === "conflict" && !conflicts[item.id]))
    && !data.preview.externals.some(item => item.status === "missing" || item.status === "blocked" || (item.status === "changed" && !accepted.includes(item.id))));
  const submit = async () => {
    if (!data || busy || finished || (!ready && !uncertain)) return;
    if (!attempt.current) attempt.current = { commandId: newId(), params: { package: data.package,
      packageSha256: data.preview.packageSha256, expectedRevision: data.preview.revision,
      conflicts: Object.entries(conflicts).map(([id, resolution]) => ({ id, resolution })), acceptChangedExternals: accepted } };
    setBusy(true); setError("");
    try {
      const commit = await apply(attempt.current.params, { commandId: attempt.current.commandId });
      setUncertain(false); setFinished(commit);
    } catch (cause) {
      setUncertain(cause instanceof RpcError && cause.fault.code === "RESULT_UNKNOWN");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  };
  return { data, conflicts, accepted, busy, error, uncertain, finished, ready, commandId: attempt.current?.commandId,
    chooseFile, refresh, submit,
    chooseConflict: (id: string, resolution: "keep-target" | "use-incoming") => {
      if (busy || uncertain || finished) return; setConflicts(previous => ({ ...previous, [id]: resolution })); attempt.current = null;
    },
    acceptExternal: (id: string, checked: boolean) => {
      if (busy || uncertain || finished) return; setAccepted(previous => checked ? [...previous, id] : previous.filter(value => value !== id)); attempt.current = null;
    },
  };
}
