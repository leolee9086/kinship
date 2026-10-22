/** React 数据状态只依赖 DataAdapter。设置和概念写入都穿过资源请求边界。 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DataAdapter, MutationOptions } from "../adapter/api";
import type { ConceptMutation, ConceptSnapshot, GraphSettings } from "../domain/concepts";

export function useConceptGraph(adapter: DataAdapter) {
  const [snapshot, setSnapshot] = useState<ConceptSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const settings = useRef<GraphSettings | null>(null);
  const persisted = useRef<GraphSettings | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const reportError = useCallback((message: string) => setError(message), []);
  useEffect(() => {
    let active = true;
    void adapter.load().then(data => {
      if (!active) return;
      settings.current = data.settings; persisted.current = data.settings; setSnapshot(data);
    }).catch(err => { if (active) setError(String(err)); });
    return () => { active = false; };
  }, [adapter]);
  const changeSettings = useCallback((patch: Partial<GraphSettings>) => {
    if (!settings.current) throw new Error("概念仓库尚未加载");
    const next = { ...settings.current, ...patch };
    settings.current = next;
    setSnapshot(data => data ? { ...data, settings: next } : data);
    setPending(n => n + 1);
    saving.current = saving.current.then(async () => {
      try { persisted.current = await adapter.saveSettings(next); }
      catch (err) {
        setError(`设置未能保存：${String(err)}`);
        // 只回滚最后一次失败的乐观更新，不覆盖仍在队列里的更新设置。
        if (settings.current === next && persisted.current) {
          const restored = persisted.current; settings.current = restored;
          setSnapshot(data => data ? { ...data, settings: restored } : data);
        }
      }
      finally { setPending(n => n - 1); }
    });
  }, [adapter]);
  const mutate = useCallback(async (change: ConceptMutation, options?: MutationOptions) => {
    setPending(n => n + 1);
    try {
      await saving.current;
      const data = await adapter.mutate(change, options);
      settings.current = data.settings; persisted.current = data.settings; setSnapshot(data);
    } catch (err) { setError(String(err)); throw err; }
    finally { setPending(n => n - 1); }
  }, [adapter]);
  return { snapshot, pending, error, reportError, clearError: () => setError(null), changeSettings, mutate };
}
