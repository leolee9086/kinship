/** 桌面允许两侧并列；手机一次只打开一个覆盖面板，避免不可点击的叠层。 */
import { useCallback, useEffect, useMemo, useState, type SetStateAction } from "react";
type Panel = "details" | "settings" | "perspective" | "related" | null;
interface Panels { panel: Panel; library: boolean }
export function useWorkspacePanels() {
  // 与 app.css 的手机面板断点一致；在跨断点时也重新建立互斥状态。
  const narrow = useMemo(() => window.matchMedia("(max-width: 760px)"), []);
  const [state, setState] = useState<Panels>({ panel: null, library: false });
  useEffect(() => {
    const resize = () => { if (narrow.matches) setState(previous => previous.panel && previous.library ? { ...previous, library: false } : previous); };
    narrow.addEventListener("change", resize); return () => narrow.removeEventListener("change", resize);
  }, [narrow]);
  const setPanel = useCallback((next: SetStateAction<Panel>) => setState(previous => {
    const panel = typeof next === "function" ? next(previous.panel) : next;
    return { panel, library: panel && narrow.matches ? false : previous.library };
  }), [narrow]);
  const setLibrary = useCallback((next: SetStateAction<boolean>) => setState(previous => {
    const library = typeof next === "function" ? next(previous.library) : next;
    return { library, panel: library && narrow.matches ? null : previous.panel };
  }), [narrow]);
  return { ...state, setPanel, setLibrary };
}
